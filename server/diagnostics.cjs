'use strict';
// Operational samples expire independently of the append-only research/audit history.
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { performance, monitorEventLoopDelay } = require('node:perf_hooks');
const { getHeapStatistics } = require('node:v8');
const DAY = 86400000,
  MAX_BYTES = 32 * 1024 * 1024,
  SEGMENT_BYTES = 1024 * 1024;
const FILE = /^metrics-\d{13}-[a-f0-9]{12}\.jsonl$/;
const OPERATIONS = new Set(
  `other render corpus_health learning_library parse_expression evaluate_expression predicate_catalog predicate_create composition_define node_definition source_preview source_new_preview source_create source_apply reference_approve contribution_prepare lexicon_search structure_prepare structure_search structure_resolve lexicon_inspect lexicon_create lexicon_update lexicon_tree_evaluate lexicon_tree_preview dictionary_search dictionary_lookup dictionary_entry_get dictionary_predicate assistant_context reference_verify reference_status passage_lexicon evidence_status evidence_bytes evidence_save lexical_notes_list lexical_notes_save lexical_notes_export ai_status ai_history ai_prompt_preview ai_configure ai_start ai_cancel ai_accept analysis_list analysis_get analysis_submit analysis_submit_batch analysis_accept analysis_confirm_grammar analysis_cancel analysis_retry analysis_resume analysis_steer analysis_new_conversation analysis_select_conversation analysis_composer grammar-reload submission-review refresh upload`.split(
    /\s+/,
  ),
);
const BOUNDS = [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 30000, 60000, Infinity];
const number = (value) =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.min(value, Number.MAX_SAFE_INTEGER)
    : null;
const fields = (value, names) =>
  Object.fromEntries(names.split(' ').map((key) => [key, number(value?.[key])]));
const MEMORY =
  'rssBytes heapUsedBytes heapTotalBytes externalBytes arrayBuffersBytes heapLimitBytes';
const LOOP = 'p95Ms maxMs utilization';
const RUNTIME = 'queueDepth workerPending workerFailed analysisBusy dbTotal dbIdle dbWaiting';
const CGROUP =
  'memoryCurrentBytes memoryLimitBytes oomKills cpuQuotaCores throttledUsec memoryPressureSomeAvg10 ioPressureSomeAvg10';
