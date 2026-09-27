'use strict';
const {config}=require('./config.cjs');
const {Store}=require('./store.cjs');
const {exportResearch}=require('./research.cjs');
(async()=>{
  const settings=config(),directory=process.argv[2];if(!directory)throw new Error('Pass a new export directory.');
  await require('node:fs/promises').mkdir(require('node:path').dirname(directory),{recursive:true,mode:0o700});
  const store=await Store.open(settings.stateDirectory);store.context={appRelease:settings.release};
  try{const manifest=await exportResearch(store,directory);console.log(JSON.stringify(manifest));}finally{await store.close();}
})().catch(()=>{console.error('Research export failed; check configuration and destination permissions.');process.exitCode=1;});
