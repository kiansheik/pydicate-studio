'use strict';
/** One projection is used at BOTH model dispatch and MCP context boundaries. */
function isReconstruction(input) {
  const manifest = input?.manifest ?? {};
  return (
    manifest.mode === 'reconstruction' ||
    manifest.reconstruction === true ||
    (manifest.excludePassageIds ?? []).includes(input?.passageId)
  );
}
function scopedAnalysisInput(input) {
  if (!input || typeof input !== 'object') return input;
  const copy = structuredClone(input);
  if (copy.grammarRepair?.baseline) {
    const baseline = copy.grammarRepair.baseline;
    copy.grammarRepair.baselineSummary = {
      engineFingerprint: baseline.engineFingerprint,
      sources: Object.fromEntries(
        Object.entries(baseline.sources ?? {}).map(([id, source]) => [
          id,
          { rows: source.rows?.length ?? 0, error: source.error },
        ]),
      ),
      note: 'Full baseline retained by Studio; grammar tools compare every saved row.',
    };
    delete copy.grammarRepair.baseline;
  }
  const manifest = copy.manifest ?? {};
  if (!isReconstruction(copy)) return copy;
  const excluded = new Set([copy.passageId, ...(manifest.excludePassageIds ?? [])]);
  copy.raw = '';
  copy.canvas = { fragments: [], positions: {}, layout: 'bottom-up' };
  for (const key of [
    'evaluation',
    'definitionContext',
    'interpretationContext',
    'interpretationNotes',
    'selectedNode',
    'feedback',
    'conversation',
    'messages',
    'checkpoint',
    'candidates',
    'candidate',
    'summary',
  ])
    delete copy[key];
  copy.context = (copy.context ?? [])
    .filter((item) => !excluded.has(item.passageId ?? item.id))
    .map((item) => {
      const {
        raw,
        expression,
        sourceExpression,
        evaluation,
        tree,
        canvas,
        definitionContext,
        interpretationContext,
        interpretationNotes,
        ...reference
      } = item;
      return reference;
    });
  copy.answerPolicy =
    'Original expression, candidate/history answers and answer-derived reuse are withheld. Context contains preserved surface references only.';
  return copy;
}
module.exports = { scopedAnalysisInput, isReconstruction };
