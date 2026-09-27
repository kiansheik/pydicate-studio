'use strict';
const {Store}=require('./store.cjs');
const {config}=require('./config.cjs');
(async()=>{const settings=config(),store=await Store.open(settings.stateDirectory);try{
 console.log(JSON.stringify({migrations:(await store.db.query('SELECT version,checksum FROM schema_migrations ORDER BY version')).rows}));
}finally{await store.close();}})().catch(error=>{
 const code=typeof error.code==='string' && /^[A-Z0-9_]+$/.test(error.code)?` (${error.code})`:'';
 console.error(`Database migration failed${code}; no automatic reset was attempted. Check database connectivity and server logs.`);
 process.exitCode=1;
});
