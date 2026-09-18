const { spawn } = require('node:child_process');

/** Bounded JSONL client shared by the local Codex and authoring MCP transports. */
class JsonLineRpc {
  constructor(command, args, options = {}) {
    this.pending = new Map();
    this.listeners = new Set();
    this.sequence = 0;
    this.buffer = '';
    this.closed = false;
    this.killed = false;
    this.child = (options.spawn || spawn)(command, args, {
      cwd: options.cwd,
      env: options.env || process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    this.child.stdout.setEncoding('utf8');
    this.child.stdout.on('data', (chunk) => this.read(chunk));
    // Never relay process stderr: CLI diagnostics may include local configuration or credentials.
    this.child.stderr.resume();
    this.child.on('error', (error) =>
      this.fail(
        Object.assign(new Error(`Não foi possível iniciar ${command}: ${error.code || 'erro'}.`), {
          code: 'PROVIDER_UNAVAILABLE',
        }),
      ),
    );
    this.child.on('exit', (code) =>
      this.fail(new Error(`A conexão local terminou (${code ?? 'interrompida'}).`)),
    );
    this.child.stdin.on('error', () => this.fail(new Error('A conexão local foi fechada.')));
  }

  read(chunk) {
    this.buffer += chunk;
    if (this.buffer.length > 8 * 1024 * 1024) {
      this.fail(new Error('A resposta local excedeu o limite de 8 MB.'));
      this.close();
      return;
    }
    let index;
    while ((index = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, index);
      this.buffer = this.buffer.slice(index + 1);
      let message;
      try {
        if (!line.trim()) continue;
        message = JSON.parse(line);
      } catch {
        this.fail(new Error('A conexão local enviou JSON inválido.'));
        this.close();
        return;
      }
      if (!message || typeof message !== 'object' || Array.isArray(message)) {
        this.fail(new Error('A conexão local enviou uma mensagem inválida.'));
        this.close();
        return;
      }
      if (message.id != null && !message.method) {
        const item = this.pending.get(message.id);
        if (!item) continue;
        this.pending.delete(message.id);
        clearTimeout(item.timer);
        if (message.error) item.reject(new Error(message.error.message || 'Erro de protocolo.'));
        else item.resolve(message.result);
      } else if (message.method) {
        for (const listener of this.listeners) listener(message);
      }
    }
  }

  send(message) {
    if (this.closed) throw new Error('A conexão local está fechada.');
    this.child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  request(method, params = {}, timeout = 30_000, signal) {
    if (signal?.aborted) return Promise.reject(new Error('Solicitação cancelada.'));
    if (this.closed) return Promise.reject(new Error('A conexão local está fechada.'));
    return new Promise((resolve, reject) => {
      const id = ++this.sequence;
      const cleanup = () => signal?.removeEventListener('abort', abort);
      const abort = () => {
        clearTimeout(timer);
        this.pending.delete(id);
        cleanup();
        reject(new Error('Solicitação cancelada.'));
      };
      const timer = setTimeout(() => {
        this.pending.delete(id);
        cleanup();
        reject(new Error(`Tempo esgotado na operação ${method}.`));
      }, timeout);
      this.pending.set(id, {
        resolve: (value) => {
          cleanup();
          resolve(value);
        },
        reject: (error) => {
          cleanup();
          reject(error);
        },
        timer,
      });
      signal?.addEventListener('abort', abort, { once: true });
      try {
        this.send({ jsonrpc: '2.0', id, method, params });
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        cleanup();
        reject(error);
      }
    });
  }

  fail(error) {
    if (this.closed) return;
    this.closed = true;
    for (const item of this.pending.values()) {
      clearTimeout(item.timer);
      item.reject(error);
    }
    this.pending.clear();
    for (const listener of this.listeners)
      listener({ method: 'studio/disconnected', params: { error: error.message } });
  }

  close() {
    if (this.killed) return;
    this.killed = true;
    this.fail(new Error('Conexão encerrada.'));
    this.child.kill();
    const timer = setTimeout(() => this.child.kill('SIGKILL'), 1000);
    timer.unref();
  }
}

module.exports = { JsonLineRpc };
