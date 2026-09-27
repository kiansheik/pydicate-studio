'use strict';
const fs=require('node:fs');const {createHash,randomUUID}=require('node:crypto');
const {Store}=require('./store.cjs');
async function importSqlite(store,filename){
 const {DatabaseSync}=require('node:sqlite');
 const sourceHash=createHash('sha256').update(fs.readFileSync(filename)).digest('hex');
 const sqlite=new DatabaseSync(filename,{readOnly:true});
 const fields={
  users:'id,email,name,role,password_hash,disabled,created_at',projects:'id,revision',drafts:'project_id,passage_id,version,data',selections:'user_id,passage_id',
  comments:'id,passage_id,parent_id,author_id,body,created_at,resolved_by,resolved_at',
  revisions:'id,project_id,passage_id,user_id,at,before_json,after_json',audit:'id,user_id,passage_id,event,at,outcome,duration_ms,origin',
 };
 try{
  if(sqlite.prepare('PRAGMA user_version').get().user_version!==1)throw new Error('Only legacy SQLite schema 1 is supported');
  sqlite.exec('BEGIN');
  const counts={};
  await store.transaction(async()=>{
   for(const name of [...Object.keys(fields),'provider_settings']){
    if((await store.db.query(`SELECT count(*) AS n FROM ${name}`)).rows[0].n)throw new Error('Destination is not empty; refusing to mix research datasets');
   }
   for(const [table,columns] of Object.entries(fields)){
    const names=columns.split(','),rows=sqlite.prepare(`SELECT ${columns} FROM ${table}${names.includes('id')?' ORDER BY id':''}`).iterate();let count=0;
    for(const row of rows){await store.db.query(`INSERT INTO ${table}(${columns}) VALUES(${names.map((_,i)=>'$'+(i+1)).join(',')})`,names.map(name=>row[name]));count++;}
    counts[table]=count;
   }
   for(const table of ['comments','revisions','audit'])await store.db.query(`SELECT setval(pg_get_serial_sequence('${table}','id'),coalesce(max(id),1),max(id) IS NOT NULL) FROM ${table}`);
   const receipt={format:'pydicate-sqlite-migration',version:1,sourceSha256:sourceHash,counts,
    expiredCredentials:{sessions:sqlite.prepare('SELECT count(*) n FROM sessions').get().n,passwordTokens:sqlite.prepare('SELECT count(*) n FROM password_tokens').get().n},
    note:'All research rows retained. Old sessions/reset links/leases are intentionally not activated in PostgreSQL. Original SQLite is preserved.'};
   await store.db.query('INSERT INTO migration_receipts VALUES($1,$2,$3)',[randomUUID(),store.now(),receipt]);
  });
  sqlite.exec('COMMIT');return {sourceSha256:sourceHash,counts};
 }finally{sqlite.close();}
}
if(require.main===module)(async()=>{
 if(process.argv[3]!=='--confirm-empty')throw new Error('Stop the legacy server and pass FILE --confirm-empty. Do not import an active database.');
 const store=await Store.open(require('./config.cjs').config().stateDirectory);
 try{console.log(JSON.stringify(await importSqlite(store,process.argv[2])));}finally{await store.close();}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={importSqlite};
