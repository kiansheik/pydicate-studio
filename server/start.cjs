'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {spawn}=require('node:child_process');
const {config}=require('./config.cjs');
if(process.platform!=='linux')throw new Error('Collaboration mode requires Linux. Desktop mode remains cross-platform.');
const settings=config();fs.mkdirSync(settings.stateDirectory,{recursive:true,mode:0o700});
// Kernel-held lock: survives multiple launch attempts and is released even after a crash.
const child=spawn('flock',['--nonblock','--conflict-exit-code','73',path.join(settings.stateDirectory,'owner.lock'),process.execPath,path.join(__dirname,'index.cjs')],
  {stdio:'inherit',env:{...process.env,COLLAB_OWNER_LOCK:'1'},shell:false});
child.on('error',()=>{console.error('Install util-linux (flock) before starting collaboration mode.');process.exitCode=1;});
child.on('exit',(code,signal)=>{if(code===73)console.error('Another collaboration server already owns this data directory.');process.exitCode=code??(signal?1:0);});
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>child.kill(signal));
