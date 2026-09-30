'use strict';
// Private host/app handshake. A maintenance lease freezes new work only after
// recent interaction and all finite requests have drained; SSE/polls stay open.
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const IDLE_MS = 10 * 60_000;
const PASSIVE = new Set(['/api/events', '/api/presence', '/api/me', '/api/usage', '/api/upstream-status']);
function createIdle({ directory, now = Date.now, idleMs = IDLE_MS, hasWork = () => false }) {
  const root = path.join(directory, 'operations'), instance = randomUUID();
  let busy = 0, lastActivityAt = now(), lease = null, draining = null, closed = false, writing = null;
  const state = () => ({ version: 1, instance, heartbeatAt: now(), lastActivityAt, busyRequests: busy + Number(hasWork()),
    maintenanceRequestId: lease && lease.expiresAt > now() ? lease.id : null });
  function activity() { lastActivityAt = now(); }
  function begin(route) {
    if (PASSIVE.has(route)) return () => {};
    if ((lease && lease.expiresAt > now()) || (draining && draining.expiresAt > now())) {
      const error = new Error('Atualização do servidor em andamento. Aguarde um momento.');
      Object.assign(error, { status: 503, code: 'UPSTREAM_UPDATING' }); throw error;
    }
    busy++;
    let done = false, interactive = !['/api/invoke', '/api/drafts/load', '/api/comments', '/api/submissions'].includes(route);
    if (interactive) activity();
    const finish = () => { if (!done) { done = true; busy--; if (interactive) activity(); } };
    finish.activity = () => { interactive = true; activity(); };
    return finish;
  }
  async function tick() {
    if (writing) return writing;
    writing = (async () => {
      await fs.mkdir(root, { recursive: true, mode: 0o700 });
      let request;
      try { request = JSON.parse(await fs.readFile(path.join(root, 'maintenance.json'), 'utf8')); }
      catch (error) { if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error; }
      const current = now();
      const valid = request?.version === 1 && /^[a-f0-9-]{36}$/.test(request.id || '') &&
        Number.isFinite(request.expiresAt) && request.expiresAt > current && request.expiresAt <= current + 120_000;
      draining = valid && request.mode === 'deploy' ? request : null;
      if (!valid || (lease && request.id !== lease.id)) lease = null;
      if (valid && !lease && !hasWork() && busy === 0 && (request.mode === 'deploy' || current - lastActivityAt >= idleMs)) lease = { id: request.id, expiresAt: request.expiresAt };
      const temporary = path.join(root, '.idle-' + instance + '.json');
      await fs.writeFile(temporary, JSON.stringify(state()) + '\n', { mode: 0o600 });
      if (!closed) await fs.rename(temporary, path.join(root, 'idle.json'));
      else await fs.unlink(temporary).catch(() => {});
    })().finally(() => { writing = null; });
    return writing;
  }
  const timer = setInterval(() => { void tick().catch(() => {}); }, 1000); timer.unref();
  void tick().catch(() => {});
  return { activity, begin, state, tick,
    close: async () => { closed = true; clearInterval(timer); await writing?.catch(() => {}); },
  };
}
async function upstreamStatus(directory) {
  const base = { enabled: true, intervalMinutes: 15, idleMinutes: 10 };
  try {
    const value = JSON.parse(await fs.readFile(path.join(directory, 'operations/upstream.json'), 'utf8'));
    const states = new Set(['checking', 'current', 'waiting', 'updated', 'failed']);
    return { ...base, enabled: value.enabled !== false, state: states.has(value.state) ? value.state : 'waiting',
      checkedAt: value.checkedAt || null, updatedAt: value.updatedAt || null,
      reason: typeof value.reason === 'string' ? value.reason.slice(0, 200) : null,
      repositories: (Array.isArray(value.repositories) ? value.repositories : []).filter(r => ['nhe-enga', 'oldtupicorpus'].includes(r.name)).map(r => ({
        name: r.name, head: /^[a-f0-9]{40}$/.test(r.head || '') ? r.head : null,
        upstream: /^[a-f0-9]{40}$/.test(r.upstream || '') ? r.upstream : null,
        state: ['current', 'available', 'dirty', 'diverged', 'updated'].includes(r.state) ? r.state : 'current',
      })),
    };
  } catch { return { ...base, state: 'waiting', reason: 'first-check', repositories: [] }; }
}
module.exports = { createIdle, upstreamStatus, IDLE_MS };
