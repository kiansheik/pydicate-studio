'use strict';
// Resolve draft anchors by stable identity, including chains of unpublished rows.
function pendingContext(project, envelope, passageId) {
  if (!passageId?.startsWith('pending:')) return {};
  const draft = envelope?.drafts?.[passageId];
  if (!draft?.pending) return {};
  let target = draft.pending.beforePassageId;
  const visited = new Set([passageId]);
  while (target?.startsWith('pending:')) {
    if (visited.has(target))
      throw new Error('Ciclo na ordem das passagens. Concilie os rascunhos.');
    visited.add(target);
    const next = envelope.drafts[target];
    if (!next?.pending) {
      const published = target.replace(/^pending:/, 'passage:');
      if (project.passages.some((p) => p.id === published)) {
        target = published;
        break;
      }
      throw new Error('A passagem que marca a inserção não está disponível.');
    }
    target = next.pending.beforePassageId;
  }
  return { beforePassageId: target ?? null };
}
module.exports = { pendingContext };
