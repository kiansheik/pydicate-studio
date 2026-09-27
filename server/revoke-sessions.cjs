'use strict';
const {Store}=require('./store.cjs');const {config}=require('./config.cjs');
(async()=>{const store=await Store.open(config().stateDirectory);try{await store.transaction(async()=>{
 await store.db.query('DELETE FROM sessions');await store.db.query('DELETE FROM password_tokens');await store.db.query('DELETE FROM claims');
 await store.audit(null,'deployment.restore-revoke');
});}finally{await store.close();}})().catch(()=>{console.error('Session revocation failed. Leave the service stopped.');process.exitCode=1;});
