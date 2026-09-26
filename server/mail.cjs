'use strict';
const path = require('node:path');
const { spawn } = require('node:child_process');
function mailer(python) {
  let active=0;const queue=[];
  function pump(){while(active<2&&queue.length){const {message,resolve,reject}=queue.shift();active++;
    const child=spawn(python,['-I',path.join(__dirname,'smtp.py')],{stdio:['pipe','ignore','ignore'],shell:false});
    let settled=false;
    const finish=error=>{if(settled)return;settled=true;clearTimeout(timer);active--;error?reject(error):resolve();pump();};
    const timer=setTimeout(()=>{child.kill('SIGKILL');finish(new Error('SMTP timeout'));},25_000);
    child.once('error',()=>finish(new Error('SMTP unavailable')));
    child.once('close',code=>finish(code===0?null:new Error('SMTP delivery failed')));
    child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify(message));
  }}
  return message=>new Promise((resolve,reject)=>{if(queue.length>=32)return reject(new Error('SMTP queue full'));queue.push({message,resolve,reject});pump();});
}
module.exports={mailer};
