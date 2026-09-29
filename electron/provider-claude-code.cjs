'use strict';
/**
 * Runs the unmodified Claude Code binary against the contributor's own
 * subscription sign-in. Studio supplies a prompt and reads text back; it never
 * touches the credential, which the binary owns inside that contributor's
 * private CLAUDE_CONFIG_DIR. See docs/design/claude-subscription-login.md.
 *
 * Single-shot by construction: no MCP servers, no tools, no filesystem access,
 * and the working directory is the private home rather than the workspace, so
 * there is no CLAUDE.md to discover and nothing for a tool to reach. This
 * matches what `run({ prompt })` already promises every other provider — the
 * caller has captured its own context and wants text in return.
 */
const { spawn } = require('node:child_process');

// `--bare` is deliberately absent: it forces API-key-only authentication and
// never reads the OAuth sign-in this provider exists to use.
const EMPTY_MCP = JSON.stringify({ mcpServers: {} });
const FORBIDDEN = [
  'Bash',
  'Edit',
  'Write',
  'Read',
  'Glob',
  'Grep',
  'WebFetch',
  'WebSearch',
  'Task',
  'NotebookEdit',
  'TodoWrite',
  'SlashCommand',
  'KillShell',
  'BashOutput',
];
const OUTPUT_LIMIT = 64 * 1024;
const START_MS = 60_000;

const CONTROL = new RegExp('[\u0000-\u0008\u000b-\u001f\u007f]', 'g');
const scrub = (value) => String(value).replace(CONTROL, '');

class ClaudeCodeProvider {
  /**
   * @param resolveHome async () => private CLAUDE_CONFIG_DIR for the caller.
   *   The hosted server binds this to the requesting contributor; a desktop
   *   build binds it to the single local home.
   */
  constructor({
    resolveHome,
    command = process.env.COLLAB_CLAUDE_BIN || 'claude',
    spawnImpl = spawn,
  }) {
    this.resolveHome = resolveHome;
    this.command = command;
    this.spawn = spawnImpl;
  }

  child(home, args, signal) {
    // A pristine environment, exactly as sign-in uses: no inherited key may
    // stand in for the subscription, and no other credential may win on
    // precedence. Usage must bill to the contributor who signed in.
    const env = { ...process.env, CLAUDE_CONFIG_DIR: home, HOME: home, CI: '1' };
    for (const name of [
      'ANTHROPIC_API_KEY',
      'ANTHROPIC_AUTH_TOKEN',
      'CLAUDE_CODE_OAUTH_TOKEN',
      'ANTHROPIC_PROFILE',
    ])
      delete env[name];
    return this.spawn(this.command, args, {
      cwd: home,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
      signal,
    });
  }

