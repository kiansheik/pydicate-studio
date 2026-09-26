'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {Store}=require('../store.cjs'),{Auth,hashPassword}=require('../auth.cjs'),{createHttp}=require('../http.cjs');
test('two real browsers: hosted bridge, independent edits, stale conflicts, presence, comments and expired-session recovery',{
  skip:process.env.COLLAB_BROWSER_TESTS!=='1',timeout:90000,
},async t=>{
  const {chromium}=require(process.env.COLLAB_PLAYWRIGHT_MODULE||'@playwright/test');
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'collab-browser-')),store=new Store(directory);
  const project={id:'project:browser',passages:['passage:a','passage:b'].map(id=>({id,sourceId:'araujo',sourceFingerprint:'source:1',sourceExpression:'amen',diplomatic:'Amen',normalized:'amém',translation:'',notes:'',witness:{}}))};store.seed(project);
  const password='browser fixture password',encoded=await hashPassword(password);
  for(const id of ['Alice','Bob'])store.db.prepare('INSERT INTO users VALUES(?,?,?,?,?,0,?)').run(id,id.toLowerCase()+'@example.org',id,'contributor',encoded,Date.now());
  const settings={origin:'http://127.0.0.1',secure:false,telemetryDays:90,stateDirectory:directory,distDirectory:path.join(directory,'dist')};
  fs.mkdirSync(path.join(settings.distDirectory,'assets'),{recursive:true});
  fs.writeFileSync(path.join(settings.distDirectory,'index.html'),`<!doctype html><html><head><script src="/assets/fixture.js" defer></script></head><body><h1>Browser transport fixture (not the React editor)</h1><select id="passage"><option>passage:a</option><option>passage:b</option></select><textarea id="editor"></textarea><p id="result"></p></body></html>`);
  fs.writeFileSync(path.join(settings.distDirectory,'assets/fixture.js'),`
    (async()=>{const saved=await window.studio.invoke('session_restore');const envelope=await window.studio.loadDrafts(saved.project.id);
    const editor=document.querySelector('#editor'),passage=document.querySelector('#passage'),result=document.querySelector('#result');
    async function select(){await window.studio.invoke('session_select',{projectId:saved.project.id,passageId:passage.value});editor.value=envelope.drafts[passage.value].raw;}
    passage.onchange=select;await select();result.textContent='ready';
    editor.onchange=async()=>{const id=passage.value;envelope.drafts[id]={...envelope.drafts[id],raw:editor.value,revisionId:crypto.randomUUID()};try{await window.studio.saveDrafts(envelope);result.textContent='saved';}catch(error){result.textContent=error.message;}};
    })();`);
  const runtime={project,hasPassage:id=>project.passages.some(p=>p.id===id),passage:id=>id,validateChanges:()=>{},refresh:async()=>project,invoke:async()=>null};
  const auth=new Auth(store,settings),app=createHttp({config:settings,store,auth,runtime});await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));settings.origin='http://127.0.0.1:'+app.server.address().port;
  const browser=await chromium.launch({headless:true,...(process.env.COLLAB_CHROMIUM?{executablePath:process.env.COLLAB_CHROMIUM}:{})});
  t.after(async()=>{await browser.close();await app.close();store.close();fs.rmSync(directory,{recursive:true,force:true});});
  const contexts=[await browser.newContext(),await browser.newContext()],pages=[];
  for(const [index,name]of ['alice','bob'].entries()){
    const page=await contexts[index].newPage();pages.push(page);await page.goto(settings.origin+'/login');await page.locator('#email').fill(name+'@example.org');await page.locator('#password').fill(password);await page.locator('#submit').click();await page.waitForURL(settings.origin+'/');await page.waitForFunction(()=>document.querySelector('#result')?.textContent==='ready');
  }
  const [alice,bob]=pages;
  await bob.locator('#passage').selectOption('passage:b');
  await alice.locator('#editor').fill('Alice changed A');await alice.locator('#editor').blur();await alice.waitForFunction(()=>document.querySelector('#result').textContent==='saved');
  await bob.locator('#editor').fill('Bob changed B');await bob.locator('#editor').blur();await bob.waitForFunction(()=>document.querySelector('#result').textContent==='saved');
  assert.equal(store.snapshot(project.id).envelope.drafts['passage:a'].raw,'Alice changed A');assert.equal(store.snapshot(project.id).envelope.drafts['passage:b'].raw,'Bob changed B');
  await bob.locator('#passage').selectOption('passage:a');await bob.locator('#editor').fill('stale Bob A');await bob.locator('#editor').blur();await bob.waitForFunction(()=>document.querySelector('#result').textContent.includes('DRAFT_CONFLICT'));
  assert.equal(await bob.locator('#editor').inputValue(),'stale Bob A');assert.equal(store.snapshot(project.id).envelope.drafts['passage:a'].raw,'Alice changed A');
  await alice.locator('#collab-toggle').click();
  await bob.locator('#collab-panel textarea').fill('Podemos conferir esta leitura?');await bob.getByRole('button',{name:'Enviar comentário',exact:true}).click();
  await alice.getByText('Podemos conferir esta leitura?',{exact:true}).waitFor();
  assert.ok((await alice.locator('#collab-panel').textContent()).includes('Bob'));
  auth.revoke('Alice');
  await alice.locator('#editor').fill('Alice retained offline');await alice.locator('#editor').blur();await alice.waitForFunction(()=>document.querySelector('#result').textContent.includes('SESSION_EXPIRED'));
  assert.equal(await alice.locator('#editor').inputValue(),'Alice retained offline');
  const download=alice.waitForEvent('download');await alice.getByRole('button',{name:'Exportar cópia local',exact:true}).click();assert.equal((await download).suggestedFilename(),'studio-local-recovery.json');
});
