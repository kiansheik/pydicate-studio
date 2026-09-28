'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os');
const { createIdle, upstreamStatus, IDLE_MS } = require('../idle.cjs');

test('private idle lease waits for interaction and requests; passive polls never postpone it', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-idle-'));
  let time = 1000000;
  const idle = createIdle({ directory, now: () => time });
  t.after(async () => { await idle.close(); await fs.rm(directory,{recursive:true,force:true}); });
  await idle.tick();
  const leaseFile = path.join(directory,'operations/maintenance.json');
  const lease = () => fs.writeFile(leaseFile, JSON.stringify({version:1,id:'10000000-0000-4000-8000-000000000000',expiresAt:time+120000}));
  await lease(); await idle.tick();
  assert.equal(idle.state().maintenanceRequestId,null,'recent interaction prevents update');
  time += IDLE_MS;
  const finish = idle.begin('/api/pdf');
  await lease(); await idle.tick();
  assert.equal(idle.state().maintenanceRequestId,null,'a PDF range/download is busy');
  finish(); finish();
  assert.equal(idle.state().busyRequests,0,'completion is idempotent');
  time += IDLE_MS; await lease();
  for (const route of ['/api/presence','/api/events','/api/me','/api/upstream-status','/api/usage']) idle.begin(route)();
  await idle.tick();
  assert.equal(idle.state().maintenanceRequestId,'10000000-0000-4000-8000-000000000000');
  assert.throws(() => idle.begin('/api/drafts'),{code:'UPSTREAM_UPDATING'});
  assert.throws(() => idle.begin('/api/pdf'),{code:'UPSTREAM_UPDATING'});
  idle.begin('/api/upstream-status')();
  time += 120001;
  const afterExpiry = idle.begin('/api/drafts'); afterExpiry();
  await idle.tick(); assert.equal(idle.state().maintenanceRequestId,null,'expired lease releases the app');
  idle.activity(); await lease(); await idle.tick();
  assert.equal(idle.state().maintenanceRequestId,null,'a real active presence resets idle time');
  time += IDLE_MS; await lease(); await idle.tick();
  assert.ok(idle.state().maintenanceRequestId);
  await fs.unlink(leaseFile); await idle.tick();
  assert.equal(idle.state().maintenanceRequestId,null,'host removing request releases the app');
  const disk = JSON.parse(await fs.readFile(path.join(directory,'operations/idle.json'),'utf8'));
  assert.equal(disk.heartbeatAt,time); assert.equal(disk.busyRequests,0);
});

test('upstream status exposes repository state without host paths or private fields', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-upstream-status-'));
  t.after(() => fs.rm(directory,{recursive:true,force:true}));
  assert.equal((await upstreamStatus(directory)).reason,'first-check');
  await fs.mkdir(path.join(directory,'operations'));
  await fs.writeFile(path.join(directory,'operations/upstream.json'),JSON.stringify({state:'updated',updatedAt:'2026-09-27T00:00:00Z',backup:'/private/path',secret:'private',repositories:[{name:'nhe-enga',head:'a'.repeat(40),upstream:'b'.repeat(40),state:'current',path:'/private/repo'},{name:'other',head:'secret'}]}));
  const value = await upstreamStatus(directory);
  assert.equal(value.state,'updated'); assert.equal(value.repositories.length,1);
  assert.equal(value.repositories[0].head,'a'.repeat(40));
  assert.equal(JSON.stringify(value).includes('private'),false);
});

test('a running AI job prevents maintenance even after browser requests finish', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-idle-ai-'));
  let time=1000000, running=true;
  const idle=createIdle({directory,now:()=>time,idleMs:100,hasWork:()=>running});
  t.after(async()=>{await idle.close();await fs.rm(directory,{recursive:true,force:true});});
  await idle.tick();time+=1000;
  const id=require('node:crypto').randomUUID();
  await fs.writeFile(path.join(directory,'operations/maintenance.json'),JSON.stringify({version:1,id,expiresAt:time+60000}));
  await idle.tick();assert.equal(idle.state().maintenanceRequestId,null);assert.equal(idle.state().busyRequests,1);
  running=false;await idle.tick();assert.equal(idle.state().maintenanceRequestId,id);
});