  async status(model, verify = false) {
    let home;
    try {
      home = await this.resolveHome();
    } catch (error) {
      return { id: 'claude-code', state: 'unconfigured', model, detail: error.message };
    }
    const account = await new Promise((resolve) => {
      let output = '',
        settled = false,
        timer;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      };
      let child;
      try {
        child = this.child(home, ['auth', 'status', '--json']);
      } catch {
        return finish(null);
      }
      timer = setTimeout(() => {
        child.kill('SIGKILL');
        finish(null);
      }, 20_000).unref();
      child.stdout.on('data', (chunk) => {
        if (output.length < OUTPUT_LIMIT) output += chunk;
      });
      child.on('error', () => finish(null));
      child.on('close', () => {
        try {
          finish(JSON.parse(scrub(output)));
        } catch {
          finish(null);
        }
      });
      child.stdin.end();
    });
    if (!account)
      return {
        id: 'claude-code',
        state: 'unconfigured',
        model,
        detail: 'O Claude Code não está disponível neste servidor.',
      };
    if (account.loggedIn !== true)
      return {
        id: 'claude-code',
        state: 'unconfigured',
        model,
        detail: 'Entre com a sua própria conta Claude na seção "Claude Code · minha conta".',
      };
    const who =
      typeof account.email === 'string' ? ' (' + scrub(account.email).slice(0, 200) + ')' : '';
    // `verify` is not a second network probe here: `auth status` already asked
    // the binary, and a real generation would spend the contributor's quota.
    return {
      id: 'claude-code',
      state: 'authenticated',
      model,
      detail: `Assinatura Claude reconhecida pelo Claude Code${who}; o uso é cobrado nessa conta.`,
    };
  }

  async run({ model, prompt, signal, onDelta, onProgress = () => {} }) {
    const home = await this.resolveHome();
    const args = [
      '--print',
      '--output-format',
      'stream-json',
      '--include-partial-messages',
      '--verbose',
      '--strict-mcp-config',
      '--mcp-config',
      EMPTY_MCP,
      '--disallowed-tools',
      ...FORBIDDEN,
      '--permission-mode',
      'manual',
    ];
    if (model) args.push('--model', model);
    return new Promise((resolve, reject) => {
      let child;
      try {
        child = this.child(home, args, signal);
      } catch {
        return reject(
          Object.assign(new Error('O Claude Code não está instalado neste servidor.'), {
            code: 'PROVIDER_AUTH',
          }),
        );
      }
      let buffer = '',
        errors = '',
        settled = false,
        usage = null,
        sessionId = null,
        failure = null;
      let started = false,
        delivered = 0;
      const finish = (error, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (error) reject(error);
        else resolve(value);
      };
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        finish(new Error('O Claude Code não respondeu ao iniciar a solicitação.'));
      }, START_MS);
      const event = (message) => {
        if (!message || typeof message !== 'object') return;
        if (message.type === 'system' && message.subtype === 'init') {
          started = true;
          sessionId = typeof message.session_id === 'string' ? message.session_id : null;
          clearTimeout(timer);
          onProgress('provider_thread');
          return;
        }
        // Partial text as it arrives; the aggregate is re-checked at the result.
        if (message.type === 'stream_event') {
          const delta = message.event?.delta;
          if (delta?.type === 'text_delta' && typeof delta.text === 'string') {
            delivered += delta.text.length;
            onDelta(delta.text);
          }
          return;
        }
        if (message.type === 'result') {
          // Partial deltas are the normal path, but the final text is authoritative.
          // Without this a build that omits partial messages would look like a
          // successful run that returned nothing at all.
          if (!delivered && typeof message.result === 'string' && message.result.trim())
            onDelta(message.result);
          if (message.is_error) {
            failure =
              typeof message.result === 'string' && message.result.trim()
                ? scrub(message.result).slice(0, 2_000)
                : 'O Claude Code encerrou a solicitação com erro.';
          }
          usage = message.usage || null;
          if (typeof message.session_id === 'string') sessionId = message.session_id;
        }
      };
      child.stdout.on('data', (chunk) => {
        buffer += chunk;
        let newline;
        while ((newline = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, newline).trim();
          buffer = buffer.slice(newline + 1);
          if (!line) continue;
          try {
            event(JSON.parse(line));
          } catch {
            /* A non-protocol line is diagnostic noise, not a response. */
          }
        }
        if (buffer.length > 4 * 1024 * 1024) {
          child.kill('SIGKILL');
          finish(new Error('Resposta do Claude Code excedeu o limite de tamanho.'));
        }
      });
      child.stderr.on('data', (chunk) => {
        if (errors.length < OUTPUT_LIMIT) errors += chunk;
      });
      child.on('error', (error) =>
        finish(
          signal?.aborted
            ? new Error('Solicitação cancelada.')
            : Object.assign(
                new Error('Não foi possível executar o Claude Code. ' + error.message),
                {
                  code: 'PROVIDER_AUTH',
                },
              ),
        ),
      );
      child.on('close', (code) => {
        if (signal?.aborted) return finish(new Error('Solicitação cancelada.'));
        if (failure) return finish(new Error(failure));
        if (code !== 0 || !started) {
          const detail = scrub(errors).trim().slice(-1_200);
          return finish(
            new Error(
              'O Claude Code encerrou sem concluir a solicitação.' + (detail ? ' ' + detail : ''),
            ),
          );
        }
        finish(null, {
          providerSessionId: sessionId,
          usage: usage
            ? {
                inputTokens: usage.input_tokens ?? null,
                outputTokens: usage.output_tokens ?? null,
              }
            : null,
        });
      });
      child.stdin.on('error', () => {
        /* A worker that exits early is reported by `close`. */
      });
      child.stdin.end(prompt);
    });
  }
}
module.exports = { ClaudeCodeProvider, FORBIDDEN };
