'use strict';
/** External MCP is an execution attempt of the same queue. This runner waits for
 * committed tool outcomes; it never invokes a provider or opens state files. */
function createExternalAnalysisRunner({ getJob, getCandidates, pollMs = 200 }) {
  return async function runExternal({
    mcp,
    signal,
    budgets,
    onEvent,
    onCheckpoint,
    externalBaseline,
  }) {
    if (!mcp?.jobId || !mcp?.configPath)
      throw new Error('External authoring requires a scoped owner connection.');
    const deadline = Date.now() + (budgets?.timeoutMs ?? 300000);
    // The owner captures these before exposing the new scope. Saved results from
    // an interrupted attempt remain inspectable but cannot finish its retry.
    const previousQuestions = new Set(externalBaseline?.questionIds ?? []);
    const previousCandidates = new Map(
      (externalBaseline?.candidates ?? []).map((candidate) => [candidate.id, candidate]),
    );
    await onEvent?.({
      type: 'external-ready',
      phase: 'external-client',
      configPath: mcp.configPath,
    });
    await onCheckpoint?.({
      version: 1,
      kind: 'external-mcp',
      jobId: mcp.jobId,
      attemptId: mcp.attemptId,
      status: 'waiting-for-client',
      configPath: mcp.configPath,
    });
    while (Date.now() < deadline) {
      signal?.throwIfAborted();
      const job = await getJob(mcp.jobId);
      const candidates = await getCandidates(mcp.jobId);
      const proposed = candidates.filter((candidate) => {
        if (candidate.status !== 'proposed') return false;
        const previous = previousCandidates.get(candidate.id);
        return (
          !previous ||
          previous.status !== 'proposed' ||
          previous.revisionId !== candidate.revisionId ||
          previous.updatedAt !== candidate.updatedAt
        );
      });
      const questions = (job.questions ?? []).filter(
        (question) => !previousQuestions.has(question.id),
      );
      if (proposed.length || questions.length) {
        // Do not revoke the scope before the triggering MCP call has received
        // its success reply. Persisted candidates remain available after exit.
        await mcp.waitForIdle?.();
        signal?.throwIfAborted();
        const text =
          proposed
            .map((candidate) => candidate.rationale ?? 'Proposta avaliada disponível para revisão.')
            .join('\n\n') ||
          questions.map((question) => question.question ?? question.text).join('\n');
        return {
          text,
          messages: [],
          usage: { externalClient: true, providerRequests: 0 },
          checkpoint: {
            version: 1,
            kind: 'external-mcp',
            status: 'complete',
            candidateIds: proposed.map((candidate) => candidate.id),
          },
        };
      }
      await new Promise((resolve, reject) => {
        const cleanup = () => signal?.removeEventListener('abort', abort);
        const timer = setTimeout(
          () => {
            cleanup();
            resolve();
          },
          Math.min(pollMs, Math.max(1, deadline - Date.now())),
        );
        const abort = () => {
          clearTimeout(timer);
          cleanup();
          reject(signal.reason ?? new Error('External authoring cancelled.'));
        };
        signal?.addEventListener('abort', abort, { once: true });
        if (signal?.aborted) abort();
      });
    }
    throw Object.assign(
      new Error(
        'O cliente MCP não terminou dentro do limite. As propostas parciais foram preservadas; inicie uma nova tentativa explicitamente.',
      ),
      { code: 'EXTERNAL_TIMEOUT' },
    );
  };
}
module.exports = { createExternalAnalysisRunner };
