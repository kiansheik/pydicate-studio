/** Official Messages API, Node fetch, SSE streaming, credentials only in main. */
class ClaudeProvider {
  constructor({ env = process.env, fetchImpl = fetch } = {}) {
    this.env = env;
    this.fetch = fetchImpl;
  }

  headers() {
    if (!this.env.ANTHROPIC_API_KEY)
      throw new Error(
        'Defina ANTHROPIC_API_KEY no ambiente que inicia o Studio. O login do Claude Code não é uma chave da API.',
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
}

module.exports = { ClaudeProvider };
