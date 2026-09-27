'use strict';
const fs=require('node:fs/promises');
const {Store}=require('./store.cjs');
const {Submissions}=require('./submissions.cjs');
(async()=>{
  const ids=(process.argv[2]||'').split(',').filter(Boolean),filename=process.argv[3];
  if(!ids.length||!filename)throw new Error('Usage: node server/submission-export.cjs ID,ID /new/package.json');
  const store=await Store.open(process.env.COLLAB_STATE_DIR||'/tmp/submission-export');
  try{const value=await new Submissions(store).export(ids);await fs.writeFile(filename,JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});console.log('Exported '+ids.length+' frozen submissions. This is private research data.');}
  finally{await store.close();}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
