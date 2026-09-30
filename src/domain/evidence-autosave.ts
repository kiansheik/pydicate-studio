import type { EvidenceStatus, WorkingEvidence } from './evidence';

export function evidenceContent(working: WorkingEvidence): string {
  return JSON.stringify({
    assetId: working.assetId,
    regions: working.regions,
    view: working.view,
    guide: working.guide ?? null,
  });
}

export interface EvidenceSaveEvent {
  key: string;
  working: WorkingEvidence;
  state: 'waiting' | 'saving' | 'saved' | 'error';
  status?: EvidenceStatus;
  error?: unknown;
}

interface Entry {
  key: string;
  params: Record<string, unknown>;
  working: WorkingEvidence;
  dirty: boolean;
  paused?: boolean;
  timer?: ReturnType<typeof setTimeout>;
  running?: Promise<EvidenceStatus | undefined>;
  status?: EvidenceStatus;
}

/** One in-flight write per passage, with the latest edit coalesced behind it. */
export class EvidenceAutosaver {
  private entries = new Map<string, Entry>();

  constructor(
    private save: (params: Record<string, unknown>) => Promise<EvidenceStatus>,
    private changed: (event: EvidenceSaveEvent) => void,
    private delay = 400,
  ) {}

  update(key: string, params: Record<string, unknown>, working: WorkingEvidence, schedule = true) {
    let entry = this.entries.get(key);
    if (!entry) {
      entry = { key, params, working, dirty: true };
      this.entries.set(key, entry);
    } else {
      if (evidenceContent(entry.working) === evidenceContent(working) && !entry.paused) return;
      entry.params = params;
      entry.working = working;
      entry.dirty = true;
    }
    entry.paused = !schedule;
    clearTimeout(entry.timer);
    this.changed({ key, working, state: entry.running ? 'saving' : 'waiting' });
    if (schedule) entry.timer = setTimeout(() => void this.flush(key).catch(() => {}), this.delay);
  }

  pause(key: string) {
    const entry = this.entries.get(key);
    if (entry) {
      clearTimeout(entry.timer);
      entry.paused = true;
    }
  }

  discard(key: string) {
    const entry = this.entries.get(key);
    if (entry?.running) return false;
    clearTimeout(entry?.timer);
    this.entries.delete(key);
    return true;
  }

  async flush(key: string): Promise<EvidenceStatus | undefined> {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    clearTimeout(entry.timer);
    if (entry.running) {
      await entry.running;
      return entry.dirty && !entry.paused ? this.flush(key) : entry.status;
    }
    if (!entry.dirty || entry.paused) return entry.status;
    const submitted = entry.working;
    this.changed({ key, working: submitted, state: 'saving' });
    const running = this.save({
      ...entry.params,
      expectedRevision: submitted.revision,
      ...(submitted.passageFingerprint
        ? { expectedPassageFingerprint: submitted.passageFingerprint }
        : {}),
      assetId: submitted.assetId,
      regions: submitted.regions,
      view: submitted.view,
      ...(submitted.guide ? { guide: submitted.guide } : {}),
    }).then(
      (status) => {
        entry.status = status;
        entry.dirty = evidenceContent(submitted) !== evidenceContent(entry.working);
        entry.working = {
          ...entry.working,
          revision: status.revision,
          baseline: JSON.stringify(status.passage),
          passageFingerprint: status.passageFingerprint,
        };
        this.changed({
          key,
          working: entry.working,
          state: entry.dirty ? 'waiting' : 'saved',
          status,
        });
        return status;
      },
      (error: unknown) => {
        clearTimeout(entry.timer);
        this.changed({ key, working: entry.working, state: 'error', error });
        throw error;
      },
    );
    entry.running = running;
    try {
      await running;
    } finally {
      entry.running = undefined;
    }
    return entry.dirty && !entry.paused ? this.flush(key) : entry.status;
  }
}
