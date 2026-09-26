'use strict';
const { randomBytes, randomUUID, createHash, scrypt, timingSafeEqual } = require('node:crypto');
const { promisify } = require('node:util');
const { fault, text } = require('./store.cjs');
const derive = promisify(scrypt);
const token = () => randomBytes(32).toString('base64url');
const digest = value => createHash('sha256').update(value).digest('hex');
const OPTIONS = { N: 131072, r: 8, p: 1, maxmem: 192 * 1024 * 1024 };
const SESSION_MS = 12 * 60 * 60 * 1000;
const IDLE_MS = 2 * 60 * 60 * 1000;
let hashing = 0;
const waiting = [];
async function hashSlot(fn) {
  if (hashing >= 2) {
    if (waiting.length >= 16) throw fault(429, 'AUTH_BUSY', 'Aguarde e tente novamente.');
    await new Promise(resolve => waiting.push(resolve));
  }
  hashing++;
  try { return await fn(); }
  finally { hashing--; waiting.shift()?.(); }
}
function password(value) {
  text(value, 256);
  if ([...value].length < 15) throw fault(400, 'PASSWORD_LENGTH', 'Use uma senha com pelo menos 15 caracteres.');
  return value;
}
async function hashPassword(value) {
  password(value);
  const salt = token();
  const key = await hashSlot(() => derive(value, salt, 64, OPTIONS));
  return `scrypt$131072$8$1$${salt}$${key.toString('base64url')}`;
}
// A fixed dummy salt and hash keep unknown-account checks on the same KDF path.
const DUMMY = 'scrypt$131072$8$1$unknown-account-dummy-salt$' + Buffer.alloc(64).toString('base64url');
async function checkPassword(value, encoded) {
  if (typeof value !== 'string' || value.length > 256) return false;
  const fields = (encoded || DUMMY).split('$');
  if (fields.length !== 6 || fields.slice(0,4).join('$') !== 'scrypt$131072$8$1') return false;
  const expected = Buffer.from(fields[5], 'base64url');
  const actual = await hashSlot(() => derive(value, fields[4], 64, OPTIONS));
  return expected.length === actual.length && timingSafeEqual(actual, expected) && !!encoded;
}
function email(value) {
  text(value, 254);
  value = value.trim().toLowerCase();
  if (!/^[^\s<>@\r\n]+@[^\s<>@\r\n]+\.[^\s<>@\r\n]+$/.test(value)) throw fault(400, 'INVALID_EMAIL', 'E-mail inválido.');
  return value;
}
class RateLimiter {
  constructor(now = Date.now) { this.now = now; this.entries = new Map(); }
  hit(key, limit, windowMs) {
    const now = this.now();
    if (this.entries.size > 10000) {
      for (const [k,v] of this.entries) if (v.until <= now) this.entries.delete(k);
      if (this.entries.size > 10000) throw fault(429, 'RATE_LIMIT', 'Muitos pedidos. Aguarde alguns minutos.');
    }
    let entry = this.entries.get(key);
    if (!entry || entry.until <= now) { entry = { count: 0, until: now + windowMs }; this.entries.set(key, entry); }
    if (++entry.count > limit) throw fault(429, 'RATE_LIMIT', 'Muitos pedidos. Aguarde alguns minutos.');
  }
}
class Auth {
  constructor(store, { secure = true, sendMail = async () => { throw new Error('SMTP not configured'); }, origin } = {}) {
    this.store = store;
    this.secure = secure;
    this.origin = origin;
    this.sendMail = sendMail;
    this.deliveries = new Set();
    this.cookieName = secure ? '__Host-pydicate-session' : 'pydicate-dev-session';
    this.limiter = new RateLimiter(store.now);
  }
  cookie(value, clear = false) {
    return `${this.cookieName}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${clear ? 0 : SESSION_MS/1000}${this.secure ? '; Secure' : ''}`;
  }
  session(rawCookie, touch = true) {
    const matches = String(rawCookie || '').split(';').map(s => s.trim()).filter(s => s.startsWith(this.cookieName + '='));
    if (matches.length !== 1) return null;
    const value = matches[0].slice(this.cookieName.length + 1);
    if (!/^[A-Za-z0-9_-]{43}$/.test(value)) return null;
    const hash = digest(value);
    const row = this.store.db.prepare(`SELECT s.hash,s.csrf,s.expires_at,s.last_seen,u.* FROM sessions s JOIN users u ON u.id=s.user_id
      WHERE s.hash=? AND u.disabled=0 AND u.password_hash IS NOT NULL AND s.expires_at>? AND s.last_seen>?`)
      .get(hash, this.store.now(), this.store.now() - IDLE_MS);
    if (!row) return null;
    if (touch && this.store.now() - row.last_seen > 60_000) this.store.db.prepare('UPDATE sessions SET last_seen=? WHERE hash=?').run(this.store.now(), hash);
    return { hash, csrf: row.csrf, user: this.store.publicUser(row) };
  }
  async login(input, ip) {
    const address = email(input.email);
    this.limiter.hit('login-ip:' + ip, 30, 10 * 60_000);
    this.limiter.hit('login-email:' + digest(address), 10, 10 * 60_000);
    const user = this.store.db.prepare('SELECT * FROM users WHERE email=?').get(address);
    const valid = await checkPassword(input.password, user?.password_hash);
    // Recheck after the expensive await: a concurrent reset/disable must win.
    const current = user && this.store.user(user.id);
    if (!valid || !current || current.disabled || current.password_hash !== user.password_hash) {
      throw fault(401, 'LOGIN_FAILED', 'E-mail ou senha inválidos.');
    }
    const value = token(), csrf = token(), hash = digest(value), now = this.store.now();
    this.store.transaction(() => {
      this.store.db.prepare('INSERT INTO sessions VALUES(?,?,?,?,?,?)').run(hash, user.id, csrf, now, now + SESSION_MS, now);
      // Keep at most ten concurrent authenticated sessions per account.
      this.store.db.prepare(`DELETE FROM sessions WHERE user_id=? AND hash NOT IN
        (SELECT hash FROM sessions WHERE user_id=? ORDER BY created_at DESC,rowid DESC LIMIT 10)`).run(user.id, user.id);
      this.store.audit(user.id, 'auth.login');
    });
    return { cookie: this.cookie(value), user: this.store.publicUser(current), csrf };
  }
  logout(session) {
    this.store.db.prepare('DELETE FROM sessions WHERE hash=?').run(session.hash);
    this.store.audit(session.user.id, 'auth.logout');
  }
  async createAdmin(address, name, value) {
    address = email(address); text(name,80);
    const encoded = await hashPassword(value);
    return this.store.transaction(() => {
      if (this.store.db.prepare("SELECT count(*) n FROM users WHERE role='admin' AND disabled=0 AND password_hash IS NOT NULL").get().n) {
        throw new Error('An active administrator already exists; use invitations in the web interface.');
      }
      const id = randomUUID();
      this.store.db.prepare('INSERT INTO users(id,email,name,role,password_hash,created_at) VALUES(?,?,?,?,?,?)')
        .run(id, address, name.trim(), 'admin', encoded, this.store.now());
      this.store.audit(id, 'auth.bootstrap');
      return id;
    });
  }
  issueToken(userId, kind) {
    const value = token();
    this.store.transaction(() => {
      this.store.db.prepare('DELETE FROM password_tokens WHERE user_id=?').run(userId);
      this.store.db.prepare('INSERT INTO password_tokens VALUES(?,?,?,?)')
        .run(digest(value), userId, kind, this.store.now() + (kind === 'invite' ? 48*60*60_000 : 30*60_000));
    });
    return value;
  }
  async invite(admin, input) {
    const address = email(input.email); text(input.name,80);
    const role = input.role || 'contributor';
    if (!['admin','reviewer','contributor'].includes(role)) throw fault(400,'INVALID_ROLE','Papel inválido.');
    this.limiter.hit('invite:' + admin.id, 30, 60*60_000);
    let user = this.store.db.prepare('SELECT * FROM users WHERE email=?').get(address);
    if (user?.password_hash || user?.disabled) throw fault(409,'USER_EXISTS','Esta conta já existe.');
    if (!user) {
      const id = randomUUID();
      this.store.db.prepare('INSERT INTO users(id,email,name,role,created_at) VALUES(?,?,?,?,?)')
        .run(id,address,input.name.trim(),role,this.store.now());
      user = this.store.user(id);
    }
    const value = this.issueToken(user.id,'invite');
    try {
      await this.sendMail({ to: address, subject: 'Convite — Pydicate Studio', body:
        `Olá, ${user.name}.\n\nVocê recebeu um convite para o Pydicate Studio. Defina sua própria senha neste link (válido por 48 horas):\n\n${this.origin}/account#token=${value}\n\nO espaço é compartilhado: rascunhos, comentários e autoria ficam visíveis à equipe. Operações categóricas são registradas para melhorar a ferramenta; não gravamos teclas nem conteúdo em telemetria.\n` });
    } catch {
      this.store.db.prepare('DELETE FROM password_tokens WHERE hash=?').run(digest(value));
      throw fault(502,'MAIL_FAILED','Não foi possível enviar o convite. Confira o SMTP e envie novamente.');
    }
    this.store.audit(admin.id,'account.invite');
    return this.store.publicUser(user);
  }
  async forgot(input, ip) {
    const address = email(input.email);
    this.limiter.hit('reset-ip:' + ip, 10, 30*60_000);
    this.limiter.hit('reset-email:' + digest(address), 3, 30*60_000);
    const user = this.store.db.prepare('SELECT * FROM users WHERE email=? AND disabled=0 AND password_hash IS NOT NULL').get(address);
    if (user) {
      const value = this.issueToken(user.id,'reset');
      // Delivery is asynchronous for both response timing and SMTP outage isolation.
      const delivery = this.sendMail({ to: address, subject: 'Redefinir senha — Pydicate Studio', body:
          `Use este link para redefinir sua senha (válido por 30 minutos):\n\n${this.origin}/account#token=${value}\n\nSe você não pediu isso, ignore esta mensagem.\n` }).catch(() => {
        this.store.db.prepare('DELETE FROM password_tokens WHERE hash=?').run(digest(value));
        this.store.audit(user.id,'mail.reset',null,'failed');
      });
      this.deliveries.add(delivery);
      void delivery.finally(() => this.deliveries.delete(delivery));
    }
    return { message: 'Se a conta estiver ativa, enviaremos as instruções.' };
  }
  async reset(input) {
    if (typeof input.token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(input.token)) throw fault(400,'INVALID_TOKEN','Link inválido ou expirado.');
    const hash = digest(input.token);
    const before = this.store.db.prepare('SELECT * FROM password_tokens WHERE hash=? AND expires_at>?').get(hash,this.store.now());
    if (!before) throw fault(400,'INVALID_TOKEN','Link inválido ou expirado.');
    const encoded = await hashPassword(input.password);
    return this.store.transaction(() => {
      const row = this.store.db.prepare('SELECT t.* FROM password_tokens t JOIN users u ON u.id=t.user_id WHERE t.hash=? AND t.expires_at>? AND u.disabled=0')
        .get(hash,this.store.now());
      if (!row) throw fault(400,'INVALID_TOKEN','Link inválido ou expirado.');
      this.store.db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(encoded,row.user_id);
      this.revoke(row.user_id);
      this.store.audit(row.user_id,'auth.password-reset');
      return { ok: true };
    });
  }
  async changePassword(session,input) {
    const user = this.store.user(session.user.id);
    if (!(await checkPassword(input.currentPassword,user.password_hash))) throw fault(401,'PASSWORD_WRONG','Senha atual inválida.');
    const encoded = await hashPassword(input.password);
    this.store.transaction(() => {
      const current = this.store.user(user.id);
      if (current.disabled || current.password_hash !== user.password_hash) throw fault(409,'ACCOUNT_CHANGED','A conta mudou. Entre novamente.');
      this.store.db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(encoded,user.id);
      this.revoke(user.id);
      this.store.audit(user.id,'auth.password-change');
    });
  }
  revoke(userId) {
    this.store.db.prepare('DELETE FROM sessions WHERE user_id=?').run(userId);
    this.store.db.prepare('DELETE FROM password_tokens WHERE user_id=?').run(userId);
    this.store.db.prepare('DELETE FROM claims WHERE user_id=?').run(userId);
  }
  updateUser(admin,input) {
    return this.store.transaction(() => {
      const user = this.store.user(input.id);
      if (!user || typeof input.disabled !== 'boolean' || !['admin','reviewer','contributor'].includes(input.role)) throw fault(400,'INVALID_USER','Conta inválida.');
      if (user.role === 'admin' && !user.disabled && (input.disabled || input.role !== 'admin') &&
        this.store.db.prepare("SELECT count(*) n FROM users WHERE role='admin' AND disabled=0 AND password_hash IS NOT NULL").get().n <= 1) {
        throw fault(409,'LAST_ADMIN','Mantenha pelo menos um administrador ativo.');
      }
      this.store.db.prepare('UPDATE users SET disabled=?,role=? WHERE id=?').run(Number(input.disabled),input.role,input.id);
      this.revoke(input.id);
      this.store.audit(admin.id,'account.update');
      return this.store.publicUser(this.store.user(input.id));
    });
  }
}
module.exports = { Auth, RateLimiter, hashPassword, checkPassword, digest, token, email, SESSION_MS, IDLE_MS };
