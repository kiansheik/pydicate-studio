/** Official Messages API, Node fetch, SSE streaming, credentials only in main. */
class ClaudeProvider {
  constructor({ env = process.env, fetchImpl = fetch } = {}) {
    this.env = env;
    this.fetch = fetchImpl;
  }

  headers() {
    if (!this.env.ANTHROPIC_API_KEY)
      throw Object.assign(
        new Error(
          'Defina ANTHROPIC_API_KEY no ambiente que inicia o Studio. O login do Claude Code não é uma chave da API.',
        ),
        { code: 'PROVIDER_AUTH' },
      );
    return {
      authorization: `Bearer ${this.env.ANTHROPIC_API_KEY}`,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
      ...(this.env.ANTHROPIC_WORKSPACE_ID
        ? { 'anthropic-workspace-id': this.env.ANTHROPIC_WORKSPACE_ID }
        : {}),
    };
  }

  async responseError(response) {
    let detail = '';
    try {
      const body = await response.json();
      detail = String(body.error?.message || body.error?.type || '').slice(0, 1000);
    } catch {
      /* A gateway may return non-JSON. */
    }
    if (this.env.ANTHROPIC_API_KEY)
      detail = detail.split(this.env.ANTHROPIC_API_KEY).join('[credencial omitida]');
    return new Error(
      `Claude: HTTP ${response.status}. ${detail || 'Confira credenciais, modelo, workspace e disponibilidade da API.'}`,
    );
  }

