'use strict';
const { createHash, randomUUID } = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { fault } = require('./store.cjs');
const TABLES = Object.freeze({
  submission_events: 'id,submission_id,actor_id,event,at,details',
  audit: 'id,user_id,passage_id,event,at,outcome,duration_ms,origin,metadata',
  revisions: 'id,project_id,passage_id,user_id,at,before_json,after_json',
  comments: 'id,passage_id,parent_id,author_id,body,created_at,resolved_by,resolved_at',
});
function categoricalDetails(input) {
  const result = {};
  for (const key of ['action','field','scope','mode','view','reason','errorCode']) {
    const value = input.details?.[key];
    // Keep known categorical labels, never arbitrary error strings or user text.
    if (typeof value === 'string' && /^[A-Za-z][A-Za-z0-9_.:-]{0,63}$/.test(value)) result[key] = value;
  }
  for (const key of ['count','editCount','changedCharacters','nodeCount','attempt']) {
    const value = input.details?.[key];
    if (Number.isSafeInteger(value) && Math.abs(value) <= 1e9) result[key] = value;
  }
  return { ui: result };
}
async function researchPage(store, kind, after = 0, through = Number.MAX_SAFE_INTEGER) {
  if (!Object.hasOwn(TABLES, kind)) throw fault(400, 'EXPORT_KIND', 'Tipo de exportação inválido.');
  if (![after,through].every(value => Number.isSafeInteger(value) && value >= 0)) throw fault(400,'EXPORT_CURSOR','Cursor inválido.');
  if (through === Number.MAX_SAFE_INTEGER) through = (await store.db.query(`SELECT coalesce(max(id),0) AS last FROM ${kind}`)).rows[0].last;
  const records = (await store.db.query(`SELECT ${TABLES[kind]} FROM ${kind} WHERE id>$1 AND id<=$2 ORDER BY id LIMIT 500`, [after,through])).rows;
  return { format:'pydicate-research-page',version:1,kind,through,records,next:records.length===500?records.at(-1).id:null };
}
async function exportResearch(store, directory) {
  // Never overwrite a previous evidence export; research exports omit account emails,
  // password hashes, sessions, SMTP config and provider credentials altogether.
  await fs.mkdir(directory, { mode:0o700 });
  const id = randomUUID(),at = new Date(store.now()).toISOString();
  const manifest = { format:'pydicate-research-export',version:1,id,at,context:store.context,retention:'no-automatic-expiry',files:[] };
  try {
    await store.db.transaction(async () => {
      manifest.migrations = (await store.db.query('SELECT version,checksum FROM schema_migrations ORDER BY version')).rows;
      for (const kind of Object.keys(TABLES)) {
        const filename = kind+'.jsonl';
        const handle = await fs.open(path.join(directory,filename),'wx',0o600);
        const hash = createHash('sha256');let after=0,count=0,through=Number.MAX_SAFE_INTEGER;
        try {
          do {
            const page=await researchPage(store,kind,after,through);through=page.through;
            for(const row of page.records){const line=JSON.stringify(row)+'\n';hash.update(line);await handle.write(line);count++;}
            after=page.next;
          } while(after!==null);
          await handle.sync();
        } finally { await handle.close(); }
        manifest.files.push({name:filename,records:count,through,sha256:hash.digest('hex')});
      }
      const submitted=(await store.db.query('SELECT id,project_id,passage_id,author_id,draft_revision_id,snapshot,snapshot_sha256,submitted_at FROM submissions ORDER BY submitted_at,id')).rows;
      const lines=submitted.map(row=>JSON.stringify(row)+'\n').join('');
      await fs.writeFile(path.join(directory,'submissions.jsonl'),lines,{flag:'wx',mode:0o600});
      manifest.files.push({name:'submissions.jsonl',records:submitted.length,sha256:createHash('sha256').update(lines).digest('hex')});
    }, {readOnly:true});
    await fs.writeFile(path.join(directory,'manifest.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx',mode:0o600});
    await store.db.query('INSERT INTO research_exports(id,at,manifest) VALUES($1,$2,$3)',[id,store.now(),manifest]);
    return manifest;
  } catch(error) {
    await fs.writeFile(path.join(directory,'INCOMPLETE'), 'Export failed. Do not treat this directory as a complete research snapshot.\n', {mode:0o600});
    throw error;
  }
}
module.exports={categoricalDetails,researchPage,exportResearch};
