'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {Store}=require('../store.cjs'),{Auth,hashPassword}=require('../auth.cjs'),{createHttp}=require('../http.cjs'),{authorizeMethod}=require('../studio.cjs');
test('authenticated HTTP transport: CSRF, roles, drafts, telemetry, comments, PDFs and static boundary',async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'collab-http-')),store=new Store(root),password='senha de integração longa';
  const project={id:'project:test',passages:[{id:'passage:a',sourceId:'araujo',sourceFingerprint:'source:1',sourceExpression:'amen',diplomatic:'Amen',normalized:'amém',translation:'',notes:'',witness:{}}]};store.seed(project);
  const hash=await hashPassword(password);for(const role of ['admin','contributor'])store.db.prepare('INSERT INTO users VALUES(?,?,?,?,?,0,?)').run(role,role+'@example.org',role,role,hash,Date.now());
  const settings={origin:'http://127.0.0.1',secure:false,telemetryDays:90,stateDirectory:root,distDirectory:path.join(root,'dist')};
  fs.mkdirSync(settings.distDirectory);fs.writeFileSync(path.join(settings.distDirectory,'index.html'),'<!doctype html><html><head></head><body>actual app slot</body></html>');
  const runtime={project,hasPassage:id=>id==='passage:a',passage:id=>{if(id!=='passage:a')throw Object.assign(new Error('Missing'),{status:404});return id;},validateChanges:()=>{},refresh:async()=>project,
    invoke:async(method,params,ctx)=>{authorizeMethod(method,ctx.user.role);if(method==='evidence_bytes')return new TextEncoder().encode('%PDF-test').buffer;return {method,projectId:project.id};}};
  const auth=new Auth(store,settings),app=createHttp({config:settings,store,auth,runtime});await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  settings.origin='http://127.0.0.1:'+app.server.address().port;auth.origin=settings.origin;
  t.after(async()=>{await app.close();store.close();fs.rmSync(root,{recursive:true,force:true});});
  async function post(route,value,session,headers={}){return fetch(settings.origin+route,{method:'POST',headers:{'Content-Type':'application/json',Origin:settings.origin,'X-Studio-Client':'integration-tab',...(session?{Cookie:session.cookie,'X-CSRF-Token':session.csrf}:{}),...headers},body:JSON.stringify(value)});}
  async function login(role){const response=await post('/api/login',{email:role+'@example.org',password});assert.equal(response.status,200);const value=await response.json();return {...value,cookie:response.headers.get('set-cookie').split(';')[0]};}
  assert.equal((await fetch(settings.origin+'/api/me')).status,401);
  assert.equal((await fetch(settings.origin+'/',{redirect:'manual'})).status,303);
  assert.equal((await post('/api/login',{email:'admin@example.org',password},null,{Origin:'https://evil.example'})).status,403);
  const admin=await login('admin'),user=await login('contributor');
  const page=await fetch(settings.origin+'/',{headers:{Cookie:user.cookie}});assert.equal(page.status,200);assert.match(await page.text(),/collab\/bridge.js/);assert.equal(page.headers.get('x-frame-options'),'DENY');
  assert.equal((await fetch(settings.origin+'/server/auth.cjs',{headers:{Cookie:user.cookie}})).status,404);
  assert.equal((await post('/api/drafts/load',{projectId:project.id},user,{'X-CSRF-Token':'wrong'})).status,403);
  assert.equal((await post('/api/invoke',{method:'reference_approve',params:{}},user)).status,403);
  assert.equal((await post('/api/invoke',{method:'analysis_submit',params:{}},admin)).status,403);
  assert.equal((await fetch(settings.origin+'/api/admin/report',{headers:{Cookie:user.cookie}})).status,403);
  const loaded=await(await post('/api/drafts/load',{projectId:project.id},user)).json();
  const draft={...loaded.envelope.drafts['passage:a'],raw:'changed by student'};
  const save=await post('/api/drafts',{projectId:project.id,changes:[{id:'passage:a',version:1,draft}],userId:'admin'},user);assert.equal(save.status,200);assert.equal(store.db.prepare('SELECT user_id FROM revisions').get().user_id,'contributor');
  const stale=await post('/api/drafts',{projectId:project.id,changes:[{id:'passage:a',version:1,draft}]},user);assert.equal(stale.status,409);
  await post('/api/usage',{event:'editor.batch',passageId:'passage:a',userId:'admin',details:{password:'never store this',text:'private text'}},user);
  const telemetry=store.db.prepare("SELECT * FROM audit WHERE origin='browser'").get();assert.equal(telemetry.user_id,'contributor');assert.equal(JSON.stringify(telemetry).includes('private text'),false);
  assert.equal((await post('/api/usage',{event:'auth.password-reset'},user)).status,400);
  await post('/api/comment',{passageId:'passage:a',body:'A minha dúvida',authorId:'admin'},user);
  const comments=await(await fetch(settings.origin+'/api/comments?passageId=passage:a',{headers:{Cookie:admin.cookie}})).json();assert.equal(comments.comments[0].authorId,'contributor');
  const pdf=await post('/api/invoke',{method:'evidence_bytes',params:{passageId:'passage:a'}},user);assert.equal(pdf.headers.get('content-type'),'application/pdf');assert.equal(await pdf.text(),'%PDF-test');
  assert.equal((await post('/api/pdf',{},user)).status,403);
  await post('/api/admin/user',{id:'contributor',role:'contributor',disabled:true},admin);
  assert.equal((await post('/api/drafts/load',{projectId:project.id},user)).status,401);
});
