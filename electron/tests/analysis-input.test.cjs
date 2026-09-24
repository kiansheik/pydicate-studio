'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { scopedAnalysisInput } = require('../analysis-input.cjs');
const { runAgent } = require('../agent-runner.cjs');
const hidden = 'HIDDEN_PYDICATE_ANSWER';
const input = {
  digest: 'input-digest',
  passageId: 'target',
  diplomatic: 'Nhemombëú.',
  tentativeReading: "nhemombe'u",
  manifest: { mode: 'reconstruction', excludePassageIds: ['duplicate'] },
  raw: hidden,
  canvas: { fragments: [{ raw: hidden }] },
  evaluation: { expression: hidden },
  definitionContext: { root: { compositeDefinition: hidden } },
  interpretationContext: { bindings: [{ preferredMeaning: hidden }] },
  interpretationNotes: [{ fields: { meaning: hidden } }],
  feedback: { candidate: { raw: hidden } },
  conversation: [{ text: hidden }],
  context: [
    { id: 'target', raw: hidden },
    { id: 'duplicate', raw: hidden },
    {
      id: 'previous',
      surface: 'permitted',
      raw: hidden,
      definitionContext: { root: { baseDefinition: hidden } },
      interpretationContext: { bindings: [{ preferredMeaning: hidden }] },
      interpretationNotes: [{ fields: { meaning: hidden } }],
    },
  ],
};
test('one reconstruction projection removes nested answer paths while preserving original linguistic strings', () => {
  const result = scopedAnalysisInput(input);
  assert.ok(!JSON.stringify(result).includes(hidden));
  assert.equal(result.diplomatic, input.diplomatic);
  assert.equal(result.tentativeReading, input.tentativeReading);
  assert.deepEqual(result.context, [{ id: 'previous', surface: 'permitted' }]);
  assert.equal(input.raw, hidden);
  assert.ok(
    !JSON.stringify(
      scopedAnalysisInput({ ...input, manifest: { excludePassageIds: ['target'] } }),
    ).includes(hidden),
  );
  assert.deepEqual(
    scopedAnalysisInput({ ...input, manifest: { mode: 'assisted' } }).evaluation,
    input.evaluation,
  );
});
test('provider dispatch cannot bypass reconstruction projection through protocol history or checkpoint', async () => {
  let observed;
  await runAgent({
    provider: {
      id: 'claude',
      async completeToolRound(options) {
        observed = options;
        return {
          content: [{ type: 'text', text: 'Sem análise fornecida.' }],
          stopReason: 'end_turn',
          usage: {},
        };
      },
    },
    input,
    messages: [{ role: 'user', content: hidden }],
    checkpoint: { messages: [{ role: 'assistant', content: hidden }] },
    tools: [],
    budgets: { maxSteps: 1, maxRounds: 1, maxOutputTokens: 64, timeoutMs: 1000 },
  });
  assert.ok(!JSON.stringify(observed).includes(hidden));
});
