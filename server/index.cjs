'use strict';
const {config}=require('./config.cjs');
const {Store}=require('./store.cjs');
const {Auth}=require('./auth.cjs');
const {mailer}=require('./mail.cjs');
const {createStudio}=require('./studio.cjs');
const {createHttp}=require('./http.cjs');
async function main(){
  if(process.env.COLLAB_OWNER_LOCK!=='1')throw new Error('Start through npm run collab (single-owner lock).');
  process.umask(0o077);
  const settings=config();
  const validate=require('../electron/validation.cjs');
  const store=new Store(settings.stateDirectory,{validateEnvelope:validate.envelope});
  const auth=new Auth(store,{origin:settings.origin,secure:settings.secure,sendMail:mailer(settings.python)});
  let http,runtime;
  try{runtime=await createStudio(settings,store,event=>http?.emit(event));http=createHttp({config:settings,store,auth,runtime});
    await new Promise((resolve,reject)=>{http.server.once('error',reject);http.server.listen(settings.port,settings.host,resolve);});
    console.log('Pydicate collaboration server ready on '+settings.host+':'+settings.port);
  }catch(error){await runtime?.close();store.close();throw error;}
  let stopping=false;
  async function stop(){if(stopping)return;stopping=true;const deadline=setTimeout(()=>process.exit(1),70_000);deadline.unref();
    await http.close();await runtime.close();await Promise.allSettled([...auth.deliveries]);store.close();clearTimeout(deadline);}
  for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>void stop().catch(()=>process.exit(1)));
}
main().catch(()=>{console.error('Collaboration startup failed. Check the configured workspace, dependencies, database permissions and port. No credentials or request bodies are logged.');process.exitCode=1;});
