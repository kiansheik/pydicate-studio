'use strict';
const {Pool}=require('pg');
const {randomUUID}=require('node:crypto');
const {Store}=require('../store.cjs');
async function createTestStore(directory, options={}) {
  const url=process.env.COLLAB_TEST_DATABASE_URL;
  if(!url) throw new Error('Set COLLAB_TEST_DATABASE_URL to a disposable PostgreSQL database. Tests use fresh random schemas, never public.');
  const schema='studio_test_'+randomUUID().replaceAll('-','');
  const pool=new Pool({connectionString:url});
  await pool.query(`CREATE SCHEMA ${schema}`);
  let store;
  // Legacy reservation contracts opt in; production defaults to unlocked editing.
  try { store=await Store.open(directory,{passageClaims:true,...options,databaseUrl:url,schema}); }
  catch(error){await pool.query(`DROP SCHEMA ${schema} CASCADE`);await pool.end();throw error;}
  const close=store.close.bind(store);let closed=false;
  store.close=async()=>{if(closed)return;closed=true;try{await close();}finally{await pool.query(`DROP SCHEMA ${schema} CASCADE`);await pool.end();}};
  return store;
}
module.exports={createTestStore};
