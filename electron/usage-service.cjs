const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');

const UI_EVENTS = new Set([
  'navigation.passage',
  'navigation.mode',
  'navigation.projection',
  'navigation.search',
  'editor.batch',
  'editor.selection',
  'editor.operation',
  'editor.undo',
  'editor.redo',
  'draft.save',
  'source.preview',
  'source.apply',
  'source.conflict',
  'review.status',
  'lexicon.search',
  'lexicon.select',
  'dictionary.search',
  'pdf.action',
  'ai.action',
  'ui.theme',
  'ui.resize',
  'ui.error',
  'usage.export',
]);
const DETAIL_KEYS = new Set([
  'provider',
  'model',
  'mode',
  'view',
  'from',
  'to',
  'action',
  'phase',
  'method',
  'source',
  'status',
  'reason',
  'errorCode',
  'errorMessage',
  'category',
  'scope',
  'field',
  'count',
  'editCount',
  'changedCharacters',
  'resultCount',
  'nodeCount',
  'attempt',
  'reused',
  'cancelled',
  'changed',
  'hasAnalysis',
  'hasTranslation',
  'success',
  'buildId',
  'engineFingerprint',
]);
const OUTCOMES = new Set(['started', 'succeeded', 'failed', 'cancelled', 'changed', 'ignored']);
const LOG_PATTERN = /^events(?:-[\dTZ.-]+-[a-f0-9-]+)?\.jsonl$/;
const DEFAULT_MAX_BYTES = 1_048_576;
const DEFAULT_MAX_FILES = 24;

