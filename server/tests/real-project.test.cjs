'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {Store}=require('../store.cjs'),{createStudio}=require('../studio.cjs');
test('real selected Python engine opens and evaluates through hosted adapter without source writes',{
  skip:!process.env.COLLAB_REAL_PROJECT,timeout:180000,
},async t=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'studio-real-hosted-'));
  const validate=require('../../electron/validation.cjs');
  const store=new Store(directory,{validateEnvelope:validate.envelope});
  store.db.prepare('INSERT INTO users VALUES(?,?,?,?,?,0,?)').run('test-reviewer','test@example.org','Fixture reviewer','reviewer','test-only',Date.now());
  const runtime=await createStudio({stateDirectory:directory,applicationDirectory:path.resolve(__dirname,'../..'),parent:process.env.COLLAB_REAL_PROJECT,python:process.env.PYDICATE_PYTHON||'python3'},store);
  t.after(async()=>{await runtime.close();store.close();fs.rmSync(directory,{recursive:true,force:true});});
  const project=runtime.project,ctx={user:store.publicUser(store.user('test-reviewer')),clientId:'real-engine-tab'};
  assert.equal(project.mode,'local');assert.ok(project.passages.length>0);assert.equal(store.snapshot(project.id).envelope.projectId,project.id);
  const passage=project.passages.find(p=>p.sourceExpression?.trim());assert.ok(passage);
  const parsed=await runtime.invoke('parse_expression',{passageId:passage.id,sourceId:passage.sourceId,raw:passage.sourceExpression,revisionId:'hosted-smoke'},ctx);
  assert.ok(parsed.root,JSON.stringify(parsed.diagnostics));
  const result=await runtime.invoke('evaluate_expression',{passageId:passage.id,sourceId:passage.sourceId,raw:passage.sourceExpression,revisionId:'hosted-smoke',engineFingerprint:project.engineFingerprint},ctx);
  assert.equal(result.revisionId,'hosted-smoke');assert.equal(result.engineFingerprint,project.engineFingerprint);
  await assert.rejects(runtime.invoke('source_apply',{previewId:'not-issued',sourceFingerprint:'fake'},ctx),{code:'PREVIEW_REQUIRED'});
  await assert.rejects(runtime.invoke('analysis_submit',{},ctx),{code:'HOSTED_UNAVAILABLE'});
});