  async status(model, verify = false) {
    if (!this.env.ANTHROPIC_API_KEY)
      return {
        id: 'claude',
        state: 'unconfigured',
        model,
        detail:
          'ANTHROPIC_API_KEY ausente. Inicie o Studio em um ambiente com a chave da API Claude.',
      };
    if (!verify)
      return {
        id: 'claude',
        state: 'available',
        model,
        detail: 'Chave presente no processo principal; conexão ainda não verificada.',
      };
    const response = await this.fetch('https://api.anthropic.com/v1/models?limit=100', {
      headers: this.headers(),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw await this.responseError(response);
    const body = await response.json();
    return {
      id: 'claude',
      state: 'authenticated',
      model,
      detail: 'Autenticação confirmada pela API de modelos.',
      models: (body.data || []).map((entry) => ({
        id: entry.id,
        name: entry.display_name || entry.id,
      })),
    };
  }

  async run({ model, prompt, signal, onDelta, onProgress = () => {}, maxTokens = 2048 }) {
    onProgress('provider_submit');
    const response = await this.fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: this.headers(),
      signal,
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        stream: true,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!response.ok) throw await this.responseError(response);
    if (!response.body) throw new Error('Claude não abriu o fluxo de resposta.');
    onProgress('provider_wait');
    const decoder = new TextDecoder();
    let buffer = '',
      modelUsed = model,
      messageId = null,
      completed = false,
      stopReason = null;
    let usage = null;
    for await (const chunk of response.body) {
      buffer = (buffer + decoder.decode(chunk, { stream: true })).replace(/\r\n/g, '\n');
      if (buffer.length > 2 * 1024 * 1024)
        throw new Error('Evento Claude excedeu o limite de tamanho.');
      let boundary;
      while ((boundary = buffer.indexOf('\n\n')) !== -1) {
        const block = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const data = block
          .split('\n')
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trimStart())
          .join('\n');
        if (!data) continue;
        let event;
        try {
          event = JSON.parse(data);
        } catch {
          throw new Error('Claude enviou um evento SSE inválido.');
        }
        if (event.type === 'error')
          throw new Error(
            `Claude interrompeu a resposta (${event.error?.type || 'erro'}). Tente novamente.`,
          );
        if (event.type === 'message_start') {
          modelUsed = event.message?.model || model;
          messageId = event.message?.id || null;
          usage = event.message?.usage || null;
        }
        if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
          onProgress('provider_stream');
          onDelta(event.delta.text);
        }
        if (event.type === 'message_delta') {
          stopReason = event.delta?.stop_reason || null;
          usage = { ...usage, ...event.usage };
        }
        if (event.type === 'message_stop') completed = true;
      }
    }
    if (!completed)
      throw new Error(
        'Conexão Claude interrompida antes do fim; a resposta parcial foi preservada.',
      );
    if (stopReason === 'max_tokens')
      throw new Error(
        'Claude atingiu o limite da resposta; texto parcial preservado. Peça uma resposta mais curta.',
      );
    return { model: modelUsed, providerResponseId: messageId, usage };
  }

  /** One protocol round. Only complete, validated tool blocks leave this method. */
  async completeToolRound({
    model,
    system,
    messages,
    tools,
    maxTokens,
    signal,
    onEvent = async () => {},
  }) {
    const { failure, aborted } = require('./agent-runner.cjs');
    aborted(signal);
    // Extended thinking is deliberately not requested, captured, or replayed.
    const wireMessages = messages.map((message) => ({
      role: message.role,
      content: Array.isArray(message.content)
        ? message.content.map((block) => {
            if (block.type === 'tool_use')
              return { type: 'tool_use', id: block.id, name: block.name, input: block.input };
            return block;
          })
        : message.content,
    }));
    const response = await this.fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: this.headers(),
      signal,
      body: JSON.stringify({
        model,
        system,
        messages: wireMessages,
        tools: tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          input_schema: tool.inputSchema,
        })),
        max_tokens: maxTokens,
        stream: true,
      }),
    });
    aborted(signal);
    if (!response.ok) {
      const error = await this.responseError(response);
      error.code =
        response.status === 401 || response.status === 403
          ? 'PROVIDER_AUTH'
          : response.status === 402 || /credit|billing|balance/i.test(error.message)
            ? 'PROVIDER_BILLING'
            : response.status === 429 || response.status >= 500
              ? 'PROVIDER_TEMPORARY'
              : 'PROVIDER_REQUEST';
      throw error;
    }
    if (!response.body) throw failure('PROVIDER_STREAM', 'Claude não abriu o fluxo de resposta.');
    const reader = response.body.getReader();
    let cancelled = false;
    const cancel = () => {
      cancelled = true;
      void reader.cancel().catch(() => {});
    };
    signal?.addEventListener('abort', cancel, { once: true });
    const decoder = new TextDecoder();
    const blocks = new Map();
    let buffer = '',
      started = false,
      completed = false,
      stopReason = null,
      modelUsed = model,
      messageId = null,
      usage = {},
      bytes = 0;
    const event = async (item) => {
      aborted(signal);
      if (completed)
        throw failure('PROVIDER_PROTOCOL', 'Claude enviou conteúdo depois do fim da mensagem.');
      if (item.type === 'error')
        throw failure(
          item.error?.type === 'overloaded_error' ? 'PROVIDER_TEMPORARY' : 'PROVIDER_STREAM',
          `Claude interrompeu a resposta (${item.error?.type || 'erro'}).`,
        );
      if (item.type === 'ping') return;
      if (item.type === 'message_start') {
        if (started) throw failure('PROVIDER_PROTOCOL', 'Claude repetiu o início da mensagem.');
        started = true;
        modelUsed = item.message?.model || model;
        messageId = item.message?.id || null;
        usage = item.message?.usage || {};
      } else if (!started)
        throw failure('PROVIDER_PROTOCOL', 'Claude iniciou um fluxo incompleto.');
      if (item.type === 'content_block_start') {
        if (
          !Number.isInteger(item.index) ||
          item.index < 0 ||
          item.index > 256 ||
          blocks.has(item.index)
        )
          throw failure('PROVIDER_PROTOCOL', 'Índice de conteúdo inválido.');
        const block = item.content_block;
        if (!['text', 'tool_use'].includes(block?.type))
          throw failure('PROVIDER_PROTOCOL', 'Claude retornou um tipo de conteúdo não solicitado.');
        if (
          block.type === 'tool_use' &&
          (typeof block.id !== 'string' || typeof block.name !== 'string')
        )
          throw failure('PROVIDER_PROTOCOL', 'Chamada de ferramenta incompleta.');
        blocks.set(item.index, { ...block, json: '', closed: false });
        if (block.type === 'text' && block.text)
          await onEvent({ type: 'text-delta', text: block.text });
      }
      if (item.type === 'content_block_delta') {
        const block = blocks.get(item.index);
        if (!block || block.closed)
          throw failure('PROVIDER_PROTOCOL', 'Claude enviou conteúdo fora do bloco.');
        if (item.delta?.type === 'text_delta' && block.type === 'text') {
          block.text = (block.text || '') + item.delta.text;
          await onEvent({ type: 'text-delta', text: item.delta.text });
        } else if (item.delta?.type === 'input_json_delta' && block.type === 'tool_use') {
          block.json += item.delta.partial_json;
          if (Buffer.byteLength(block.json) > 256 * 1024)
            throw failure('PAYLOAD_LIMIT', 'Argumentos da ferramenta excederam o limite.');
        } else throw failure('PROVIDER_PROTOCOL', 'Delta de conteúdo inesperado.');
      }
      if (item.type === 'content_block_stop') {
        const block = blocks.get(item.index);
        if (!block || block.closed)
          throw failure('PROVIDER_PROTOCOL', 'Claude encerrou um bloco inexistente.');
        block.closed = true;
        if (block.type === 'tool_use' && block.json) {
          try {
            block.input = JSON.parse(block.json);
          } catch {
            block.input = {};
            block.invalidArguments = true;
          }
        }
      }
      if (item.type === 'message_delta') {
        stopReason = item.delta?.stop_reason || stopReason;
        usage = { ...usage, ...item.usage };
      }
      if (item.type === 'message_stop') {
        if ([...blocks.values()].some((block) => !block.closed))
          throw failure(
            'PROVIDER_STREAM',
            'Claude terminou com conteúdo incompleto; a resposta parcial foi preservada.',
          );
        completed = true;
      }
    };
    try {
      while (true) {
        aborted(signal);
        const { done, value } = await reader.read();
        aborted(signal);
        if (done) break;
        bytes += value.byteLength;
        if (bytes > 8 * 1024 * 1024)
          throw failure('PAYLOAD_LIMIT', 'O fluxo Claude excedeu o limite de 8 MB.');
        buffer += decoder.decode(value, { stream: true });
        let boundary;
        // Normalize only complete CRLF pairs; a network chunk may end between them.
        buffer = buffer.replace(/\r\n/g, '\n');
        while ((boundary = buffer.indexOf('\n\n')) >= 0) {
          const frame = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          const data = frame
            .split('\n')
            .filter((line) => line.startsWith('data:'))
            .map((line) => line.slice(5).trimStart())
            .join('\n');
          if (!data) continue;
          let parsed;
          try {
            parsed = JSON.parse(data);
          } catch {
            throw failure('PROVIDER_PROTOCOL', 'Claude enviou um evento SSE inválido.');
          }
          await event(parsed);
        }
      }
      if (!completed || buffer.trim() || decoder.decode())
        throw failure(
          'PROVIDER_STREAM',
          'Conexão Claude interrompida antes do fim; a resposta parcial foi preservada.',
        );
      const content = [...blocks.entries()]
        .sort(([a], [b]) => a - b)
        .map(([, block]) => {
          const { json: _json, closed: _closed, ...value } = block;
          return value;
        });
      return { content, model: modelUsed, providerResponseId: messageId, usage, stopReason };
    } finally {
      signal?.removeEventListener('abort', cancel);
      if (!completed && !cancelled) await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  }
}

module.exports = { ClaudeProvider };
