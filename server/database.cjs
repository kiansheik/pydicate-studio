'use strict';
const { Pool, types } = require('pg');
const { AsyncLocalStorage } = require('node:async_hooks');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
// Millisecond timestamps and identities are exact within the application's range.
types.setTypeParser(20, value => {
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw new Error('Database integer exceeds the safe range.');
  return number;
});
class Database {
  constructor(connectionString, { schema = 'public' } = {}) {
    if (!connectionString && process.env.PGPASSWORD_FILE) {
      const password = require('node:fs').readFileSync(process.env.PGPASSWORD_FILE,'utf8').trim();
      connectionString = {host:process.env.PGHOST || 'postgres',port:Number(process.env.PGPORT||5432),user:process.env.PGUSER||'studio_app',database:process.env.PGDATABASE||'studio_prod',password};
    }
    if (!connectionString) throw new Error('COLLAB_DATABASE_URL or PostgreSQL secret-file configuration is required. No SQLite fallback.');
    if (!/^[a-z][a-z0-9_]{0,62}$/.test(schema)) throw new Error('Invalid database schema.');
    this.schema = schema;
    this.context = new AsyncLocalStorage();
    this.pool = new Pool({ ...(typeof connectionString === 'string' ? {connectionString} : connectionString), max: 8, connectionTimeoutMillis: 10_000,
      idleTimeoutMillis: 30_000, statement_timeout: 30_000, application_name: 'pydicate-studio',
      options: `-c search_path=${schema},pg_catalog` });
    this.pool.on('error', () => { this.unavailable = true; });
  }
  query(sql, values = []) { if(this.unavailable) return Promise.reject(new Error('Database connection or workspace ownership lost; restart required.')); return (this.context.getStore() || this.pool).query(sql, values); }
  prepare(sql) {
    return {
      get: async (...values) => (await this.query(sql, values)).rows[0],
      all: async (...values) => (await this.query(sql, values)).rows,
      run: async (...values) => { const result = await this.query(sql, values);
        return { changes: result.rowCount, lastInsertRowid: result.rows[0]?.id }; },
    };
  }
  async transaction(fn, { readOnly = false } = {}) {
    if(this.unavailable) throw new Error('Database connection or workspace ownership lost; restart required.');
    if (this.context.getStore()) return fn();
    const client = await this.pool.connect();
    try {
      await client.query(readOnly ? 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY' : 'BEGIN');
      // Small metadata writes are serialized across server/admin/migration processes.
      // Network calls and password hashing must remain outside these transactions.
      if (!readOnly) await client.query('SELECT pg_advisory_xact_lock(731868601)');
      const value = await this.context.run(client, fn);
      await client.query('COMMIT');
      return value;
    } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
    finally { client.release(); }
  }
  async migrate() {
    await this.transaction(async () => {
      await this.query(`CREATE TABLE IF NOT EXISTS schema_migrations
        (version TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
      const directory = path.join(__dirname, 'migrations');
      const files = (await fs.readdir(directory)).filter(name => /^\d{3}_[a-z0-9_]+\.sql$/.test(name)).sort();
      const rows = (await this.query('SELECT * FROM schema_migrations ORDER BY version')).rows;
      if (rows.some(row => !files.includes(row.version))) throw new Error('Database requires a newer Studio release.');
      for (const name of files) {
        const sql = await fs.readFile(path.join(directory, name), 'utf8');
        const checksum = createHash('sha256').update(sql).digest('hex');
        const installed = rows.find(row => row.version === name);
        if (installed && installed.checksum !== checksum) throw new Error('Applied migration checksum changed: ' + name);
        if (installed) continue;
        await this.query(sql);
        await this.query('INSERT INTO schema_migrations(version,checksum) VALUES($1,$2)', [name, checksum]);
      }
    });
  }
  async ownWorkspace() {
    this.owner = await this.pool.connect();
    const result = await this.owner.query('SELECT pg_try_advisory_lock(731868602) AS owned');
    if (!result.rows[0].owned) { this.owner.release(); this.owner = null; throw new Error('Another server owns this collaboration database.'); }
    this.owner.on('error', () => { this.unavailable = true; });
  }
  async close() {
    if (this.owner) { await this.owner.query('SELECT pg_advisory_unlock(731868602)').catch(() => {}); this.owner.release(); this.owner = null; }
    await this.pool.end();
  }
}
module.exports = { Database };
