'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {createTestStore}=require('./helpers.cjs');
const {Auth,token,digest}=require('../auth.cjs');
const {AcademiaIdentity}=require('../identity.cjs');
const secret='existing local account password';
async function setup(t){
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'identity-test-'));let now=1000000;
  const store=await createTestStore(dir,{now:()=>now});
  const key=path.join(dir,'identity-key');await fs.writeFile(key,'a'.repeat(64),{mode:0o600});
  const mail=[];const auth=new Auth(store,{origin:'https://studio.example.org',sendMail:async message=>mail.push(message)});
  const id=await auth.createAdmin('owner@example.org','Owner',secret);const admin=store.publicUser(await store.user(id));
  let valid=true,fail=false;
  const claims={iss:'https://neo.example.org',aud:'pydicate-studio',sub:'10000000-0000-4000-8000-000000000000',email:'student@example.org',email_verified:true,name:'Student',auth_revision:'c'.repeat(64)};
  const identity=new AcademiaIdentity(store,auth,{enabled:true,issuer:claims.iss,clientId:claims.aud,secretFile:key},async(url,options)=>{
    assert.equal(options.redirect,'error');assert.equal(options.headers['X-Studio-Client-Secret'],'a'.repeat(64));
    if(fail)throw new Error('provider down');
    if(url.endsWith('introspect'))return Response.json(valid?{active:true,...claims}:{active:false});
    return Response.json(claims);
  });auth.identity=identity;
  t.after(async()=>{await store.close();await fs.rm(dir,{recursive:true,force:true});});
  return {store,auth,identity,admin,mail,claims,advance:ms=>now+=ms,invalidate:()=>valid=false,outage:()=>fail=true};
}
function reply(flow,overrides={}){const url=new URL(flow.url);return {code:token(),state:url.searchParams.get('state'),iss:'https://neo.example.org',...overrides};}
async function invite(f){await f.auth.invite(f.admin,{email:'student@example.org',name:'Student'});return /token=([A-Za-z0-9_-]+)/.exec(f.mail.at(-1).body)[1];}
test('verified Neo invitation links identity with no copied password or elevated role',async t=>{
  const returnTo='/?passage=passage%3Atest&view=tree&tab=enosem&node=var%3A1';
  const f=await setup(t),invitation=await invite(f),flow=await f.identity.start({inviteToken:invitation,returnTo});
  assert.match(flow.destinationCookie,/; Path=\/; HttpOnly; SameSite=Lax; Max-Age=600; Secure$/);
  const result=await f.identity.finish(reply(flow,{returnTo:'https://evil.example/'}),flow.cookie+'; '+flow.destinationCookie);const session=await f.auth.session(result.cookie);
  assert.equal(result.returnTo,returnTo,'Only the destination bound at start survives the callback');
  assert.equal(session.user.authMethod,'academia');assert.equal(session.user.role,'contributor');
  assert.equal((await f.store.user(session.user.id)).password_hash,null);
  assert.equal((await f.store.db.query('SELECT * FROM identity_links')).rows[0].subject,f.claims.sub);
  await assert.rejects(f.identity.finish(reply(flow),flow.cookie),{code:'IDENTITY_STATE'});
  await assert.rejects(f.auth.reset({token:invitation,password:secret}),{code:'INVALID_TOKEN'});
});
test('a later SSO attempt cannot inherit a prior attempt destination',async t=>{
  const f=await setup(t),invitation=await invite(f);
  const previous=await f.identity.start({inviteToken:invitation,returnTo:'/?passage=previous'});
  const current=await f.identity.start({inviteToken:invitation,returnTo:'/?passage=current'});
  const result=await f.identity.finish(reply(current),current.cookie+'; '+previous.destinationCookie);
  assert.equal(result.returnTo,'/');
  assert.ok(await f.auth.session(result.cookie));
});
test('email match alone does not enroll an uninvited Neo account or take over a local account',async t=>{
  const f=await setup(t);let flow=await f.identity.start();await assert.rejects(f.identity.finish(reply(flow),flow.cookie),{code:'STUDIO_INVITE_REQUIRED'});
  const invitation=await invite(f);await f.auth.reset({token:invitation,password:secret});
  flow=await f.identity.start();await assert.rejects(f.identity.finish(reply(flow),flow.cookie),{code:'STUDIO_INVITE_REQUIRED'});
});
test('wrong state, issuer or browser and expired invitations cannot establish a session',async t=>{
  const f=await setup(t),invitation=await invite(f),flow=await f.identity.start({inviteToken:invitation});
  await assert.rejects(f.identity.finish(reply(flow,{iss:'https://evil.example'}),flow.cookie),{code:'IDENTITY_STATE'});
  await assert.rejects(f.identity.finish(reply(flow),''),{code:'IDENTITY_STATE'});
  await assert.rejects(f.identity.finish(reply(flow,{state:token()}),flow.cookie),{code:'IDENTITY_STATE'});
  f.advance(49*3600000);await assert.rejects(f.identity.finish(reply(flow),flow.cookie),{code:'IDENTITY_STATE'});
});
test('password reset or disable at Neo invalidates Studio access after bounded recheck',async t=>{
  const f=await setup(t),invitation=await invite(f),flow=await f.identity.start({inviteToken:invitation});
  const login=await f.identity.finish(reply(flow),flow.cookie);assert.ok(await f.auth.session(login.cookie));
  f.advance(60001);f.invalidate();assert.equal(await f.auth.session(login.cookie),null);
});
test('identity outage fails closed for SSO but leaves the local recovery administrator usable',async t=>{
  const f=await setup(t),invitation=await invite(f),flow=await f.identity.start({inviteToken:invitation});
  const login=await f.identity.finish(reply(flow),flow.cookie);f.advance(60001);f.outage();
  await assert.rejects(f.auth.session(login.cookie),{code:'IDENTITY_UNAVAILABLE'});
  const local=await f.auth.login({email:f.admin.email,password:secret},'loopback');assert.ok(await f.auth.session(local.cookie));
});
test('local account linking requires current password and removes its old password/session',async t=>{
  const f=await setup(t),invitation=await invite(f);await f.auth.reset({token:invitation,password:secret});
  const old=await f.auth.login({email:'student@example.org',password:secret},'test');const session=await f.auth.session(old.cookie);
  await assert.rejects(f.identity.start({currentPassword:'wrong'},session),{code:'PASSWORD_WRONG'});
  const flow=await f.identity.start({currentPassword:secret},session);const current=await f.identity.finish(reply(flow),flow.cookie);
  assert.equal(await f.auth.session(old.cookie),null);assert.equal((await f.auth.session(current.cookie)).user.authMethod,'academia');
});
