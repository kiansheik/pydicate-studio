'use strict';
const {Store}=require('./store.cjs');
const {config}=require('./config.cjs');
(async()=>{const settings=config(),store=await Store.open(settings.stateDirectory);try{
 console.log(JSON.stringify({migrations:(await store.db.query('SELECT version,checksum FROM schema_migrations ORDER BY version')).rows}));
}finally{await store.close();}})().catch(()=>{console.error('Database migration failed; no automatic reset was attempted.');process.exitCode=1;});
