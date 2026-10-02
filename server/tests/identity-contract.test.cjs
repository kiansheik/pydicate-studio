'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs/promises');
const net=require('node:net'),{spawn,execFile}=require('node:child_process'),{promisify}=require('node:util');
const {createTestStore}=require('./helpers.cjs'),{Auth}=require('../auth.cjs'),{createHttp}=require('../http.cjs');
async function freePort(){const server=net.createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;await new Promise(resolve=>server.close(resolve));return port;}
test('real Neo and Studio servers: existing login, invited identity, separate cookies and password-revision revocation',{
  skip:!process.env.NEO_API_DIR,timeout:90000,
},async t=>{
  const directory=await fs.mkdtemp(path.join(require('node:os').tmpdir(),'identity-contract-'));
  const store=await createTestStore(directory),project={id:'project:identity-contract',passages:[]};
  t.after(async()=>{await store.close();await fs.rm(directory,{recursive:true,force:true});});
  const port=await freePort(),issuer='http://127.0.0.1:'+port,studioPort=await freePort(),origin='http://127.0.0.1:'+studioPort;
  const secret='c'.repeat(64),secretFile=path.join(directory,'identity-secret');await fs.writeFile(secretFile,secret,{mode:0o600});
  const python=process.env.NEO_PYTHON||'python3';
  const env={...process.env,COLLAB_IDENTITY_CONTRACT:'1',NEO_TEST_PORT:String(port),APP_ENV:'test',
    DATABASE_URL:'sqlite+aiosqlite:///'+path.join(directory,'neo.db'),SECRET_KEY:'disposable-contract-only',
    STUDIO_SSO_ENABLED:'true',STUDIO_SSO_CLIENT_SECRET:secret,STUDIO_SSO_REDIRECT_URI:origin+'/sso/callback',
    API_PUBLIC_URL:issuer,APP_PUBLIC_URL:issuer,SESSION_COOKIE_SECURE:'false',REQUIRE_VERIFIED_EMAIL:'false',TURNSTILE_ENABLED:'false',EMAIL_DELIVERY:'log'};
  let logs='';const neo=spawn(python,['-B',path.join(__dirname,'neo-fixture.py')],{env,stdio:['ignore','pipe','pipe']});
  neo.stdout.on('data',b=>{logs=(logs+b).slice(-4000);});neo.stderr.on('data',b=>{logs=(logs+b).slice(-4000);});
  t.after(async()=>{neo.kill('SIGTERM');await Promise.race([new Promise(resolve=>neo.once('exit',resolve)),new Promise(resolve=>setTimeout(()=>{neo.kill('SIGKILL');resolve();},3000))]);});
  let ready=false;const deadline=Date.now()+30000;while(Date.now()<deadline&&neo.exitCode===null){try{ready=(await fetch(issuer+'/healthz',{signal:AbortSignal.timeout(1000)})).ok;}catch{}if(ready)break;await new Promise(r=>setTimeout(r,100));}
  assert.equal(ready,true,logs);
  const settings={origin,secure:false,telemetryDays:null,release:'contract-test',stateDirectory:directory,distDirectory:directory,
    identity:{enabled:true,issuer,clientId:'pydicate-studio',secretFile,allowHttp:true}};
  const auth=new Auth(store,{...settings,sendMail:async()=>{}});
  const adminId=await auth.createAdmin('owner@example.org','Owner','local recovery account password'),admin=store.publicUser(await store.user(adminId));
  const runtime={project,hasPassage:()=>true,passage:id=>id,validateChanges:()=>{},invoke:async()=>null};
  const app=createHttp({config:settings,store,auth,runtime});await new Promise(r=>app.server.listen(studioPort,'127.0.0.1',r));t.after(()=>app.close());
  const invited=await auth.invite(admin,{email:'identity@example.org',name:'Identity student'}),inviteToken=await auth.issueToken(invited.id,'invite');
  const registered=await fetch(issuer+'/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'identity@example.org',password:'password kept only inside Neo',display_name:'Existing Neo user'})});
  assert.equal(registered.status,201,await registered.clone().text());const neoCookie=registered.headers.get('set-cookie').split(';')[0];
  let studioCookie;
  const returnTo='/?passage=passage%3Aidentity-contract&source=araujo&view=tree&tab=enosem&node=var%3A1';
  if(process.env.COLLAB_IDENTITY_BROWSER==='1'){
    const {chromium}=require(process.env.COLLAB_PLAYWRIGHT_MODULE||'@playwright/test');
    const browser=await chromium.launch({headless:true,...(process.env.COLLAB_CHROMIUM?{executablePath:process.env.COLLAB_CHROMIUM}:{})});
    t.after(()=>browser.close());
    const context=await browser.newContext(),page=await context.newPage(),violations=[],requests=[];
    const separator=neoCookie.indexOf('='),neoBrowserCookie={name:neoCookie.slice(0,separator),value:neoCookie.slice(separator+1),url:issuer,httpOnly:true,sameSite:'Lax'};
    await context.addCookies([neoBrowserCookie]);
    await fs.writeFile(path.join(directory,'index.html'),'<!doctype html><html><head><title>Identity fixture</title></head><body>Authenticated Studio fixture</body></html>');
    page.on('console',message=>{if(message.text().includes('form-action'))violations.push('form-action');});
    page.on('response',response=>{const url=new URL(response.url());if(url.pathname.includes('/sso/')||url.pathname.includes('/studio/authorize'))requests.push(response.request().method()+' '+url.pathname+' '+response.status());});
    await page.goto(origin+'/account?returnTo='+encodeURIComponent(returnTo)+'#token='+encodeURIComponent(inviteToken));
    await page.waitForFunction(()=>!location.hash);
    assert.equal(new URL(page.url()).searchParams.get('returnTo'),returnTo);
    await page.getByRole('button',{name:'Entrar com Academia Tupi / Neologismos',exact:true}).click();
    await page.getByText('Continuar como',{exact:false}).waitFor();
    assert.equal(new URL(page.url()).origin,issuer);
    const finished=page.waitForResponse(response=>response.url()===origin+'/api/sso/finish'&&response.request().method()==='POST',{timeout:15000});
    finished.catch(()=>{}); // A rejected consent POST fails below before callback timeout.
    const approved=page.waitForResponse(response=>response.url().startsWith(issuer+'/api/auth/studio/authorize')&&response.request().method()==='POST',{timeout:15000}).catch(()=>null);
    await page.getByRole('button',{name:'Continuar no Studio',exact:true}).click({noWaitAfter:true});
    const approval=await approved;
    assert.ok(approval,'Browser consent POST/redirect was blocked; CSP violations: '+(violations.join(', ')||'none observed'));
    assert.equal(approval.status(),303,approval.status()===303?'':'Neo browser consent POST: '+await approval.text()+'; Origin: '+(await approval.request().allHeaders()).origin);
    let response;
    try{response=await finished;}catch{assert.fail('Browser consent did not reach the cross-origin Studio callback; CSP violations: '+(violations.join(', ')||'none observed')+'; requests: '+requests.join(', ')+'; page: '+new URL(page.url()).pathname);}
    assert.equal(response.status(),200,response.status()===200?'':await response.text());
    await page.waitForURL(origin+returnTo);
    assert.equal((await context.cookies(origin)).some(cookie=>cookie.name==='studio-dev-identity-return'),false,'The return cookie is cleared after successful callback');
    assert.deepEqual(violations,[],'Consent permits the configured cross-origin callback');
    const cookie=(await context.cookies(origin)).find(cookie=>cookie.name==='pydicate-dev-session');
    assert.ok(cookie,'The actual callback page establishes a Studio browser session');
    studioCookie=cookie.name+'='+cookie.value;
    t.diagnostic('Real browser invitation, Neo consent POST, cross-origin callback and Studio cookie passed.');
  }else{
  const started=await fetch(origin+'/api/sso/start',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify({inviteToken,returnTo})});
  assert.equal(started.status,200);const flowCookie=started.headers.getSetCookie().map(cookie=>cookie.split(';')[0]).join('; '),authorize=(await started.json()).url;
  const consent=await fetch(authorize,{headers:{Cookie:neoCookie}}),html=await consent.text();assert.match(html,/Continuar como/);
  const fields=Object.fromEntries([...html.matchAll(/name="([^"]+)" value="([^"]*)"/g)].map(m=>[m[1],m[2].replaceAll('&amp;','&').replaceAll('&#x27;',"'").replaceAll('&quot;','"')]));
  const nonceCookie=consent.headers.get('set-cookie').split(';')[0];
  const approved=await fetch(issuer+'/api/auth/studio/authorize',{method:'POST',redirect:'manual',headers:{Cookie:neoCookie+'; '+nonceCookie,Origin:issuer,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(fields)});
  assert.equal(approved.status,303,await approved.clone().text());const callback=new URL(approved.headers.get('location'));
  const result=await fetch(origin+'/api/sso/finish',{method:'POST',headers:{Cookie:flowCookie,Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(Object.fromEntries(new URLSearchParams(callback.hash.slice(1))))});
  assert.equal(result.status,200,await result.clone().text());
  assert.equal((await result.json()).returnTo,returnTo);
  studioCookie=result.headers.getSetCookie().find(c=>c.startsWith('pydicate-dev-session=')).split(';')[0];
  }
  assert.notEqual(studioCookie.split('=')[0],neoCookie.split('=')[0]);assert.equal((await store.user(invited.id)).password_hash,null);
  const me=await fetch(origin+'/api/me',{headers:{Cookie:studioCookie}});assert.equal(me.status,200);assert.equal((await me.json()).user.id,invited.id);
  assert.equal((await fetch(origin+'/api/me',{headers:{Cookie:neoCookie}})).status,401);
  // Change the authoritative Neo password revision; Studio must reject on its next check.
  await promisify(execFile)(python,['-c',"import sqlite3,sys;c=sqlite3.connect(sys.argv[1]);c.execute(\"UPDATE users SET hashed_password='changed by contract fixture' WHERE email='identity@example.org'\");c.commit()",path.join(directory,'neo.db')]);
  await store.db.query('UPDATE identity_sessions SET checked_at=0');
  assert.equal((await fetch(origin+'/api/me',{headers:{Cookie:studioCookie}})).status,401);
});
