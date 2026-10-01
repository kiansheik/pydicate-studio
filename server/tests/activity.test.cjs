'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { randomUUID } = require('node:crypto');
const { createTestStore } = require('./helpers.cjs');
const { Store } = require('../store.cjs');
const { recordActivity, interval, subtract } = require('../activity.cjs');

async function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-credit-'));
  let now = 1000000;
  const store = await createTestStore(directory, { now: () => now, passageClaims: false });
  t.after(async () => { await store.close(); fs.rmSync(directory, { recursive: true, force: true }); });
  for (const id of ['alice', 'bob']) await store.db.query('INSERT INTO users VALUES($1,$2,$1,$3,$4,0,$5)', [id, id + '@example.invalid', 'contributor', 'test', now]);
  const alice = store.publicUser(await store.user('alice')), bob = store.publicUser(await store.user('bob'));
  const project = { id: 'test', passages: [{ id: 'passage:a', sourceFingerprint: 'fingerprint', sourceExpression: 'a', diplomatic: '', normalized: '', translation: '', notes: '', witness: {} }] };
  await store.seed(project);
  return { store, directory, alice, bob, time: () => now, advance: ms => { now += ms; } };
}
function event(start, end, extra = {}) {
  return { eventId: randomUUID(), intervalStartMs: start, intervalEndMs: end, durationMs: end-start, ...extra };
}
test('intervals are bounded to server time and preserve gaps when removing overlaps', () => {
  assert.deepEqual(interval(event(0, 1000000), 1000000), [970000, 1000000]);
  assert.equal(interval(event(0, 30000), 1000000), null);
  assert.deepEqual(interval(event(990000, 1001000), 1000000), [990000, 1000000]);
  for (const bad of [{durationMs:NaN}, {durationMs:-1}, {intervalEndMs:1006000}, {eventId:'arbitrary text'}])
    assert.throws(() => interval(event(990000,1000000,bad),1000000),{code:'INVALID_ACTIVITY'});
  assert.deepEqual(subtract([0,30],[[5,10],[20,25],[7,12]]),[[0,5],[12,20],[25,30]]);
});
test('simultaneous tabs, exact retries and later processes never double count a person', async t => {
  const { store, directory, alice, bob, time, advance } = await fixture(t);
  const first = event(970000,1000000);
  const results = await Promise.all([
    recordActivity(store,alice,first,'passage:a'),
    recordActivity(store,alice,event(975000,1000000),'passage:b'),
  ]);
  assert.equal(results.reduce((sum,row)=>sum+row.acceptedMs,0),30000);
  assert.equal((await recordActivity(store,alice,first,'passage:b')).duplicate,true);
  await recordActivity(store,bob,event(970000,1000000),'passage:a');
  advance(10000);
  const reopened = await Store.open(directory,{databaseUrl:process.env.COLLAB_TEST_DATABASE_URL,schema:store.db.schema,now:time});
  try { assert.equal((await recordActivity(reopened,alice,event(985000,1010000),'passage:b')).acceptedMs,10000); }
  finally { await reopened.close(); }
  const report = await store.report(0);
  assert.deepEqual(report.activeTime.users.map(row=>[row.userId,row.activeMs]),[['alice',40000],['bob',30000]]);
  assert.equal(report.activeTime.trackingSince,1000000);
  assert.equal(report.activeTime.passages.filter(row=>row.userId==='alice').reduce((sum,row)=>sum+row.activeMs,0),40000);
  assert.equal(report.contributions.length,0);
  advance(8*86400000);
  assert.equal((await store.report(7)).activeTime.users.length,0);
  assert.equal((await store.report(0)).activeTime.users[0].activeMs,40000);
});
test('contribution credits count substantive saves and confirmed server work, not views or draft UI state', async t => {
  const {store,alice,bob} = await fixture(t);
  async function save(change) {
    const snapshot=await store.snapshot('test');
    await store.patch('test',[{id:'passage:a',version:snapshot.versions['passage:a'],draft:{...snapshot.envelope.drafts['passage:a'],...change}}],alice,'tab');
  }
  await save({revisionId:'camera',canvas:{positions:{root:{x:30,y:10}}},updatedAt:'later',sourceFingerprint:'new'});
  let report=await store.report(0);
  assert.equal(report.contributions[0].checkpoints,1);
  assert.equal(report.contributions[0].passages,0);
  await save({translation:'Sentido revisado'});
  await save({raw:'a.var(1)'});
  await store.audit(alice.id,'navigation.passage','passage:view-only','succeeded',null,'browser');
  await store.audit(alice.id,'operation.evidence_save','pending:a','succeeded',null,'server',{regionsChanged:true});
  await store.audit(alice.id,'operation.evidence_save','passage:a','succeeded',null,'server',{regionsChanged:true});
  await store.audit(alice.id,'operation.evidence_save','passage:zoom','succeeded',null,'server',{regionsChanged:false});
  await store.audit(alice.id,'operation.evidence_save','passage:legacy');
  await store.audit(alice.id,'operation.evidence_save','passage:failed','failed');
  await store.audit(alice.id,'operation.source_apply','passage:forged','succeeded',null,'browser');
  await store.audit(alice.id,'operation.analysis_submit','passage:proposed');
  await store.audit(alice.id,'operation.lexical_notes_save','passage:lexical');
  await store.addComment(bob,{passageId:'pending:a',body:'Comentário salvo'});
  report=await store.report(0);
  assert.deepEqual(report.contributions.map(row=>[row.userId,row.passages]),[['alice',2],['bob',1]]);
  assert.equal(report.contributions[0].kinds.saved,2);
  assert.equal(report.contributions[0].kinds.regions,2);
  assert.equal(report.unclassifiedEvidenceSaves[0].saves,1);
  assert.ok(report.contributionPassages.every(row=>!row.passageId.startsWith('pending:')));
  assert.equal(JSON.stringify(report).includes('Sentido revisado'),false);
  assert.equal(JSON.stringify(report).includes('Comentário salvo'),false);
});
test('empty pending shells and source bootstrap do not grant credit; detached authored trees do', async t => {
  const {store,alice} = await fixture(t);
  const pending={passageId:'pending:new',revisionId:'new',raw:'',diplomatic:'',translation:'',locators:{section:'inherited'},pending:{sourceId:'source'}};
  await store.patch('test',[{id:pending.passageId,version:0,draft:pending}],alice,'tab');
  await store.patch('test',[{id:'passage:new',version:0,draft:{...pending,passageId:'passage:new',raw:'already_saved'}}],alice,'tab');
  assert.equal((await store.report(0)).contributions[0].passages,0);
  const canvas={fragments:[{id:'piece',raw:'tym',x:10,y:10}]};
  await store.patch('test',[{id:pending.passageId,version:1,draft:{...pending,canvas}}],alice,'tab');
  await store.patch('test',[{id:pending.passageId,version:2,draft:{...pending,canvas:{fragments:[{...canvas.fragments[0],x:80}]}}}],alice,'tab');
  let report=await store.report(0);assert.equal(report.contributions[0].passages,1);assert.equal(report.contributions[0].kinds.saved,1);
  await store.patch('test',[{id:pending.passageId,version:3,draft:{...pending,canvas:{fragments:[]}}}],alice,'tab');
  report=await store.report(0);assert.equal(report.contributions[0].kinds.saved,2);
  const authored={...pending,passageId:'pending:authored',raw:'tym'};
  await store.patch('test',[{id:authored.passageId,version:0,draft:authored}],alice,'tab');
  assert.equal((await store.report(0)).contributions[0].passages,2);
});
