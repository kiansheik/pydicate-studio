export interface RecoveryContext {
  projectId: string;
  engineFingerprint: string;
}

interface Recovery {
  read: () => RecoveryContext | undefined;
  refresh: (projectId: string) => Promise<RecoveryContext>;
}
let recovery: Recovery | undefined;

/** Electron serializes Error.message across contextBridge, not custom fields. */
export function serviceError(reason: unknown): unknown {
  if (!(reason instanceof Error)) return reason;
  const match = reason.message.match(/^\[STUDIO:([A-Z][A-Z0-9_]{0,63})\] ([\s\S]*)$/);
  return match ? Object.assign(new Error(match[2]), { code: match[1] }) : reason;
}

export function registerProjectRecovery(value: Recovery) {
  recovery = value;
  return () => {
    if (recovery === value) recovery = undefined;
  };
}

const retryable = new Set([
  'structure_search',
  'dictionary_lookup',
  'dictionary_search',
  'predicate_catalog',
  'lexicon_search',
  'learning_library',
]);
const refreshable = new Set([
  ...retryable,
  'structure_resolve',
  'dictionary_predicate',
  'predicate_create',
  'evaluate_expression',
  'passage_lexicon',
  'lexicon_inspect',
]);

/** Retry browsing once after adopting current files. Selected candidates and
 * source writes must never be replayed against a different engine or namespace. */
export async function withProjectRecovery<T>(
  method: string,
  params: Record<string, unknown>,
  request: (params: Record<string, unknown>) => Promise<T>,
): Promise<T> {
  const handler = recovery;
  const before = handler?.read();
  try {
    return await request(params);
  } catch (reason) {
    if (
      (reason as { code?: string } | null)?.code !== 'STALE_ENGINE' ||
      !refreshable.has(method) ||
      !handler ||
      !before ||
      recovery !== handler ||
      handler.read()?.projectId !== before.projectId ||
      (params.projectId !== undefined && params.projectId !== before.projectId)
    )
      throw reason;
    // Another simultaneous lookup may already have refreshed the project.
    const current = handler.read()!;
    const next =
      current.engineFingerprint === before.engineFingerprint
        ? await handler.refresh(before.projectId)
        : current;
    if (recovery !== handler || handler.read()?.projectId !== before.projectId)
      throw new Error('O projeto mudou durante a busca. Busque novamente no projeto atual.');
    if (!retryable.has(method))
      throw Object.assign(
        new Error('As fontes foram atualizadas. Escolha novamente com os dados atuais.'),
        { code: 'CONTEXT_REFRESHED' },
      );
    return request({ ...params, engineFingerprint: next.engineFingerprint });
  }
}