// Logs describe operations, never their input/output payloads. Redaction is a second
// boundary for generic exception messages, not permission to log arbitrary content.
function scrub(value, maximum = 320) {
  return String(value)
    .replace(/\b(?:sk|sess|ghp|gho|github_pat)[-_][A-Za-z0-9_-]{8,}\b/g, '[secret]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[secret]')
    .replace(/\bBearer\s+[^\s,;]+/gi, 'Bearer [secret]')
    .replace(
      /((?:api[_-]?key|access[_-]?token|refresh[_-]?token|token|authorization|password|secret)["']?\s*[=:]\s*)(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi,
      '$1[secret]',
    )
    .replace(/(--(?:api-key|token|password)\s+)(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi, '$1[secret]')
    .replace(/https?:\/\/[^\s<>"']+/gi, '[url]')
    .replace(/(?:[A-Za-z]:\\|\/(?:Users|home|private|tmp|var)\/)[^\s<>"']+/g, '[path]')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[email]')
    .replace(/[\x00-\x1f\x7f]+/g, ' ')
    .slice(0, maximum);
}

function correlation(value) {
  if (typeof value !== 'string' || !value) return undefined;
  if (/^[a-zA-Z0-9:._-]{1,180}$/.test(value)) return value;
  return `hash:${createHash('sha256').update(value).digest('hex').slice(0, 24)}`;
}

function cleanEvent(input, fromUi = false) {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new Error('Evento de uso inválido.');
  if (typeof input.event !== 'string' || !/^[a-z][a-z0-9_.-]{1,79}$/.test(input.event))
    throw new Error('Nome de evento de uso inválido.');
  if (fromUi && !UI_EVENTS.has(input.event)) throw new Error('Evento de interface não permitido.');
  const event = { event: input.event, origin: fromUi ? 'renderer' : 'main' };
  for (const key of ['projectId', 'passageId', 'revisionId', 'requestId']) {
    const value = correlation(input[key]);
    if (value) event[key] = value;
  }
  if (OUTCOMES.has(input.outcome)) event.outcome = input.outcome;
  if (typeof input.durationMs === 'number' && Number.isFinite(input.durationMs)) {
    event.durationMs = Math.round(Math.max(0, Math.min(input.durationMs, 86_400_000)));
  }
  const details = {};
  if (input.details && typeof input.details === 'object' && !Array.isArray(input.details)) {
    for (const [key, value] of Object.entries(input.details)) {
      if (!DETAIL_KEYS.has(key)) continue;
      if (typeof value === 'boolean') details[key] = value;
      else if (typeof value === 'number' && Number.isFinite(value))
        details[key] = Math.max(-1e9, Math.min(1e9, value));
      else if (typeof value === 'string')
        details[key] = scrub(value, key === 'errorMessage' ? 320 : 100);
    }
  }
  if (Object.keys(details).length) event.details = details;
  return event;
}

async function logFiles(directory) {
  try {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && LOG_PATTERN.test(entry.name))
      .map((entry) => path.join(directory, entry.name))
      .sort();
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

async function readUsage(directory, { days = 7, now = Date.now() } = {}) {
  if (!Number.isFinite(days) || days <= 0 || days > 3650)
    throw new Error('O período deve ser de 1 a 3650 dias.');
  const cutoff = now - days * 86_400_000;
  const files = await logFiles(directory);
  const records = [];
  let unreadableLines = 0;
  let bytes = 0;
  for (const filename of files) {
    const text = await fs.readFile(filename, 'utf8');
    bytes += Buffer.byteLength(text);
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      try {
        const value = JSON.parse(line);
        if (
          !value ||
          value.version !== 1 ||
          typeof value.event !== 'string' ||
          typeof value.sessionId !== 'string' ||
          !Number.isFinite(Date.parse(value.at))
        )
          throw new Error('Invalid record');
        // Export/report only the known schema even if a file was edited externally.
        const clean = cleanEvent(value, value.origin === 'renderer');
        const at = new Date(value.at).toISOString();
        if (Date.parse(at) >= cutoff && Date.parse(at) <= now)
          records.push({
            version: 1,
            at,
            sessionId: correlation(value.sessionId),
            installationId: correlation(value.installationId),
            appVersion: scrub(value.appVersion || 'unknown', 40),
            ...(value.buildId ? { buildId: correlation(value.buildId) } : {}),
            ...(value.profileLabel ? { profileLabel: scrub(value.profileLabel, 40) } : {}),
            ...clean,
          });
      } catch {
        unreadableLines++;
      }
    }
  }
  records.sort((a, b) => a.at.localeCompare(b.at));
  return {
    records,
    files: files.length,
    bytes,
    unreadableLines,
    days,
    cutoff: new Date(cutoff).toISOString(),
    until: new Date(now).toISOString(),
  };
}

function summarizeUsage(data) {
  const counts = new Map();
  const errors = new Map();
  const latencies = new Map();
  const sessions = new Map();
  const requests = new Map();
  const transitions = new Map();
  const repeatedActions = new Map();
  const backtracks = [];
  const increment = (map, key) => map.set(key, (map.get(key) || 0) + 1);
  for (const record of data.records) {
    increment(counts, record.event);
    const session = sessions.get(record.sessionId) || {
      firstAt: record.at,
      lastAt: record.at,
      events: 0,
      appVersions: new Set(),
      buildIds: new Set(),
      profileLabels: new Set(),
      installationIds: new Set(),
      passages: new Set(),
      previousUi: null,
      passageHistory: [],
    };
    session.lastAt = record.at;
    session.events++;
    session.appVersions.add(record.appVersion);
    if (record.buildId) session.buildIds.add(record.buildId);
    if (record.profileLabel) session.profileLabels.add(record.profileLabel);
    if (record.installationId) session.installationIds.add(record.installationId);
    if (record.passageId) session.passages.add(record.passageId);
    sessions.set(record.sessionId, session);
    if (record.requestId) {
      const key = `${record.sessionId}|${record.requestId}`;
      const request = requests.get(key) || {
        requestId: record.requestId,
        sessionId: record.sessionId,
        firstAt: record.at,
        lastAt: record.at,
        events: 0,
        phases: [],
        outcome: 'unspecified',
      };
      request.lastAt = record.at;
      request.events++;
      for (const field of ['projectId', 'passageId', 'revisionId']) {
        if (record[field]) request[field] = record[field];
      }
      const phase = record.details?.phase;
      if (typeof phase === 'string' && phase !== request.phases.at(-1)) request.phases.push(phase);
      if (record.outcome) request.outcome = record.outcome;
      if (typeof record.durationMs === 'number') request.lastMeasuredDurationMs = record.durationMs;
      requests.set(key, request);
    }
    if (record.outcome === 'failed' || record.event.endsWith('.error')) {
      const details = record.details || {};
      const key = [record.event, details.errorCode || 'unknown', details.phase || ''].join('|');
      const group = errors.get(key) || {
        event: record.event,
        errorCode: details.errorCode || 'unknown',
        phase: details.phase || '',
        count: 0,
        example: details.errorMessage || '',
        lastAt: record.at,
        passages: new Set(),
        requestIds: new Set(),
      };
      group.count++;
      group.lastAt = record.at;
      if (record.passageId) group.passages.add(record.passageId);
      if (record.requestId) group.requestIds.add(record.requestId);
      errors.set(key, group);
    }
    if (typeof record.durationMs === 'number') {
      const key = `${record.event}|${record.outcome || 'unspecified'}`;
      if (!latencies.has(key)) latencies.set(key, []);
      latencies.get(key).push(record.durationMs);
    }
    if (record.origin === 'renderer') {
      const previous = session.previousUi;
      if (previous) {
        increment(transitions, `${previous.event} → ${record.event}`);
        if (
          previous.event === record.event &&
          previous.passageId === record.passageId &&
          Date.parse(record.at) - Date.parse(previous.at) <= 30_000
        )
          increment(repeatedActions, record.event);
      }
      session.previousUi = record;
    }
    if (record.event === 'navigation.passage' && record.passageId) {
      const history = session.passageHistory;
      if (history.at(-1)?.passageId !== record.passageId) {
        if (
          history.length >= 2 &&
          history.at(-2).passageId === record.passageId &&
          Date.parse(record.at) - Date.parse(history.at(-2).at) <= 120_000
        )
          backtracks.push({
            sessionId: record.sessionId,
            passageId: record.passageId,
            via: history.at(-1).passageId,
            at: record.at,
          });
        history.push({ passageId: record.passageId, at: record.at });
        if (history.length > 2) history.shift();
      }
    }
  }
  const rows = (map, keyName) =>
    [...map]
      .map(([key, count]) => ({ [keyName]: key, count }))
      .sort((a, b) => b.count - a.count || a[keyName].localeCompare(b[keyName]));
  return {
    version: 1,
    period: { days: data.days, from: data.cutoff, until: data.until },
    storage: { files: data.files, bytes: data.bytes, unreadableLines: data.unreadableLines },
    totalEvents: data.records.length,
    sessions: [...sessions].map(([sessionId, session]) => ({
      sessionId,
      firstAt: session.firstAt,
      lastAt: session.lastAt,
      observedSpanMs: Date.parse(session.lastAt) - Date.parse(session.firstAt),
      events: session.events,
      passages: session.passages.size,
      appVersions: [...session.appVersions],
      buildIds: [...session.buildIds],
      profileLabels: [...session.profileLabels],
      installationIds: [...session.installationIds],
    })),
    actions: rows(counts, 'event'),
    requests: [...requests.values()],
    errors: [...errors.values()]
      .map((entry) => ({
        ...entry,
        passages: [...entry.passages],
        requestIds: [...entry.requestIds],
      }))
      .sort((a, b) => b.count - a.count),
    latencies: [...latencies]
      .map(([key, values]) => {
        values.sort((a, b) => a - b);
        const [event, outcome] = key.split('|');
        return {
          event,
          outcome,
          count: values.length,
          medianMs: values[Math.floor((values.length - 1) / 2)],
          p95Ms: values[Math.ceil(values.length * 0.95) - 1],
          maximumMs: values.at(-1),
        };
      })
      .sort((a, b) => b.p95Ms - a.p95Ms),
    transitions: rows(transitions, 'sequence').slice(0, 30),
    repeatedActionsWithin30Seconds: rows(repeatedActions, 'event'),
    passageBacktracksWithin2Minutes: backtracks,
    interpretation:
      'Frequências, repetições e retornos descrevem ações observadas; não demonstram desperdício, intenção, qualidade editorial ou tempo ativo. Períodos sem registros podem incluir uso desativado ou arquivos já rotacionados.',
  };
}

function createUsageService({
  directory,
  appVersion = 'unknown',
  buildId,
  clock = () => Date.now(),
  maxBytes = DEFAULT_MAX_BYTES,
  maxFiles = DEFAULT_MAX_FILES,
}) {
  if (typeof directory !== 'string' || !directory) throw new Error('Diretório de uso necessário.');
  if (!Number.isInteger(maxBytes) || maxBytes < 512 || !Number.isInteger(maxFiles) || maxFiles < 2)
    throw new Error('Limites de registro inválidos.');
  const sessionId = randomUUID();
  const activePath = path.join(directory, 'events.jsonl');
  const configPath = path.join(directory, 'settings.json');
  let config = { version: 1, installationId: randomUUID(), enabled: true, profileLabel: '' };
  let initialized = false;
  let queue = Promise.resolve();
  let lastError = null;
  let closed = false;
  let activeBytes = 0;

  async function saveConfig() {
    const temporary = path.join(directory, `settings.${randomUUID()}.tmp`);
    const handle = await fs.open(temporary, 'wx', 0o600);
    try {
      await handle.writeFile(JSON.stringify(config, null, 2));
      await handle.sync();
    } finally {
      await handle.close();
    }
    await fs.rename(temporary, configPath);
  }

  async function append(event) {
    if (!config.enabled) return { recorded: false, reason: 'disabled' };
    const record = {
      version: 1,
      at: new Date(clock()).toISOString(),
      sessionId,
      installationId: config.installationId,
      appVersion: scrub(appVersion, 40),
      ...(buildId ? { buildId: correlation(buildId) } : {}),
      ...(config.profileLabel ? { profileLabel: config.profileLabel } : {}),
      ...event,
    };
    const line = `${JSON.stringify(record)}\n`;
    const length = Buffer.byteLength(line);
    if (activeBytes && activeBytes + length > maxBytes) {
      const archive = path.join(
        directory,
        `events-${record.at.replace(/:/g, '-')}-${randomUUID()}.jsonl`,
      );
      await fs.rename(activePath, archive);
      activeBytes = 0;
      const archives = (await logFiles(directory))
        .filter((filename) => filename !== activePath)
        .sort();
      for (const filename of archives.slice(0, Math.max(0, archives.length - maxFiles + 1)))
        await fs.unlink(filename);
    }
    const handle = await fs.open(activePath, 'a', 0o600);
    try {
      await handle.writeFile(line);
      await handle.sync();
    } finally {
      await handle.close();
    }
    activeBytes += length;
    return { recorded: true, sessionId, at: record.at };
  }

  async function initialize() {
    if (initialized) return;
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    try {
      const existing = JSON.parse(await fs.readFile(configPath, 'utf8'));
      if (
        existing.version !== 1 ||
        typeof existing.enabled !== 'boolean' ||
        !/^[a-f0-9-]{36}$/.test(existing.installationId) ||
        typeof existing.profileLabel !== 'string'
      )
        throw new Error('Configuração de uso inválida.');
      config = {
        version: 1,
        installationId: existing.installationId,
        enabled: existing.enabled,
        profileLabel: scrub(existing.profileLabel, 40),
      };
    } catch (error) {
      if (error.code === 'ENOENT') await saveConfig();
      else {
        // Never silently overwrite a malformed user setting or infer consent from it.
        config.enabled = false;
        lastError =
          'Configuração de uso ilegível; arquivo preservado. Reative os registros nas configurações para recuperar.';
      }
    }
    try {
      const stat = await fs.stat(activePath);
      activeBytes = stat.size;
      if (activeBytes) {
        const handle = await fs.open(activePath, 'r+');
        try {
          const lastByte = Buffer.alloc(1);
          await handle.read(lastByte, 0, 1, activeBytes - 1);
          if (lastByte[0] !== 10) {
            await handle.write('\n', activeBytes, 'utf8');
            await handle.sync();
            activeBytes++;
          }
        } finally {
          await handle.close();
        }
      }
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    initialized = true;
    await append(cleanEvent({ event: 'session.start', outcome: 'succeeded' }));
  }

  function enqueue(work) {
    const operation = queue.then(async () => {
      await initialize();
      return work();
    });
    queue = operation.catch((error) => {
      lastError = scrub(error.message || error);
    });
    return operation;
  }

  function record(input, fromUi = false) {
    let event;
    try {
      event = cleanEvent(input, fromUi);
    } catch (error) {
      return Promise.reject(error);
    }
    if (closed) return Promise.resolve({ recorded: false, reason: 'closed' });
    return enqueue(() => append(event));
  }

  return {
    record,
    recordUi: (input) => record(input, true),
    status: () =>
      enqueue(async () => ({
        enabled: config.enabled,
        profileLabel: config.profileLabel,
        sessionId,
        installationId: config.installationId,
        directory,
        maxBytes,
        maxFiles,
        ...(await readUsage(directory, { days: 3650, now: clock() }).then((data) => ({
          files: data.files,
          bytes: data.bytes,
          unreadableLines: data.unreadableLines,
        }))),
        lastError,
      })),
    report: (options = {}) =>
      enqueue(async () => summarizeUsage(await readUsage(directory, { ...options, now: clock() }))),
    export: (options = {}) =>
      enqueue(async () => ({
        filename: `studio-usage-${new Date(clock()).toISOString().slice(0, 10)}.jsonl`,
        content:
          (await readUsage(directory, { ...options, now: clock() })).records
            .map((record) => JSON.stringify(record))
            .join('\n') + '\n',
      })),
    configure: (options) =>
      enqueue(async () => {
        if (
          !options ||
          typeof options !== 'object' ||
          (options.enabled !== undefined && typeof options.enabled !== 'boolean') ||
          (options.profileLabel !== undefined && typeof options.profileLabel !== 'string')
        )
          throw new Error('Configuração de uso inválida.');
        if (lastError?.startsWith('Configuração de uso ilegível')) {
          await fs.rename(
            configPath,
            path.join(directory, `settings-corrupt-${randomUUID()}.json`),
          );
        }
        const previous = config.enabled;
        config = {
          ...config,
          ...(options.enabled !== undefined ? { enabled: options.enabled } : {}),
          ...(options.profileLabel !== undefined
            ? { profileLabel: scrub(options.profileLabel.trim(), 40) }
            : {}),
        };
        await saveConfig();
        lastError = null;
        if (config.enabled)
          await append(
            cleanEvent({
              event: 'usage.configure',
              outcome: 'succeeded',
              details: { changed: previous !== config.enabled },
            }),
          );
        return { enabled: config.enabled, profileLabel: config.profileLabel };
      }),
    close: () => {
      if (closed) return queue;
      closed = true;
      return enqueue(() => append(cleanEvent({ event: 'session.end', outcome: 'succeeded' })));
    },
  };
}

module.exports = { createUsageService, readUsage, summarizeUsage, scrub, cleanEvent, UI_EVENTS };
