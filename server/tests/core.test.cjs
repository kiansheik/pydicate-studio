'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {Store}=require('../store.cjs');
const {Auth,hashPassword,checkPassword,IDLE_MS}=require('../auth.cjs');
const {config}=require('../config.cjs');
const {authorizeMethod,Queue}=require('../studio.cjs');
const secret='uma senha longa para teste';
function fixture(t){const directory=fs.mkdtempSync(path.join(os.tmpdir(),'studio-collab-test-'));let now=1000000;
  const store=new Store(directory,{now:()=>now});t.after(()=>{store.close();fs.rmSync(directory,{recursive:true,force:true});});
  const project={id:'project:test',passages:['passage:a','passage:b'].map(id=>({id,sourceId:'araujo',sourceFingerprint:'source:1',sourceExpression:'amen',diplomatic:'Amen',normalized:'amém',translation:'',notes:'',witness:{}}))};store.seed(project);
  function user(id,role='contributor'){store.db.prepare('INSERT INTO users VALUES(?,?,?,?,?,0,?)').run(id,id+'@example.org',id,role,'test-only-hash',now);return store.publicUser(store.user(id));}
  return {store,project,user,advance:ms=>{now+=ms;}};}
function changed(snapshot,id,raw){return {id,version:snapshot.versions[id]??0,draft:{...snapshot.envelope.drafts[id],raw,revisionId:'revision:'+raw}};}
test('configuration fails closed for plaintext or paths and permits explicit loopback development',()=>{
  assert.throws(()=>config({COLLAB_PUBLIC_URL:'http://example.org',COLLAB_ALLOW_HTTP:'1'}));
  assert.throws(()=>config({COLLAB_PUBLIC_URL:'https://example.org/studio'}));
  assert.throws(()=>config({COLLAB_PUBLIC_URL:'http://localhost',COLLAB_ALLOW_HTTP:'1',COLLAB_HOST:'0.0.0.0'}));
  assert.equal(config({COLLAB_PUBLIC_URL:'http://localhost',COLLAB_ALLOW_HTTP:'1'}).secure,false);
  assert.equal(config({}).secure,true);
});
test('independent passage edits merge, stale same-passage saves never overwrite',t=>{
  const {store,user,advance}=fixture(t),alice=user('alice'),bob=user('bob');
  const first=store.snapshot('project:test');
  store.patch('project:test',[changed(first,'passage:a','one')],alice,'alice-tab');
  store.patch('project:test',[changed(first,'passage:b','two')],bob,'bob-tab');
  assert.equal(store.snapshot('project:test').envelope.drafts['passage:a'].raw,'one');
  advance(121000);
  assert.throws(()=>store.patch('project:test',[changed(first,'passage:a','lost')],bob,'bob-tab'),{code:'DRAFT_CONFLICT'});
  assert.equal(store.snapshot('project:test').envelope.drafts['passage:a'].raw,'one');
});
test('claims isolate users and tabs, expire and can be released only by their owner',t=>{
  const {store,user,advance}=fixture(t),a=user('a'),b=user('b');store.assertClaim('passage:a',a,'first-tab',true);
  assert.throws(()=>store.assertClaim('passage:a',a,'second-tab',true),{code:'PASSAGE_BUSY'});
  store.release('passage:a',b,'first-tab');assert.throws(()=>store.assertClaim('passage:a',b,'first-tab',true));
  advance(120001);store.assertClaim('passage:a',b,'second-tab',true);assert.equal(store.claimList()[0].userId,'b');
});
test('atomic patches roll back every passage and strip forged AI receipts',t=>{
  const {store,user}=fixture(t),a=user('a'),base=store.snapshot('project:test');
  const edit=changed(base,'passage:a','valid');edit.draft.aiAcceptances=[{fake:true}];
  assert.throws(()=>store.patch('project:test',[edit,{id:'passage:b',version:88,draft:{}}],a,'test-tab'));
  assert.equal(store.snapshot('project:test').envelope.drafts['passage:a'].raw,'amen');
  store.patch('project:test',[edit],a,'test-tab');assert.equal(store.snapshot('project:test').envelope.drafts['passage:a'].aiAcceptances,undefined);
  assert.equal(store.db.prepare('SELECT user_id FROM revisions').get().user_id,'a');
});
test('tombstones retain versions and canonical source drafts cannot be deleted',t=>{
  const {store,user}=fixture(t),a=user('a'),base=store.snapshot('project:test'),id='pending:123';
  const draft={...base.envelope.drafts['passage:a'],passageId:id};
  store.patch('project:test',[{id,version:0,draft}],a,'test-tab');store.patch('project:test',[{id,version:1,draft:null}],a,'test-tab');
  assert.equal(store.snapshot('project:test').versions[id],2);
  assert.throws(()=>store.patch('project:test',[{id,version:0,draft}],a,'test-tab'),{code:'DRAFT_CONFLICT'});
  assert.throws(()=>store.patch('project:test',[{id:'passage:a',version:1,draft:null}],a,'test-tab'),{code:'DRAFT_DELETE'});
});
test('editorial checkpoints coalesce but authors and old before-images are retained',t=>{
  const {store,user,advance}=fixture(t),a=user('a');
  store.patch('project:test',[changed(store.snapshot('project:test'),'passage:a','first')],a,'test-tab');
  advance(500);store.patch('project:test',[changed(store.snapshot('project:test'),'passage:a','second')],a,'test-tab');
  let rows=store.db.prepare('SELECT * FROM revisions').all();assert.equal(rows.length,1);assert.equal(JSON.parse(rows[0].before_json).raw,'amen');assert.equal(JSON.parse(rows[0].after_json).raw,'second');
  advance(31000);store.patch('project:test',[changed(store.snapshot('project:test'),'passage:a','third')],a,'test-tab');
  assert.equal(store.db.prepare('SELECT count(*) n FROM revisions').get().n,2);
});
test('comments have server authors, bounded threads and reviewer resolution',t=>{
  const {store,user}=fixture(t),a=user('a'),b=user('b'),reviewer=user('r','reviewer');
  const root=store.addComment(a,{passageId:'passage:a',body:'<script>not executed</script>'});
  store.addComment(b,{passageId:'passage:a',body:'Resposta',parentId:root.id});
  assert.throws(()=>store.addComment(b,{passageId:'passage:b',body:'wrong thread',parentId:root.id}),{code:'INVALID_THREAD'});
  assert.throws(()=>store.resolveComment(b,root.id,true),{code:'FORBIDDEN'});
  store.resolveComment(reviewer,root.id,true);assert.equal(store.comments('passage:a').comments[0].resolvedBy,'r');
});
test('telemetry retention does not delete scholarly history',t=>{
  const {store,user,advance}=fixture(t),a=user('a');store.patch('project:test',[changed(store.snapshot('project:test'),'passage:a','text')],a,'test-tab');
  advance(91*86400000);store.cleanup(90);assert.equal(store.db.prepare('SELECT count(*) n FROM audit').get().n,0);assert.equal(store.db.prepare('SELECT count(*) n FROM revisions').get().n,1);
});
test('password KDF is salted, rejects short passwords and supports Unicode',async()=>{
  await assert.rejects(hashPassword('short'));const a=await hashPassword(secret),b=await hashPassword(secret);
  assert.notEqual(a,b);assert.match(a,/^scrypt\$131072\$8\$1\$/);assert.equal(await checkPassword(secret,a),true);assert.equal(await checkPassword('incorrect',a),false);assert.equal(await checkPassword(secret,null),false);
});
test('invitation, reset single-use, revocation and last-admin protection',async t=>{
  const {store,advance}=fixture(t),mail=[];const auth=new Auth(store,{origin:'https://studio.example.org',sendMail:async message=>mail.push(message)});
  const adminId=await auth.createAdmin('owner@example.org','Owner',secret),admin=store.publicUser(store.user(adminId));
  const invited=await auth.invite(admin,{email:'student@example.org',name:'Student'});
  assert.equal(store.user(invited.id).password_hash,null);
  const token=/token=([A-Za-z0-9_-]+)/.exec(mail[0].body)[1];assert.equal(store.db.prepare('SELECT hash FROM password_tokens').get().hash.includes(token),false);
  await auth.reset({token,password:secret});await assert.rejects(auth.reset({token,password:secret}),{code:'INVALID_TOKEN'});
  const login=await auth.login({email:'student@example.org',password:secret},'127.0.0.1');assert.match(login.cookie,/HttpOnly; SameSite=Strict/);assert.match(login.cookie,/; Secure/);
  const session=auth.session(login.cookie);assert.equal(session.user.id,invited.id);assert.equal(auth.session(login.cookie+'; '+login.cookie),null);
  auth.updateUser(admin,{id:invited.id,role:'contributor',disabled:true});assert.equal(auth.session(login.cookie),null);
  assert.throws(()=>auth.updateUser(admin,{id:admin.id,role:'contributor',disabled:false}),{code:'LAST_ADMIN'});
  const ownerLogin=await auth.login({email:admin.email,password:secret},'127.0.0.2');advance(IDLE_MS+1);assert.equal(auth.session(ownerLogin.cookie),null);
});
test('hosted method policy denies new, paid, path and grammar operations',()=>{
  for(const method of ['source_apply','reference_approve','contribution_prepare'])assert.throws(()=>authorizeMethod(method,'contributor'),{code:'REVIEWER_REQUIRED'});
  for(const method of ['ai_submit','analysis_submit','parser_lab_prepare','source_recover','open_project','future_new_desktop_method'])assert.throws(()=>authorizeMethod(method,'admin'),{code:'HOSTED_UNAVAILABLE'});
  authorizeMethod('evaluate_expression','contributor');authorizeMethod('source_apply','reviewer');
});
test('worker queue serializes operations and bounds per-user backlog',async()=>{
  const queue=new Queue();let release;const wait=new Promise(resolve=>{release=resolve;});const tasks=[queue.run('one',()=>wait)];
  for(let i=0;i<7;i++)tasks.push(queue.run('one',()=>i));await assert.rejects(queue.run('one',()=>99),{code:'ENGINE_BUSY'});release();await Promise.all(tasks);assert.equal(queue.count,0);
});
module.exports={fixture,secret};
test('pending comments and reservations survive publication identity and report checkpoints',t=>{
  const {store,user}=fixture(t),a=user('a'),b=user('b');
  store.addComment(a,{passageId:'pending:line-id',body:'Before publication'});
  assert.equal(store.comments('passage:line-id').comments.length,1);
  store.assertClaim('pending:line-id',a,'a-tab',true);
  assert.throws(()=>store.assertClaim('passage:line-id',b,'b-tab',true),{code:'PASSAGE_BUSY'});
  store.patch('project:test',[changed(store.snapshot('project:test'),'passage:a','report')],a,'a-tab');
  assert.equal(store.report(7).contributions[0].checkpoints,1);
});
