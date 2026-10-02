'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs/promises'), os = require('node:os'), path = require('node:path');
const { createTestStore } = require('./helpers.cjs');
const { createHostedAI } = require('../ai.cjs');
const { authorizeMethod } = require('../studio.cjs');
const { config } = require('../config.cjs');

test('hosted AI is opt-in and keeps unrelated desktop operations denied', () => {
  assert.equal(config({}).aiEnabled, false);
  assert.equal(config({COLLAB_AI_ENABLED:'1'}).aiEnabled, true);
  assert.throws(() => authorizeMethod('analysis_submit','admin'), {code:'HOSTED_UNAVAILABLE'});
  authorizeMethod('analysis_submit','contributor',true);
  authorizeMethod('analysis_steer','contributor',true);
  assert.throws(() => authorizeMethod('analysis_steer','admin'), {code:'HOSTED_UNAVAILABLE'});
  assert.throws(() => authorizeMethod('analysis_external_start','admin',true), {code:'HOSTED_UNAVAILABLE'});
});

test('AI acceptance is an atomic attributed draft revision, replayable without losing subsequent edits', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(),'studio-ai-'));
  const store = await createTestStore(directory);
  t.after(async()=>{await store.close();await fs.rm(directory,{recursive:true,force:true});});
  const project = {id:'project:test',passages:[{id:'passage:a',sourceId:'source',sourceFingerprint:'source:1',sourceExpression:'original',diplomatic:'A',normalized:'A',translation:'',notes:'',witness:{}}]};
  await store.seed(project);
  for (const id of ['one','two']) await store.db.prepare('INSERT INTO users VALUES($1,$2,$3,$4,$5,0,$6)').run(id,id+'@example.org',id,'contributor','not-a-password',Date.now());
  const user = store.publicUser(await store.user('one')), other = store.publicUser(await store.user('two'));
  const before = await store.snapshot(project.id), draft = before.envelope.drafts['passage:a'];
  const ai = createHostedAI({store});
  const candidate = {id:'candidate:a',revisionId:'candidate:r',raw:'proposed',canvas:{version:1,fragments:[],edges:[]}};
  const params = {projectId:project.id,passageId:draft.passageId,expectedDraftRevision:draft.revisionId,operationId:'accept:1',jobId:'job:1',candidateId:candidate.id,candidateRevision:candidate.revisionId};
  const ctx = {user,clientId:'browser-one'};
  const invoke = async (method, input) => method === 'analysis_get' ? {job:{passageId:'passage:a'}} : ai.drafts.acceptCandidate({...input,candidate});
  const result = await ai.run('analysis_accept',params,ctx,invoke);
  assert.equal(result.draft.raw,'proposed');
  assert.equal(result.draft.aiAcceptances.length,1);
  assert.equal(result.versions['passage:a'],2);
  assert.equal((await store.db.prepare('SELECT user_id FROM revisions').get()).user_id,user.id);
  await assert.rejects(ai.run('analysis_accept',{...params,operationId:'accept:2'}, {user:other,clientId:'browser-two'},invoke),{code:'PASSAGE_BUSY'});
  const changed = {...result.draft,raw:'later human edit',revisionId:'later'};
  await store.patch(project.id,[{id:draft.passageId,version:2,draft:changed}],user,ctx.clientId);
  const replay = await ai.run('analysis_accept',params,ctx,invoke);
  assert.equal(replay.draft.raw,'later human edit');
  assert.equal(replay.draft.aiAcceptances.length,1);
  assert.equal(replay.versions['passage:a'],3);
  await assert.rejects(ai.run('analysis_cancel',{...params,passageId:'passage:other'},ctx,invoke),{code:'PASSAGE_MISMATCH'});
  await assert.rejects(ai.run('analysis_steer',{...params,passageId:'passage:other'},ctx,invoke),{code:'PASSAGE_MISMATCH'});
  await assert.rejects(ai.run('analysis_submit_batch',{projectId:project.id,items:[{passageId:'unknown'}]},ctx,invoke),{code:'PASSAGE_MISSING'});
  await assert.rejects(ai.run('ai_configure',{provider:'claude'},ctx,invoke),{code:'PROVIDER_UNAVAILABLE'});
});
