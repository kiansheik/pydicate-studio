// Explicit, real authenticated smoke. No corpus reads or writes; no credential values logged.
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { createProviderService } = require('../electron/provider-service.cjs');

(async () => {
  const stateDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'pydicate-ai-smoke-'));
  const pending = new Map();
  const service = createProviderService({
    stateDirectory,
    contextLoader: async () => ({
      state: 'not-used',
      diagnostic:
        'This smoke checks provider transport with a self-contained linguistic prompt, not corpus fidelity.',
    }),
    emit(event) {
      const item = pending.get(event.requestId);
      if (!item) return;
      if (event.delta) item.deltas++;
      if (event.status !== 'streaming')
        item.resolve({
          provider: event.result.provider,
          model: event.result.model,
          status: event.status,
          error: event.error,
          streamedDeltas: item.deltas,
          response: event.text,
          inputHash: event.result.inputHash,
          providerResponseId: event.result.providerResponseId,
          startedAt: event.result.startedAt,
          finishedAt: event.result.finishedAt,
          usage: event.result.usage,
        });
    },
  });
  const report = {
    checkedAt: new Date().toISOString(),
    realAuthenticated: true,
    corpusRead: false,
    corpusWritten: false,
    credentialsLogged: false,
    checks: [],
  };
  try {
    const status = await service.handle('ai_status', { verify: true });
    report.authentication = status.providers.map(({ id, state, detail }) => ({
      id,
      state,
      detail,
    }));
    for (const provider of ['codex', 'claude']) {
      const requestId = randomUUID();
      const completion = new Promise((resolve) => pending.set(requestId, { resolve, deltas: 0 }));
      await service.handle('ai_start', {
        requestId,
        provider,
        action: 'explain',
        projectId: 'provider-contract-smoke',
        passageId: 'linguistic-role-smoke',
        revisionId: randomUUID(),
        context: {
          description:
            'Teste de conexão: em no máximo duas frases, explique por que um marcador OBJECT:1ps deve ser tratado como objeto de primeira pessoa, não sujeito. Não use ferramentas nem pesquise arquivos. Preencha apenas explanation; outros campos vazios.',
          annotation: 'OBJECT:1ps',
          evidence: 'Nenhum fac-símile; teste do transporte.',
        },
      });
      const result = await completion;
      report.checks.push(result);
      console.log(JSON.stringify(result));
      const history = await service.handle('ai_history', {
        projectId: 'provider-contract-smoke',
        passageId: 'linguistic-role-smoke',
      });
      result.persisted = history.some(
        (item) => item.requestId === requestId && item.status === result.status,
      );
    }
    if (process.argv[2])
      await fs.writeFile(process.argv[2], `${JSON.stringify(report, null, 2)}\n`);
    console.log(
      JSON.stringify({
        report: process.argv[2] || null,
        success: report.checks.every(
          (item) => item.status === 'completed' && item.streamedDeltas > 0 && item.persisted,
        ),
      }),
    );
  } finally {
    service.close();
  }
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
