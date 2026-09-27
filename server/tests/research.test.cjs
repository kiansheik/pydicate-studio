'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {createHash}=require('node:crypto');const {createTestStore}=require('./helpers.cjs');
const {exportResearch,researchPage}=require('../research.cjs');const {ProviderVault}=require('../provider-vault.cjs');
async function setup(t){const directory=await fs.mkdtemp(path.join(os.tmpdir(),'studio-pg-research-'));const store=await createTestStore(directory);
 t.after(async()=>{await store.close();await fs.rm(directory,{recursive:true,force:true});});
 for(const name of ['alice','bob'])await store.db.query('INSERT INTO users VALUES($1,$2,$3,$4,$5,0,$6)',[name,name+'@example.org',name,'contributor','private-test-hash',Date.now()]);
 const user=store.publicUser(await store.user('alice'));return {store,directory,user};}
test('concurrent transactions use their own clients and rollback only their own writes',async t=>{
 const {store}=await setup(t);
 const outcomes=await Promise.allSettled([
  store.transaction(async()=>{await store.audit('alice','first.before-failure');await new Promise(r=>setTimeout(r,25));throw new Error('rollback fixture');}),
  store.transaction(async()=>{await store.audit('bob','second.committed');}),
 ]);
 assert.equal(outcomes[0].status,'rejected');assert.equal(outcomes[1].status,'fulfilled');
 const rows=(await store.db.query('SELECT event FROM audit')).rows;assert.deepEqual(rows,[{event:'second.committed'}]);
});
test('two simultaneous claims have exactly one owner',async t=>{
 const {store,user}=await setup(t),bob=store.publicUser(await store.user('bob'));
 const outcomes=await Promise.allSettled([store.assertClaim('passage:concurrent',user,'alice-tab',true),store.assertClaim('passage:concurrent',bob,'bob-tab',true)]);
 assert.equal(outcomes.filter(o=>o.status==='fulfilled').length,1);assert.equal((await store.claimList()).length,1);
});
test('research rows cannot be edited/deleted and never expire, even after decades',async t=>{
 const {store}=await setup(t);await store.audit('alice','research.fixture');
 await assert.rejects(store.db.query('DELETE FROM audit'),/append-only/);
 await assert.rejects(store.db.query("UPDATE audit SET event='altered'"),/append-only/);
 const old=store.now;store.now=()=>old()+100*365*86400000;await store.cleanup();
 assert.equal((await store.report(0)).operations.length,1);assert.equal((await store.report(7)).operations.length,0);
});
test('all-time research export is checksummed and omits credentials and identity emails',async t=>{
 const {store,directory}=await setup(t);store.context={appRelease:'fixture-sha',engineFingerprint:'engine:fixture'};
 await store.audit('alice','research.fixture',null,'succeeded',11);
 const manifest=await exportResearch(store,path.join(directory,'export'));
 const file=manifest.files.find(f=>f.name==='audit.jsonl');assert.equal(file.records,1);
 const contents=await fs.readFile(path.join(directory,'export/audit.jsonl'));
 assert.equal(createHash('sha256').update(contents).digest('hex'),file.sha256);
 assert.ok(contents.toString().includes('fixture-sha'));assert.ok(!contents.toString().includes('@example.org'));
 assert.ok(!JSON.stringify(manifest).includes('private-test-hash'));
 await assert.rejects(exportResearch(store,path.join(directory,'export')));
});
test('research pagination freezes a high-water mark and disallows secret-table export',async t=>{
 const {store}=await setup(t);await store.audit('alice','page.first');
 const first=await researchPage(store,'audit');await store.audit('alice','page.second');
 const retained=await researchPage(store,'audit',0,first.through);assert.equal(retained.records.length,1);
 await assert.rejects(researchPage(store,'sessions'),{code:'EXPORT_KIND'});
});
test('provider keys are encrypted per user/provider, not returned, and generation remains off',async t=>{
 const {store,directory,user}=await setup(t);const keyFile=path.join(directory,'vault');await fs.writeFile(keyFile,'ab'.repeat(32),{mode:0o400});
 const vault=new ProviderVault(store,keyFile),secret='sk-fixture-key-never-use-outside-this-test';
 const result=await vault.save(user,{provider:'codex',funding:'personal',monthlyLimitCents:500,apiKey:secret});
 assert.equal(result.enabled,false);assert.equal(result.providers[0].configured,true);assert.ok(!JSON.stringify(result).includes(secret));
 const record=(await store.db.query('SELECT * FROM provider_settings')).rows[0];assert.ok(!record.credential_ciphertext.includes(secret));
 assert.equal(await vault.decrypt('alice','codex',record.credential_ciphertext),secret);
 await assert.rejects(vault.decrypt('bob','codex',record.credential_ciphertext));
 assert.equal((await vault.status({id:'bob'})).providers[0].configured,false);
 await vault.save(user,{provider:'codex',funding:'disabled',monthlyLimitCents:0,removeKey:true});
 assert.equal((await vault.status(user)).providers[0].configured,false);
 const audit=(await store.db.query('SELECT * FROM audit')).rows;assert.ok(!JSON.stringify(audit).includes(secret));
});
test('migration checksum history is stable and startup rejects altered schema history',async t=>{
 const {store}=await setup(t);await store.db.migrate();const rows=(await store.db.query('SELECT * FROM schema_migrations ORDER BY version')).rows;
 assert.deepEqual(rows.map(row=>row.version),['001_collaboration.sql','002_submissions.sql','003_identity.sql','004_desktop_imports.sql']);
 await store.db.query("UPDATE schema_migrations SET checksum='bad' WHERE version=$1",[rows[0].version]);
 await assert.rejects(store.db.migrate(),/checksum changed/);
});
