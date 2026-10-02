'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {createHostedAI} = require('../ai.cjs');

test('browser job projection bounds grammar bodies and checkpoints while preserving status and streaming text', () => {
  const {browserJob} = require('../ai.cjs');
  const full = {input: {raw:'exact target', grammarRepair:{baseline:'x'.repeat(100000)}, diagnostic:{prompt:'large'}},
    status:'running', grammarCandidate:{validation:'pending',surface:'observed'},
    attempts:[{id:'attempt',checkpoint:{version:1,phase:'tools-completed',messages:['x'.repeat(100000)]}}],
    events:[{type:'text-delta',text:'observed form'},
      {type:'tool-result',tool:'grammar_read',result:{path:'tupi/rule.py',content:'x'.repeat(100000)}},
      {type:'tool-result',tool:'grammar_edit',result:{content:[{type:'text',text:JSON.stringify({rolledBack:true,details:'x'.repeat(100000)})}]}}]};
  const browser = browserJob(full);
  assert(Buffer.byteLength(JSON.stringify(browser)) < 2000);
  assert.equal(browser.status,'running');
  assert.equal(browser.events[0].text,'observed form');
  assert.equal(browser.events[2].result.rolledBack,true);
  assert.equal(full.attempts[0].checkpoint.messages[0].length,100000);
  assert.equal(full.input.grammarRepair.baseline.length,100000);
});

test('grammar observation confirmation checks passage authorization and attributes the authenticated person', async () => {
  const claims = [];
  const store = {
    load: async () => ({drafts: {'passage:a': {revisionId:'revision:one'}}}),
    assertClaim: async (...args) => claims.push(args),
  };
  const ai = createHostedAI({store});
  const context = {user:{id:'human:one',role:'contributor'},clientId:'tab:one'};
  const params = {projectId:'project:one',jobId:'job:one',candidateId:'candidate:one',operationId:'confirm:one',confirmedBy:'spoofed'};
  const invoke = async (method, input) => method === 'analysis_get' ? {job:{passageId:'passage:a'}} : {confirmedBy:input.confirmedBy};
  const result = await ai.run('analysis_confirm_grammar',params,context,invoke);
  assert.equal(result.confirmedBy,'human:one');
  assert.equal(claims.length,1);
  assert.equal(claims[0][0],'passage:a');
  await assert.rejects(ai.run('analysis_confirm_grammar',{...params,passageId:'passage:other'},context,invoke), {code:'PASSAGE_MISMATCH'});
});
