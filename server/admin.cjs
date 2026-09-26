'use strict';
const {spawnSync}=require('node:child_process');
const {config}=require('./config.cjs');
const {Store}=require('./store.cjs');
const {Auth}=require('./auth.cjs');
async function main(){
  if(process.argv[2]!=='bootstrap')throw new Error('Usage: node server/admin.cjs bootstrap --email you@example.org --name "Your name"');
  const option=name=>{const index=process.argv.indexOf(name);return index<0?undefined:process.argv[index+1];};
  const settings=config();process.umask(0o077);
  let password;
  if(process.stdin.isTTY){const result=spawnSync(settings.python,['-I','-c','import getpass,sys; sys.stdout.write(getpass.getpass("Initial administrator password (15+ characters): "))'],{stdio:['inherit','pipe','inherit'],encoding:'utf8',shell:false});if(result.status!==0)throw new Error('Could not read the password securely.');password=result.stdout;}
  else{const chunks=[];let size=0;for await(const chunk of process.stdin){size+=chunk.length;if(size>2048)throw new Error('Password input too long.');chunks.push(chunk);}password=Buffer.concat(chunks).toString('utf8').replace(/\r?\n$/,'');}
  const store=new Store(settings.stateDirectory);
  try{const id=await new Auth(store,settings).createAdmin(option('--email'),option('--name'),password);console.log('Administrator created: '+id);}finally{password='';store.close();}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
