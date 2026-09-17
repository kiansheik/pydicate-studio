'use strict';

const { spawn } = require('node:child_process');
const { StringDecoder } = require('node:string_decoder');

class PythonWorker {
  constructor({
    executable = process.env.PYDICATE_PYTHON || 'python3',
    script,
    stateDirectory,
    timeout = 60_000,
    maxLineBytes = 16 * 1024 * 1024,
    spawnProcess = spawn,
  }) {
    this.pending = new Map();
    this.sequence = 0;
    this.failed = null;
    this.stderr = '';
    this.buffer = '';
    this.timeout = timeout;
    this.maxLineBytes = maxLineBytes;
    const decoder = new StringDecoder('utf8');
    this.process = spawnProcess(executable, ['-B', script, '--state-dir', stateDirectory], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      shell: false,
      env: {
        ...process.env,
        PYTHONDONTWRITEBYTECODE: '1',
        PYTHONUNBUFFERED: '1',
        PYTHONIOENCODING: 'utf-8',
      },
    });
    this.process.on('error', (error) =>
      this.fail(new Error(`Não foi possível iniciar o Python (${executable}). ${error.message}`)),
    );
    // `close` follows stdio drainage; `exit` alone can race the final response.
    this.process.on('close', (code, signal) =>
      this.fail(
        new Error(
          `O serviço Python encerrou (${signal || code}). Reabra o projeto. ${this.stderr.trim()}`,
        ),
      ),
    );
    this.process.stdin.on('error', (error) =>
      this.fail(new Error(`O serviço Python não recebeu o pedido. ${error.message}`)),
    );
    this.process.stderr.on('data', (chunk) => {
      this.stderr = (this.stderr + chunk.toString('utf8')).slice(-16_384);
    });
    this.process.stdout.on('data', (chunk) => {
      if (this.failed) return;
      this.buffer += decoder.write(chunk);
      // An unfinished JSON line is bounded too; a worker cannot grow memory indefinitely.
      if (Buffer.byteLength(this.buffer, 'utf8') > this.maxLineBytes) {
        this.fail(new Error('A resposta do serviço Python excedeu o limite. Reabra o projeto.'));
        return;
      }
      let newline;
      while ((newline = this.buffer.indexOf('\n')) !== -1) {
        const line = this.buffer.slice(0, newline);
        this.buffer = this.buffer.slice(newline + 1);
        if (line.trim()) this.receive(line);
        if (this.failed) break;
      }
    });
  }

  receive(line) {
    let message;
    try {
      message = JSON.parse(line);
      if (
        !message ||
        typeof message !== 'object' ||
        !Number.isSafeInteger(message.id) ||
        (!('result' in message) && !('error' in message))
      )
        throw new Error('Formato desconhecido.');
    } catch {
      this.fail(new Error('O serviço Python devolveu uma resposta inválida. Reabra o projeto.'));
      return;
    }
    const pending = this.pending.get(message.id);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pending.delete(message.id);
    if ('error' in message) {
      const messageText =
        typeof message.error?.message === 'string'
          ? message.error.message.slice(0, 16_384)
          : 'O serviço Python não conseguiu completar a tarefa.';
      const error = new Error(messageText);
      error.code =
        typeof message.error?.code === 'string' && /^[A-Z_]{1,64}$/.test(message.error.code)
          ? message.error.code
          : 'ENGINE_ERROR';
      pending.reject(error);
    } else {
      pending.resolve(message.result);
    }
  }

  request(method, params) {
    if (this.failed) return Promise.reject(this.failed);
    if (
      ![
        'open_project',
        'refresh_project',
        'render',
        'parse_expression',
        'evaluate_expression',
        'predicate_catalog',
        'predicate_create',
        'source_preview',
        'source_new_preview',
        'source_apply',
        'source_recover',
        'source_recovery_list',
        'lexicon_search',
        'structure_search',
        'structure_resolve',
        'lexicon_inspect',
        'lexicon_create',
        'lexicon_update',
        'dictionary_search',
        'dictionary_lookup',
        'dictionary_predicate',
        'assistant_context',
        'reference_verify',
        'reference_approve',
        'reference_status',
        'passage_lexicon',
        'contribution_prepare',
      ].includes(method)
    )
      return Promise.reject(new Error('Operação desconhecida.'));
    if (this.pending.size >= 32)
      return Promise.reject(
        new Error('Há muitos pedidos em andamento. Aguarde e tente novamente.'),
      );
    const id = ++this.sequence;
    const line = JSON.stringify({ id, method, params }) + '\n';
    if (Buffer.byteLength(line, 'utf8') > 1024 * 1024)
      return Promise.reject(new Error('O pedido excedeu o limite.'));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () =>
          this.fail(
            new Error(
              'O serviço Python demorou além do limite. Os rascunhos continuam salvos; reabra o projeto.',
            ),
          ),
        this.timeout,
      );
      this.pending.set(id, { resolve, reject, timer });
      this.process.stdin.write(line, 'utf8', (error) => {
        if (error)
          this.fail(new Error(`Não foi possível enviar o pedido ao Python. ${error.message}`));
      });
    });
  }

  fail(error) {
    if (this.failed) return;
    error.code ||= 'WORKER_UNAVAILABLE';
    this.failed = error;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
    this.buffer = '';
    this.process.kill();
  }

  close() {
    this.fail(new Error('O serviço Python foi encerrado.'));
  }
}

module.exports = { PythonWorker };
