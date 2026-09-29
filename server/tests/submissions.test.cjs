'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {randomUUID,createHash}=require('node:crypto');
const {createTestStore}=require('./helpers.cjs');const {Submissions}=require('../submissions.cjs');const {sendDigests}=require('../digests.cjs');
async function fixture(t){
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'studio-submit-'));const store=await createTestStore(directory);
 t.after(async()=>{await store.close();await fs.rm(directory,{recursive:true,force:true});});
 for(const [id,role] of [['alice','contributor'],['bob','contributor'],['admin','admin']])await store.db.query('INSERT INTO users VALUES($1,$2,$3,$4,$5,0,$6)',[id,id+'@example.invalid',id,role,'fixture-only',Date.now()]);
 const user=store.publicUser(await store.user('alice')),admin=store.publicUser(await store.user('admin'));
 const project={id:'project:test',engineFingerprint:'engine:fixture',passages:[{id:'passage:a',sourceId:'araujo',sourceExpression:'amen',sourceFingerprint:'source:1',diplomatic:'Amen',normalized:'amém',translation:'',notes:'',witness:{}}]};await store.seed(project);
 const draft={...(await store.snapshot(project.id)).envelope.drafts['passage:a'],raw:'changed',revisionId:randomUUID()};await store.patch(project.id,[{id:'passage:a',version:1,draft}],user,'alice-tab');
 return {store,user,admin,project,draft,service:new Submissions(store)};
}
test('submitted author versions are immutable, idempotent and exportable without credentials',async t=>{
 const {store,user,project,draft,service}=await fixture(t);
 const item=await service.submit(user,{passageId:'passage:a',revisionId:draft.revisionId},project);
 const same=await service.submit(user,{passageId:'passage:a',revisionId:draft.revisionId},project);assert.equal(same.id,item.id);assert.equal(same.reused,true);
 const bob=store.publicUser(await store.user('bob'));await assert.rejects(service.submit(bob,{passageId:'passage:a',revisionId:draft.revisionId},project),{code:'SAVE_BEFORE_SUBMIT'});
 const exported=await service.export([item.id]);assert.equal(createHash('sha256').update(exported.submissions[0].snapshotJson).digest('hex'),item.snapshotSha256);
 assert.ok(!JSON.stringify(exported).includes('@example.invalid'));assert.ok(!JSON.stringify(exported).includes('fixture-only'));
 await assert.rejects(store.db.query('DELETE FROM submissions'),/append-only/);
 await store.patch(project.id,[{id:'passage:a',version:2,draft:{...draft,raw:'later correction',revisionId:randomUUID()}}],user,'alice-tab');
 assert.equal(JSON.parse((await service.get(item.id)).snapshot).draft.raw,'changed');
});
test('sending for review hands the passage back to everyone else',async t=>{
 const {store,user,project,draft,service}=await fixture(t);
 const bob=store.publicUser(await store.user('bob'));
 // The author holds the passage in the tab they are editing in; the submission
 // service is never told which tab that was, so the release cannot depend on it.
 await store.assertClaim('passage:a',user,'alice-tab',true);
 await assert.rejects(store.assertClaim('passage:a',bob,'bob-tab',true),{code:'PASSAGE_BUSY'});
 await service.submit(user,{passageId:'passage:a',revisionId:draft.revisionId},project);
 // No waiting for the two-minute expiry, and no tab of the author's keeps it.
 assert.deepEqual(await store.claimList(),[]);
 await store.assertClaim('passage:a',bob,'bob-tab',true);
 assert.equal((await store.claimList())[0].userId,'bob');
 // A repeated send is idempotent and must not disturb the new holder's claim.
 const again=await service.submit(user,{passageId:'passage:a',revisionId:draft.revisionId},project);
 assert.equal(again.reused,true);
 assert.equal((await store.claimList())[0].userId,'bob');
});
test('a failed submission never releases the passage the author is still holding',async t=>{
 const {store,user,project,service}=await fixture(t);
 await store.assertClaim('passage:a',user,'alice-tab',true);
 await assert.rejects(service.submit(user,{passageId:'passage:a',revisionId:randomUUID()},project),{code:'SAVE_BEFORE_SUBMIT'});
 assert.equal((await store.claimList()).length,1);
});
test('review decisions bind exact snapshots, and submissions never confer editorial approval',async t=>{
 const {user,admin,project,draft,service}=await fixture(t);const item=await service.submit(user,{passageId:'passage:a',revisionId:draft.revisionId},project);
 await assert.rejects(service.review(user,{id:item.id,event:'ready',snapshotSha256:item.snapshotSha256}),{code:'REVIEWER_REQUIRED'});
 await assert.rejects(service.review(admin,{id:item.id,event:'ready',snapshotSha256:'wrong'}),{code:'SUBMISSION_CHANGED'});
 await service.review(admin,{id:item.id,event:'ready',snapshotSha256:item.snapshotSha256});assert.equal((await service.list(user)).submissions[0].status,'ready');
});
test('first passage submission carries portable new source metadata without creating a reference',async t=>{
 const {store,user,project,service}=await fixture(t);
 project.sources=[{id:'new_witness',title:'Novo testemunho',year:'1700',fileName:'new_witness.tu.py',passageCount:0}];
 const id='pending:'+randomUUID(),revisionId=randomUUID();
 const draft={passageId:id,revisionId,sourceFingerprint:'pending',raw:'amen',diplomatic:'Amen',normalized:'',translation:'',notes:'',analysis:null,updatedAt:new Date().toISOString(),pending:{sourceId:'new_witness',ordinal:1}};
 await store.patch(project.id,[{id,version:0,draft}],user,'alice-tab');
 const submitted=await service.submit(user,{passageId:id,revisionId},project);
 const snapshot=JSON.parse((await service.get(submitted.id)).snapshot);
 assert.deepEqual(snapshot.source,{id:'new_witness',title:'Novo testemunho',year:'1700'});
 assert.equal(snapshot.original,null);assert.equal(snapshot.sourceId,'new_witness');
 assert.equal(snapshot.draft.raw,'amen');assert.equal(snapshot.draft.acceptedReference,undefined);
});
test('submission freezes saved own PDF regions and omits inherited-only evidence',async t=>{
 const {store,user,project,draft}=await fixture(t);
 const assetId='a'.repeat(64),region={id:randomUUID(),assetId,pageIndex:3,rect:[10,20,30,40]};
 let status={asset:{id:assetId},revision:7,passage:{regions:[region],view:{pageIndex:3,rotation:0,zoom:1}}};
 const service=new Submissions(store,{readEvidence:async params=>{assert.equal(params.passageId,'passage:a');return status;}});
 const submitted=await service.submit(user,{passageId:'passage:a',revisionId:draft.revisionId},project);
 region.rect[0]=999;
 const saved=JSON.parse((await service.get(submitted.id)).snapshot).evidence;
 assert.equal(saved.manifestRevision,7);assert.equal(saved.assetId,assetId);assert.equal(saved.regions[0].rect[0],10);
 const next={...draft,revisionId:randomUUID()};await store.patch(project.id,[{id:'passage:a',version:2,draft:next}],user,'alice-tab');
 status={asset:{id:assetId},revision:8,passage:null,inherited:{regions:[region]}};
 const inherited=await service.submit(user,{passageId:'passage:a',revisionId:next.revisionId},project);
 assert.equal(JSON.parse((await service.get(inherited.id)).snapshot).evidence,undefined);
});
test('durable merge digests retry failed SMTP and do not resend acknowledged batches',async t=>{
 const {store,user,project,draft,service}=await fixture(t);const item=await service.submit(user,{passageId:'passage:a',revisionId:draft.revisionId},project);
 await store.db.query('INSERT INTO merge_notifications(submission_id,user_id,commit_sha,merged_at) VALUES($1,$2,$3,$4)',[item.id,user.id,'a'.repeat(40),store.now()-86400001]);
 assert.equal((await sendDigests(store,async()=>{throw new Error('must not send');})).sent,0);
 assert.equal((await sendDigests(store,async()=>{throw new Error('SMTP fixture');},{mode:'daily'})).sent,0);
 const mail=[];assert.equal((await sendDigests(store,async message=>mail.push(message),{mode:'daily'})).sent,1);
 assert.equal((await sendDigests(store,async message=>mail.push(message),{mode:'daily'})).sent,0);
 assert.equal(mail.length,1);assert.ok(mail[0].body.includes(item.id));assert.match(mail[0].messageId,/studio.academiatupi.com/);
});
