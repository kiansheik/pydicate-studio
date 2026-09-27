'use strict';
(() => {
  const evidencePrefix = 'pydicate-studio:evidence-draft:v1:';
  const pointerPrefix = 'pydicate-studio:evidence-last-passage:v1:';
  const preferences = new Set([
    'studio-theme',
    'pydicate-studio:workspace:v1',
    'pydicate-studio:workspace:v2',
    'pydicate-studio:tools:v1',
  ]);
  const canonical = (value) =>
    typeof value === 'string' ? value.replace(/^pending:/, 'passage:') : value;
  const stable = (value) =>
    JSON.stringify(value, (_, item) =>
      item && typeof item === 'object' && !Array.isArray(item)
        ? Object.fromEntries(
            Object.keys(item)
              .sort()
              .map((key) => [key, item[key]]),
          )
        : item,
    );
  function mapped(context, id, evidence = false) {
    const values = context.passageMappings || {};
    const candidates = [
      id,
      canonical(id),
      typeof id === 'string' ? id.replace(/^passage:/, 'pending:') : id,
    ];
    const key = candidates.find(
      (value) => Object.hasOwn(values, value) && typeof values[value] === 'string',
    );
    return key === undefined ? null : evidence ? canonical(values[key]) : values[key];
  }
  function validRegion(region, assetId) {
    return (
      region &&
      typeof region.id === 'string' &&
      region.assetId === assetId &&
      Number.isInteger(region.pageIndex) &&
      region.pageIndex >= 0 &&
      Array.isArray(region.rect) &&
      region.rect.length === 4 &&
      region.rect.every(Number.isFinite) &&
      region.rect[0] < region.rect[2] &&
      region.rect[1] < region.rect[3]
    );
  }
  function validEvidence(value) {
    return (
      value &&
      typeof value.assetId === 'string' &&
      Number.isInteger(value.revision) &&
      value.revision >= 0 &&
      Array.isArray(value.regions) &&
      value.regions.length <= 500 &&
      value.regions.every((region) => validRegion(region, value.assetId)) &&
      value.view &&
      Number.isInteger(value.view.pageIndex) &&
      value.view.pageIndex >= 0 &&
      Number.isFinite(value.view.zoom) &&
      value.view.zoom >= 0.25 &&
      value.view.zoom <= 4 &&
      [0, 90, 180, 270].includes(value.view.rotation) &&
      (!value.guide ||
        (value.guide.assetId === value.assetId &&
          typeof value.guide.fromPassageId === 'string' &&
          (!value.guide.region || validRegion(value.guide.region, value.assetId))))
    );
  }
  function remapLocation(value, context) {
    if (!value || typeof value !== 'object') return value;
    const next = structuredClone(value);
    if (next.guide) {
      const id = mapped(context, next.guide.fromPassageId, true);
      if (!id) throw new Error('A passagem usada como guia ainda não foi conciliada.');
      next.guide.fromPassageId = id;
    }
    if (next.inheritedFrom) {
      const id = mapped(context, next.inheritedFrom.passageId, true);
      if (!id) throw new Error('A origem da localização ainda não foi conciliada.');
      next.inheritedFrom.passageId = id;
    }
    return next;
  }
  async function restore({ data, context, storage = localStorage, evidenceStatus }) {
    if (
      data?.format !== 'pydicate-browser-storage' ||
      data.version !== 1 ||
      !Array.isArray(data.origins) ||
      typeof context?.projectId !== 'string' ||
      typeof context.sourceProjectId !== 'string'
    )
      throw new Error('Cópia de preferências inválida.');
    const result = { imported: 0, unchanged: 0, conflicts: 0, archived: 0, issues: [] };
    for (const origin of data.origins)
      for (const [originalKey, originalValue] of Object.entries(origin.entries || {})) {
        let key = originalKey,
          value = originalValue,
          params;
        try {
          if (typeof value !== 'string' || value.length > 5 * 1024 * 1024)
            throw new Error('Valor local inválido ou acima do limite.');
          if (key.startsWith(evidencePrefix) || key.startsWith(pointerPrefix)) {
            const prefix = key.startsWith(evidencePrefix) ? evidencePrefix : pointerPrefix;
            const parts = JSON.parse(key.slice(prefix.length));
            if (
              !Array.isArray(parts) ||
              parts[0] !== context.sourceProjectId ||
              typeof parts[1] !== 'string'
            )
              throw new Error('O vínculo com este projeto não foi confirmado.');
            if (prefix === evidencePrefix) {
              const passageId = mapped(context, parts[2], true);
              if (!passageId)
                throw new Error(
                  'A passagem ainda não foi conciliada; o rascunho continua no histórico.',
                );
              params = { projectId: context.projectId, sourceId: parts[1], passageId };
              key = prefix + JSON.stringify([context.projectId, parts[1], passageId]);
            } else {
              value = mapped(context, value, true);
              if (!value) throw new Error('A última passagem ainda não foi conciliada.');
              key = prefix + JSON.stringify([context.projectId, parts[1]]);
            }
          } else if (key.startsWith('studio-learning:v1:' + context.sourceProjectId + ':')) {
            key =
              'studio-learning:v1:' +
              context.projectId +
              ':' +
              key.slice(('studio-learning:v1:' + context.sourceProjectId + ':').length);
          } else if (!preferences.has(key) && !key.startsWith('studio:piece-query:')) {
            // Retry identifiers must never be replayed. Lexical buffers can autosave,
            // and draft envelopes are reconciled on the server, not injected here.
            result.archived++;
            continue;
          }
          const existing = storage.getItem(key);
          if (existing !== null) {
            if (existing === value) result.unchanged++;
            else {
              result.conflicts++;
              result.issues.push({
                key: originalKey,
                reason: 'Já há dados neste navegador; foram preservados.',
              });
            }
            continue;
          }
          if (params) {
            const saved = JSON.parse(value);
            if (!validEvidence(saved))
              throw new Error('Rascunho de regiões inválido; mantido no histórico.');
            if (typeof evidenceStatus !== 'function')
              throw new Error('A evidência online precisa ser carregada antes de restaurar.');
            const current = await evidenceStatus(params);
            if (
              current.projectId !== params.projectId ||
              current.sourceId !== params.sourceId ||
              current.asset?.id !== saved.assetId ||
              current.asset.managedState !== 'ok'
            )
              throw new Error('O PDF desta cópia não corresponde ao PDF online disponível.');
            const next = remapLocation(saved, context);
            let baseline = null;
            if (saved.baseline) baseline = remapLocation(JSON.parse(saved.baseline), context);
            const desired = {
              regions: next.regions,
              view: next.view,
              viewAssetId: next.assetId,
              ...(next.guide ? { guide: next.guide } : {}),
            };
            if (
              current.passage &&
              stable(current.passage) !== stable(baseline) &&
              stable(current.passage) !== stable(desired)
            )
              throw new Error(
                'A evidência online já mudou; consulte o rascunho histórico antes de combinar as regiões.',
              );
            next.revision = current.revision;
            next.baseline = JSON.stringify(current.passage);
            value = JSON.stringify(next);
          }
          // Recheck after asynchronous metadata loading so a newly edited buffer wins.
          if (storage.getItem(key) !== null)
            throw new Error(
              'Este navegador recebeu uma edição durante a restauração; ela foi preservada.',
            );
          storage.setItem(key, value);
          result.imported++;
        } catch (error) {
          result.conflicts++;
          result.issues.push({ key: originalKey, reason: error.message });
        }
      }
    return result;
  }
  window.desktopHistoryStorage = { restore };
})();
