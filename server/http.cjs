'use strict';
const http=require('node:http');
const fs=require('node:fs/promises');
const path=require('node:path');
const {isIP}=require('node:net');
const {randomUUID}=require('node:crypto');
const {fault,identifier,passageKey}=require('./store.cjs');
const {RateLimiter}=require('./auth.cjs');
const UI_EVENTS=new Set(`navigation.passage navigation.mode navigation.projection navigation.search editor.batch
editor.selection editor.operation editor.undo editor.redo draft.save source.preview source.apply source.conflict
review.status lexicon.search lexicon.select dictionary.search pdf.action ai.action ui.theme ui.resize ui.error usage.export`.split(/\s+/));
const POLICY="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; object-src blob:; frame-src blob:; worker-src 'self' blob:; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2','.ico':'image/x-icon'};
async function body(req,limit=1_000_000,binary=false) {
  const type=String(req.headers['content-type']||'').split(';')[0];
  if (type!==(binary?'application/pdf':'application/json')) throw fault(415,'CONTENT_TYPE','Tipo de conteúdo inválido.');
  if (Number(req.headers['content-length']||0)>limit) throw fault(413,'BODY_LIMIT','Pedido muito grande.');
  const chunks=[];let bytes=0;
  for await(const chunk of req){bytes+=chunk.length;if(bytes>limit)throw fault(413,'BODY_LIMIT','Pedido muito grande.');chunks.push(chunk);}
  const value=Buffer.concat(chunks);
  if(binary)return value;
  try {const parsed=JSON.parse(value.toString('utf8'));if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw new Error();return parsed;}
  catch{throw fault(400,'INVALID_JSON','JSON inválido.');}
}
function client(req){const value=req.headers['x-studio-client'];if(typeof value!=='string'||!/^[a-zA-Z0-9_-]{8,80}$/.test(value))throw fault(400,'CLIENT_REQUIRED','Identificação da aba ausente.');return value;}
function integer(value,min=0,max=Number.MAX_SAFE_INTEGER){const n=Number(value);if(!Number.isSafeInteger(n)||n<min||n>max)throw fault(400,'INVALID_NUMBER','Número inválido.');return n;}
function createHttp({config,store,auth,runtime}) {
  const streams=new Set(),people=new Map(),limiter=new RateLimiter(store.now);
  let uploading=false;
  function json(res,status,value){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(value));}
  function emit(event){const line='data: '+JSON.stringify(event)+'\n\n';for(const item of streams){if(item.res.destroyed||item.res.writableEnded){streams.delete(item);continue;}item.res.write(line);if(item.res.writableLength>256_000)item.res.destroy();}}
  function presence(){return {type:'presence',people:[...people.values()].filter(p=>p.until>store.now()).map(({until,...p})=>p),claims:store.claimList()};}
  function context(req,session){return {user:session.user,clientId:client(req)};}
  function admin(session){if(session.user.role!=='admin')throw fault(403,'ADMIN_REQUIRED','Acesso reservado à administração.');}
  function origin(req){if(req.headers.origin!==config.origin)throw fault(403,'ORIGIN_DENIED','Origem não autorizada.');}
  function ip(req){
    const direct=req.socket.remoteAddress||'unknown';
    // Enable only on a listener reachable exclusively through the trusted Caddy.
    if(!config.trustProxy)return direct;
    const forwarded=String(req.headers['x-forwarded-for']||'').split(',').at(-1).trim();
    return isIP(forwarded)?forwarded:direct;
  }
  async function staticFile(res,root,name,inject=false){
    const base=await fs.realpath(root),target=await fs.realpath(path.resolve(base,name));
    const relative=path.relative(base,target);
    if(relative.startsWith('..')||path.isAbsolute(relative))throw fault(404,'NOT_FOUND','Não encontrado.');
    const stat=await fs.stat(target);if(!stat.isFile()||stat.size>24*1024*1024)throw fault(404,'NOT_FOUND','Não encontrado.');
    let bytes=await fs.readFile(target);
    if(inject){const html=bytes.toString('utf8');if(!html.includes('<head>'))throw new Error('Built index has no head.');bytes=Buffer.from(html.replace('<head>','<head><link rel="stylesheet" href="/collab/collab.css"><script src="/collab/bridge.js"></script><script src="/collab/panel.js" defer></script>'));}
    res.writeHead(200,{'Content-Type':MIME[path.extname(target)]||'application/octet-stream'});res.end(bytes);
  }
  const server=http.createServer(async(req,res)=>{
    res.on('error',()=>{});
    res.setHeader('Content-Security-Policy',POLICY);res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Cache-Control','no-store');
    res.setHeader('X-Frame-Options','DENY');res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');
    if(config.secure)res.setHeader('Strict-Transport-Security','max-age=31536000');
    try{
      const url=new URL(req.url,config.origin),route=url.pathname;
      if(route==='/healthz'&&req.method==='GET')return json(res,200,{ok:true});
      if(req.headers.host!==new URL(config.origin).host)throw fault(400,'HOST_DENIED','Host inválido.');
      if(!['GET','POST'].includes(req.method))throw fault(405,'METHOD_DENIED','Método inválido.');
      if(req.headers['sec-fetch-site']==='cross-site'&&route.startsWith('/api/'))throw fault(403,'ORIGIN_DENIED','Origem não autorizada.');
      const publicAssets=new Set(['/collab/auth.js','/collab/collab.css']);
      if(req.method==='GET'&&(route==='/login'||route==='/account'))return await staticFile(res,path.join(__dirname,'public'),'account.html');
      if(req.method==='GET'&&publicAssets.has(route))return await staticFile(res,path.join(__dirname,'public'),route.slice(8));
      if(req.method==='POST')origin(req);
      const publicPost=['/api/login','/api/forgot','/api/reset'];
      if(req.method==='POST'&&publicPost.includes(route)){
        const input=await body(req,4096);
        limiter.hit('auth:'+ip(req),60,10*60_000);
        if(route==='/api/login'){const result=await auth.login(input,ip(req));res.setHeader('Set-Cookie',result.cookie);return json(res,200,{user:result.user,csrf:result.csrf});}
        if(route==='/api/forgot')return json(res,200,await auth.forgot(input,ip(req)));
        return json(res,200,await auth.reset(input));
      }
      const session=auth.session(req.headers.cookie,!['/api/events','/api/presence','/api/me'].includes(route));
      if(!session){if(req.method==='GET'&&!route.startsWith('/api/')){res.writeHead(303,{Location:'/login'});return res.end();}throw fault(401,'SESSION_EXPIRED','Sessão expirada. Exporte eventuais edições locais antes de entrar novamente.');}
      if(req.method==='POST'&&req.headers['x-csrf-token']!==session.csrf)throw fault(403,'CSRF_DENIED','Recarregue a sessão antes de continuar.');
      limiter.hit('requests:'+session.user.id,1500,60_000);
      if(route==='/api/me'&&req.method==='GET')return json(res,200,{user:session.user,csrf:session.csrf,projectId:runtime.project.id,telemetryDays:config.telemetryDays});
      if(route==='/api/events'&&req.method==='GET'){
        if(streams.size>=100||[...streams].filter(s=>s.userId===session.user.id).length>=8)throw fault(429,'STREAM_LIMIT','Feche outras abas antes de continuar.');
        res.writeHead(200,{'Content-Type':'text/event-stream','Connection':'keep-alive','X-Accel-Buffering':'no'});res.flushHeaders();
        const item={res,cookie:req.headers.cookie,userId:session.user.id};streams.add(item);
        res.write('data: '+JSON.stringify(presence())+'\n\n');
        req.on('close',()=>streams.delete(item));return;
      }
      if(route==='/api/comments'&&req.method==='GET'){
        const id=runtime.passage(url.searchParams.get('passageId'),true);
        return json(res,200,store.comments(id,integer(url.searchParams.get('after')||0)));
      }
      if(route==='/api/history'&&req.method==='GET'){
        const id=runtime.passage(url.searchParams.get('passageId'),true),after=integer(url.searchParams.get('after')||0);
        const rows=store.db.prepare(`SELECT r.id,r.user_id AS userId,u.name,r.at,r.before_json AS beforeJson,r.after_json AS afterJson
          FROM revisions r LEFT JOIN users u ON r.user_id=u.id WHERE r.project_id=? AND r.passage_id IN (?,?) AND r.id>? ORDER BY r.id LIMIT 21`).all(runtime.project.id,passageKey(id),passageKey(id).replace(/^passage:/,'pending:'),after);
        return json(res,200,{revisions:rows.slice(0,20),next:rows.length>20?rows[19].id:null});
      }
      if(route==='/api/admin/users'&&req.method==='GET'){admin(session);return json(res,200,{users:store.db.prepare('SELECT * FROM users ORDER BY created_at LIMIT 1000').all().map(u=>store.publicUser(u))});}
      if(route==='/api/admin/report'&&req.method==='GET'){admin(session);return json(res,200,store.report(integer(url.searchParams.get('days')||7,1,config.telemetryDays)));}
      if(route==='/api/pdf'&&req.method==='POST'){
        if(session.user.role==='contributor')throw fault(403,'REVIEWER_REQUIRED','Um revisor deve vincular o PDF.');
        if(uploading)throw fault(429,'UPLOAD_BUSY','Outro PDF está sendo recebido.');
        uploading=true;let filename;
        try{
          const metadata=JSON.parse(String(req.headers['x-studio-evidence']||''));
          runtime.passage(metadata.passageId,true);
          const data=await body(req,100*1024*1024,true);
          if(!data.subarray(0,1024).includes(Buffer.from('%PDF-')))throw fault(400,'PDF_INVALID','PDF inválido.');
          const directory=path.join(config.stateDirectory,'imports');await fs.mkdir(directory,{recursive:true,mode:0o700});
          let used=0;for(const name of await fs.readdir(directory))used+=(await fs.stat(path.join(directory,name))).size;
          if(used+data.length>250*1024*1024)throw fault(413,'PDF_QUOTA','O limite de PDFs foi atingido. A administração deve arquivar os testemunhos antigos.');
          filename=path.join(directory,randomUUID()+'.pdf');await fs.writeFile(filename,data,{mode:0o600,flag:'wx'});
          const result=await runtime.upload(filename,{sourceId:identifier(metadata.sourceId),passageId:metadata.passageId,replace:metadata.replace===true},context(req,session));
          filename=null;return json(res,200,result);
        }finally{uploading=false;if(filename)await fs.rm(filename,{force:true});}
      }
      if(req.method==='POST'&&route.startsWith('/api/')){
        const input=await body(req,route==='/api/drafts'?4*1024*1024:1_000_000);
        if(route==='/api/logout'){auth.logout(session);res.setHeader('Set-Cookie',auth.cookie('',true));return json(res,200,{ok:true});}
        if(route==='/api/password'){limiter.hit('password:'+session.user.id,5,10*60_000);await auth.changePassword(session,input);res.setHeader('Set-Cookie',auth.cookie('',true));return json(res,200,{ok:true});}
        if(route==='/api/admin/invite'){admin(session);return json(res,200,await auth.invite(session.user,input));}
        if(route==='/api/admin/user'){admin(session);return json(res,200,auth.updateUser(session.user,input));}
        const ctx=context(req,session);
        if(route==='/api/presence'){
          const id=input.passageId?runtime.passage(input.passageId,true):null;
          const active=input.active===true;
          if(active)auth.session(req.headers.cookie,true);
          if(people.size>=300&&!people.has(session.hash+':'+ctx.clientId))throw fault(429,'PRESENCE_LIMIT','Muitas abas abertas.');
          people.set(session.hash+':'+ctx.clientId,{userId:session.user.id,name:session.user.name,clientId:ctx.clientId,passageId:id,active,until:store.now()+45_000});
          if(id&&active){const own=store.claimList().find(c=>c.passageId===passageKey(id)&&c.userId===session.user.id&&c.clientId===ctx.clientId);if(own)store.assertClaim(id,session.user,ctx.clientId,true);}
          emit(presence());return json(res,200,{ok:true});
        }
        if(route==='/api/claim'){
          const id=runtime.passage(input.passageId,true);
          if(input.release===true)store.release(id,session.user,ctx.clientId);else store.assertClaim(id,session.user,ctx.clientId,true);
          emit(presence());return json(res,200,{claims:store.claimList()});
        }
        if(route==='/api/drafts/load'){
          if(input.projectId!==runtime.project.id)throw fault(403,'PROJECT_MISMATCH','Projeto inválido.');
          return json(res,200,store.snapshot(runtime.project.id));
        }
        if(route==='/api/drafts'){
          if(input.projectId!==runtime.project.id)throw fault(403,'PROJECT_MISMATCH','Projeto inválido.');
          runtime.validateChanges(input.changes);
          const saved=store.patch(runtime.project.id,input.changes,session.user,ctx.clientId);
          if(saved.changed.length)emit({type:'drafts-change',projectId:runtime.project.id,passageIds:saved.changed,userId:session.user.id,clientId:ctx.clientId});
          return json(res,200,saved);
        }
        if(route==='/api/comment'){limiter.hit('comment:'+session.user.id,30,60_000);runtime.passage(input.passageId,true);const result=store.addComment(session.user,input);emit({type:'comments-change',passageId:passageKey(input.passageId)});return json(res,200,result);}
        if(route==='/api/comment/resolve'){if(typeof input.resolved!=='boolean')throw fault(400,'INVALID_INPUT','Estado inválido.');const result=store.resolveComment(session.user,integer(input.id,1),input.resolved);emit({type:'comments-change',...result});return json(res,200,result);}
        if(route==='/api/usage'){
          limiter.hit('usage:'+session.user.id,180,60_000);
          if(!UI_EVENTS.has(input.event))throw fault(400,'EVENT_DENIED','Evento inválido.');
          const id=input.passageId&&runtime.hasPassage(input.passageId)?input.passageId:null;
          const duration=Number.isFinite(input.durationMs)?Math.round(Math.max(0,Math.min(input.durationMs,3_600_000))):null;
          // No client-provided names, details, text, error messages, or authorship.
          store.audit(session.user.id,input.event,id,'succeeded',duration,'browser');return json(res,200,{ok:true});
        }
        if(route==='/api/refresh')return json(res,200,await runtime.refresh(ctx));
        if(route==='/api/invoke'){
          const params=input.params??{};if(!params||typeof params!=='object'||Array.isArray(params))throw fault(400,'INVALID_INPUT','Parâmetros inválidos.');
          if(input.method==='session_restore'){
            const saved=store.db.prepare('SELECT passage_id FROM selections WHERE user_id=?').get(session.user.id);
            return json(res,200,{project:runtime.project,selectedPassageId:saved?.passage_id});
          }
          if(input.method==='session_select'){
            runtime.passage(params.passageId,true);
            store.db.prepare('INSERT INTO selections VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET passage_id=excluded.passage_id').run(session.user.id,params.passageId);
            return json(res,200,null);
          }
          const result=await runtime.invoke(input.method,params,ctx);
          if(result instanceof ArrayBuffer){res.writeHead(200,{'Content-Type':'application/pdf'});return res.end(Buffer.from(result));}
          return json(res,200,result);
        }
      }
      if(req.method==='GET'){
        if(['/collab/bridge.js','/collab/panel.js'].includes(route))return await staticFile(res,path.join(__dirname,'public'),route.slice(8));
        if(route==='/'||route==='/index.html')return await staticFile(res,config.distDirectory,'index.html',true);
        if(/^\/assets\/[a-zA-Z0-9_.-]+$/.test(route)||['/favicon.ico','/mark.svg'].includes(route))return await staticFile(res,config.distDirectory,route.slice(1));
      }
      throw fault(404,'NOT_FOUND','Não encontrado.');
    }catch(error){
      if(res.headersSent){res.destroy();return;}
      const status=Number.isInteger(error.status)?error.status:(error.code==='ENOENT'?404:500);
      if(status===429)res.setHeader('Retry-After','60');
      json(res,status,{error:{code:status===500?'SERVER_ERROR':error.code||'INVALID_INPUT',message:status===500?'Não foi possível completar o pedido. A administração deve verificar o servidor.':String(error.message).slice(0,4000)}});
    }
  });
  server.requestTimeout=60_000;server.headersTimeout=15_000;server.keepAliveTimeout=5000;
  const timer=setInterval(()=>{
    for(const item of streams){if(!auth.session(item.cookie,false)){item.res.write('data: {"type":"session-expired"}\n\n');item.res.end();streams.delete(item);}else item.res.write(': heartbeat\n\n');}
    for(const [key,item] of people)if(item.until<=store.now()||!store.user(item.userId)||store.user(item.userId).disabled)people.delete(key);
    store.cleanup(config.telemetryDays);emit(presence());
  },15_000);timer.unref();
  server.on('close',()=>clearInterval(timer));
  return {server,emit,close:async()=>{clearInterval(timer);for(const item of streams)item.res.end();const closing=new Promise(resolve=>server.close(resolve));server.closeAllConnections();await closing;}};
}
module.exports={createHttp,body,POLICY,UI_EVENTS};
