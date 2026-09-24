import type { AnalysisJob } from './analysis';
import type { LexicalNote } from './passage-lexicon';

type SavedNoteIdentity = Pick<
  LexicalNote,
  'id' | 'version' | 'scope' | 'sourceId' | 'passageId' | 'fields'
>;
const canonicalPassage = (value?: string) => value?.replace(/^pending:/, 'passage:');

/** Reusable notes may apply to a new candidate; occurrence notes may only apply
 * within this source/passage. Hash only saved identities and latest versions,
 * never notebook text/history into a localStorage operation key.
 */
export async function analysisNoteSnapshot(
  records: SavedNoteIdentity[],
  sourceId: string,
  passageId: string,
) {
  if (!Array.isArray(records) || records.length > 10000)
    throw new Error('O caderno de interpretações não pôde ser identificado.');
  const versions = records
    .filter((note) => {
      if (
        !note ||
        typeof note.id !== 'string' ||
        note.id.length > 500 ||
        !Number.isSafeInteger(note.version) ||
        note.version < 1 ||
        !note.fields ||
        !['entry', 'occurrence'].includes(note.scope)
      )
        throw new Error('Uma interpretação salva tem identidade inválida. Recarregue as notas.');
      return (
        Object.values(note.fields).some((value) => typeof value === 'string' && value.trim()) &&
        (note.scope === 'entry' ||
          (note.sourceId === sourceId &&
            canonicalPassage(note.passageId) === canonicalPassage(passageId)))
      );
    })
    .map((note) => [note.id, note.version] as const)
    .sort(([left], [right]) => left.localeCompare(right));
  const hash = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(versions)),
  );
  return (
    'sha256:' +
    Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('')
  );
}

export function submissionOperation(
  input: {
    submission: { passageId: string; revisionId: string; task: string; scope: string };
    provider: unknown;
    engine: string;
    conversation?: string;
    noteSnapshot: string;
  },
  jobs: AnalysisJob[],
  storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage,
  createId: () => string = () => crypto.randomUUID(),
) {
  // Identical pending sends remain idempotent; changed saved meanings or a
  // completed prior result form a new deliberate submission.
  const previous = jobs
    .filter(
      (job) =>
        job.passageId === input.submission.passageId &&
        job.input.baseRevisionId === input.submission.revisionId &&
        job.input.task === input.submission.task &&
        job.input.scope === input.submission.scope &&
        !['queued', 'running', 'cancelling'].includes(job.status),
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const key = `pydicate-studio:submission:v1:${JSON.stringify({ ...input, ...(previous ? { afterResult: previous.id } : {}) })}`;
  const saved = storage.getItem(key);
  if (saved) return saved;
  const id = createId();
  storage.setItem(key, id);
  return id;
}
