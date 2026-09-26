'use strict';
const path = require('node:path');
const os = require('node:os');

function config(env = process.env) {
  const origin = new URL(env.COLLAB_PUBLIC_URL || 'https://studio.academiatupi.com');
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname);
  if (
    origin.username || origin.password || origin.search || origin.hash || origin.pathname !== '/' ||
    (origin.protocol !== 'https:' && !(origin.protocol === 'http:' && local && env.COLLAB_ALLOW_HTTP === '1'))
  ) throw new Error('COLLAB_PUBLIC_URL must be an HTTPS origin (no path). HTTP requires COLLAB_ALLOW_HTTP=1 and localhost.');
  const port = Number(env.COLLAB_PORT || 8787);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid COLLAB_PORT.');
  const host = env.COLLAB_HOST || '127.0.0.1';
  if (origin.protocol === 'http:' && !['127.0.0.1', '::1', 'localhost'].includes(host)) {
    throw new Error('Development HTTP must bind to loopback.');
  }
  return {
    origin: origin.origin, secure: origin.protocol === 'https:', host, port,
    trustProxy: env.COLLAB_TRUST_PROXY === '1',
    stateDirectory: path.resolve(env.COLLAB_STATE_DIR || path.join(os.homedir(), '.local/share/pydicate-studio-collab')),
    parent: path.resolve(env.PYDICATE_PROJECT_PARENT || path.join(__dirname, '../..')),
    applicationDirectory: path.resolve(__dirname, '..'),
    distDirectory: path.resolve(__dirname, '../dist'),
    python: env.PYDICATE_PYTHON || 'python3',
    telemetryDays: 90,
  };
}
module.exports = { config };