function histogram() {
  return { count: 0, failed: 0, rejected: 0, maxQueueMs: 0, maxMs: 0, bins: BOUNDS.map(() => 0) };
}
function add(hist, entry) {
  const queue = number(entry.queueMs) ?? 0,
    duration = queue + (number(entry.executionMs) ?? 0);
  hist.count++;
  if (entry.outcome === 'failed') hist.failed++;
  if (entry.outcome === 'rejected') hist.rejected++;
  hist.maxQueueMs = Math.max(hist.maxQueueMs, queue);
  hist.maxMs = Math.max(hist.maxMs, duration);
  hist.bins[BOUNDS.findIndex((bound) => duration <= bound)]++;
}
function summary(hist) {
  let seen = 0,
    p95Ms = null;
  if (hist.count)
    for (let i = 0; i < BOUNDS.length; i++) {
      seen += hist.bins[i];
      if (seen >= Math.ceil(hist.count * 0.95)) {
        p95Ms = Math.min(BOUNDS[i], hist.maxMs);
        break;
      }
    }
  return {
    count: hist.count,
    failed: hist.failed,
    rejected: hist.rejected,
    maxQueueMs: hist.maxQueueMs,
    p95Ms,
  };
}
async function readCgroup(read = (filename) => fs.readFile(filename, 'utf8')) {
  const readMetric = async (name) => {
    try {
      return String(await read('/sys/fs/cgroup/' + name)).slice(0, 4096);
    } catch {
      return null;
    }
  };
  const [current, limit, events, cpu, quota, memoryPressure, ioPressure] = await Promise.all(
    [
      'memory.current',
      'memory.max',
      'memory.events',
      'cpu.stat',
      'cpu.max',
      'memory.pressure',
      'io.pressure',
    ].map(readMetric),
  );
  const scalar = (text) =>
    text?.trim() && /^\d+$/.test(text.trim()) ? number(Number(text.trim())) : null;
  const keyed = (text, key) =>
    number(Number(text?.match(new RegExp('(?:^|\\n)' + key + ' (\\d+)(?:\\n|$)'))?.[1]));
  const pressure = (text) => number(Number(text?.match(/(?:^|\n)some avg10=([\d.]+)/)?.[1]));
  const parts = quota?.trim().split(/\s+/);
  return {
    available: current !== null,
    memoryCurrentBytes: scalar(current),
    memoryLimitBytes: scalar(limit),
    memoryUnlimited: limit?.trim() === 'max',
    oomKills: keyed(events, 'oom_kill'),
    cpuQuotaCores:
      parts?.[0] !== 'max' && scalar(parts?.[1]) > 0
        ? number(scalar(parts?.[0]) / scalar(parts?.[1]))
        : null,
    throttledUsec: keyed(cpu, 'throttled_usec'),
    memoryPressureSomeAvg10: pressure(memoryPressure),
    ioPressureSomeAvg10: pressure(ioPressure),
  };
}
function safeSample(sample = {}) {
  sample ??= {};
  return {
    at: number(sample.at),
    memory: fields(sample.memory, MEMORY),
    eventLoop: fields(sample.eventLoop, LOOP),
    cpuPercent: number(sample.cpuPercent),
    runtime: fields(sample.runtime, RUNTIME),
    filesystem: fields(sample.filesystem, 'totalBytes availableBytes'),
    cgroup: {
      ...fields(sample.cgroup, CGROUP),
      available: sample.cgroup?.available === true,
      memoryUnlimited: sample.cgroup?.memoryUnlimited === true,
    },
  };
}
function safeWindow(value) {
  if (value?.version !== 1 || !Number.isFinite(value.at)) return null;
  return {
    version: 1,
    at: number(value.at),
    startedAt: number(value.startedAt),
    boot: /^[a-f0-9]{12}$/.test(value.boot) ? value.boot : null,
    release: /^[a-f0-9]{7,40}$/.test(value.release) ? value.release : 'development',
    samples: number(value.samples),
    sample: safeSample(value.sample),
    peakMemory: fields(value.peakMemory, MEMORY),
    operations: (Array.isArray(value.operations) ? value.operations : [])
      .slice(0, OPERATIONS.size)
      .map((entry) => ({
        operation: OPERATIONS.has(entry.operation) ? entry.operation : 'other',
        ...fields(entry, 'count failed rejected maxQueueMs p95Ms'),
      })),
    totals: fields(value.totals, 'count failed rejected maxQueueMs p95Ms'),
  };
}
function createDiagnostics({
  directory,
  release = 'development',
  runtime = () => ({}),
  now = Date.now,
  io = fs,
  sample: injectedSample,
  automatic = true,
  maxBytes = MAX_BYTES,
  segmentBytes = SEGMENT_BYTES,
  retentionMs = 7 * DAY,
} = {}) {
  const root = path.join(directory, 'diagnostics'),
    boot = randomBytes(6).toString('hex');
  const monitor = injectedSample ? null : monitorEventLoopDelay({ resolution: 20 });
  monitor?.enable();
  let previousCpu = process.cpuUsage(),
    previousTime = performance.now(),
    previousLoop = performance.eventLoopUtilization();
  let latest = null,
    recent = [],
    startedAt = now(),
    lastFlush = now(),
    samples = 0,
    operations = new Map(),
    totals = histogram(),
    peakMemory = {};
  let sampling = null,
    writing = null,
    closed = false,
    currentFile = null,
    timer,
    storageStatus = 'starting';
  async function files() {
    const names = (await io.readdir(root)).filter((name) => FILE.test(name)).sort();
    const result = [];
    for (const name of names) {
      const stat = await io.lstat(path.join(root, name));
      if (stat.isFile() && !stat.isSymbolicLink())
        result.push({ name, bytes: stat.size, at: Number(name.slice(8, 21)) });
    }
    return result;
  }
  async function prune(incoming = 0) {
    const list = await files();
    let bytes = list.reduce((sum, item) => sum + item.bytes, 0);
    for (const item of list) {
      if (item.at >= now() - retentionMs && bytes + incoming <= maxBytes) break;
      await io.unlink(path.join(root, item.name));
      bytes -= item.bytes;
      if (currentFile === item.name) currentFile = null;
    }
  }
  const ready = (async () => {
    await io.mkdir(root, { recursive: true, mode: 0o700 });
    await prune();
    for (const item of (await files()).reverse()) {
      if (item.bytes > segmentBytes || recent.length >= 120) continue;
      const lines = (await io.readFile(path.join(root, item.name), 'utf8')).split('\n');
      for (const line of lines.reverse()) {
        if (recent.length >= 120) break;
        try {
          const value = safeWindow(JSON.parse(line));
          if (value) recent.push(value);
        } catch {}
      }
    }
    recent.reverse();
    storageStatus = 'ok';
  })().catch(() => {
    storageStatus = 'unavailable';
  });
  async function capture() {
    if (injectedSample) return safeSample({ ...(await injectedSample()), at: now() });
    const memory = process.memoryUsage(),
      cpu = process.cpuUsage(),
      time = performance.now();
    const cpuPercent =
      (cpu.user - previousCpu.user + cpu.system - previousCpu.system) /
      Math.max(1, time - previousTime) /
      10;
    previousCpu = cpu;
    previousTime = time;
    let state, filesystem;
    try {
      state = runtime();
    } catch {}
    try {
      const stat = await io.statfs(directory);
      filesystem = {
        totalBytes: stat.blocks * stat.bsize,
        availableBytes: stat.bavail * stat.bsize,
      };
    } catch {}
    return safeSample({
      at: now(),
      memory: {
        rssBytes: memory.rss,
        heapUsedBytes: memory.heapUsed,
        heapTotalBytes: memory.heapTotal,
        externalBytes: memory.external,
        arrayBuffersBytes: memory.arrayBuffers,
        heapLimitBytes: getHeapStatistics().heap_size_limit,
      },
      eventLoop: {
        p95Ms: monitor.count ? monitor.percentile(95) / 1e6 : null,
        maxMs: monitor.count ? monitor.max / 1e6 : null,
        utilization: performance.eventLoopUtilization(previousLoop).utilization,
      },
      cpuPercent,
      runtime: state,
      filesystem,
      cgroup: await readCgroup(),
    });
  }
  function flush() {
    if (writing) return writing;
    if (!samples && !totals.count) return Promise.resolve();
    const record = safeWindow({
      version: 1,
      at: now(),
      startedAt,
      boot,
      release,
      samples,
      sample: latest,
      peakMemory,
      totals: summary(totals),
      operations: [...operations].map(([operation, hist]) => ({ operation, ...summary(hist) })),
    });
    startedAt = lastFlush = now();
    samples = 0;
    operations = new Map();
    totals = histogram();
    peakMemory = {};
    monitor?.reset();
    previousLoop = performance.eventLoopUtilization();
    recent.push(record);
    recent = recent.slice(-120);
    writing = (async () => {
      await ready;
      const line = JSON.stringify(record) + '\n',
        bytes = Buffer.byteLength(line);
      if (bytes > segmentBytes || bytes > maxBytes) throw new Error('diagnostic limit');
      await io.mkdir(root, { recursive: true, mode: 0o700 });
      await prune(bytes);
      let size = currentFile ? (await io.stat(path.join(root, currentFile))).size : 0;
      if (!currentFile || size + bytes > segmentBytes) {
        currentFile = `metrics-${now()}-${randomBytes(6).toString('hex')}.jsonl`;
        await io.writeFile(path.join(root, currentFile), line, { flag: 'wx', mode: 0o600 });
      } else await io.appendFile(path.join(root, currentFile), line, { mode: 0o600 });
      storageStatus = 'ok';
    })()
      .catch(() => {
        storageStatus = 'unavailable';
        currentFile = null;
      })
      .finally(() => {
        writing = null;
      });
    return writing;
  }
  function sample() {
    if (closed) return Promise.resolve();
    if (sampling) return sampling;
    sampling = (async () => {
      await ready;
      latest = await capture();
      samples++;
      for (const [key, value] of Object.entries(latest.memory))
        if (value !== null) peakMemory[key] = Math.max(peakMemory[key] ?? 0, value);
      if (now() - lastFlush >= 30000) void flush();
    })()
      .catch(() => {})
      .finally(() => {
        sampling = null;
      });
    return sampling;
  }
  if (automatic) {
    timer = setInterval(() => {
      void sample();
    }, 5000);
    timer.unref();
    void sample();
  }
  return {
    sample,
    flush,
    ready,
    observe(entry) {
      if (closed) return;
      const operation = OPERATIONS.has(entry?.operation) ? entry.operation : 'other';
      if (!operations.has(operation)) operations.set(operation, histogram());
      add(operations.get(operation), entry ?? {});
      add(totals, entry ?? {});
    },
    async report() {
      await ready;
      return {
        available: latest !== null,
        storageStatus,
        retentionDays: retentionMs / DAY,
        maxBytes,
        intervalSeconds: 30,
        histogramApproximation: true,
        current: latest,
        latestWindow: recent.at(-1) ?? null,
        recent: recent.map(({ at, totals, sample }) => ({
          at,
          ...totals,
          heapUsedBytes: sample.memory.heapUsedBytes,
          rssBytes: sample.memory.rssBytes,
          eventLoopP95Ms: sample.eventLoop.p95Ms,
          filesystemAvailableBytes: sample.filesystem.availableBytes,
        })),
      };
    },
    async close() {
      closed = true;
      clearInterval(timer);
      await sampling;
      await writing;
      await flush();
      monitor?.disable();
    },
  };
}
module.exports = { createDiagnostics, readCgroup, MAX_BYTES };
