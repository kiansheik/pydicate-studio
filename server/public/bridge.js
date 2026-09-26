/* Optional browser transport. Loaded before the unchanged React entry point. */
(() => {
  'use strict';
  const clientId=crypto.randomUUID(),listeners=new Set(),snapshots=new Map();
  let identity,identityPromise,selected=null,projectId=null,failed=false,inflight=0,lastInput=Date.now(),latestEnvelope=null;
  const notify=event=>{for(const listener of listeners)listener(event);window.dispatchEvent(new CustomEvent('collab-status',{detail:event}));};
  async function me(){
    if(identity)return identity;
    identityPromise??=fetch('/api/me',{credentials:'same-origin'}).then(async response=>{
      if(!response.ok)throw new Error('Entre novamente para usar o servidor.');
      identity=await response.json();return identity;
    }).catch(error=>{identityPromise=null;throw error;});
    return identityPromise;
  }
  async function request(url,input,options={}){
    const who=await me();
    const response=await fetch(url,{method:input===undefined?'GET':'POST',credentials:'same-origin',
      headers:{...(input===undefined?{}:{'Content-Type':'application/json'}),'X-CSRF-Token':who.csrf,'X-Studio-Client':clientId,...options.headers},
      ...(input===undefined?{}:{body:options.binary?input:JSON.stringify(input)})});
    if(!response.ok){
      let error;try{error=(await response.json()).error;}catch{error={message:'Resposta inválida do servidor.'};}
      if(response.status===401)notify({type:'session-expired'});
      const failure=new Error(`[STUDIO:${error.code||'HTTP_ERROR'}] ${error.message}`);failure.code=error.code;throw failure;
    }
    return response.headers.get('content-type')?.startsWith('application/pdf')?response.arrayBuffer():response.json();
  }
  function stable(value){
    if(Array.isArray(value))return '['+value.map(stable).join(',')+']';
    if(value&&typeof value==='object')return '{'+Object.keys(value).sort().filter(k=>value[k]!==undefined).map(k=>JSON.stringify(k)+':'+stable(value[k])).join(',')+'}';
    return JSON.stringify(value);
  }
  function backup(envelope){
    latestEnvelope=structuredClone(envelope);
    if(identity)try{sessionStorage.setItem('collab-recovery:'+identity.user.id,JSON.stringify(envelope));}catch{/* Download remains available when storage is full. */}
  }
  async function saveDrafts(envelope){
    if(envelope.projectId.startsWith('example:'))return {storageRevision:0};
    backup(envelope);inflight++;notify({type:'saving',value:true});
    try{
      const base=snapshots.get(envelope.projectId);
      if(!base)throw new Error('Reabra o projeto antes de salvar.');
      const ids=new Set([...Object.keys(base.envelope?.drafts||{}),...Object.keys(envelope.drafts)]);
      const changes=[];
      for(const id of ids){const before=base.envelope?.drafts[id]??null,after=envelope.drafts[id]??null;
        if(stable(before)!==stable(after))changes.push({id,version:base.versions[id]??0,draft:after});}
      if(!changes.length)return {storageRevision:base.envelope?.storageRevision??0};
      const saved=await request('/api/drafts',{projectId:envelope.projectId,changes});
      // Crucial: do not adopt remote versions for passages whose content we never loaded.
      // Otherwise a later local edit could overwrite a remote edit using its newer version.
      for(const change of changes){base.versions[change.id]=saved.versions[change.id]??base.versions[change.id]??0;
        if(change.draft===null)delete base.envelope.drafts[change.id];else base.envelope.drafts[change.id]=structuredClone(change.draft);}
      base.envelope.storageRevision=saved.storageRevision;
      failed=false;notify({type:'saved'});return {storageRevision:saved.storageRevision};
    }catch(error){failed=true;notify({type:'save-failed',message:error.message});throw error;}
    finally{inflight--;notify({type:'saving',value:inflight>0});}
  }
  async function upload(params){
    const input=document.createElement('input');input.type='file';input.accept='application/pdf';
    const file=await new Promise(resolve=>{input.onchange=()=>resolve(input.files?.[0]??null);input.oncancel=()=>resolve(null);input.click();});
    if(!file)return null;
    if(file.size>100*1024*1024)throw new Error('Escolha um PDF de até 100 MiB.');
    return request('/api/pdf',file,{binary:true,headers:{'Content-Type':'application/pdf','X-Studio-Evidence':JSON.stringify({sourceId:params.sourceId,passageId:params.passageId,replace:params.replace===true})}});
  }
  window.studio=Object.freeze({
    invoke:async(method,params={})=>{
      if(method==='evidence_attach'||method==='evidence_relocate'){
        if(method==='evidence_relocate')throw new Error('Peça à administração para recuperar o PDF do backup no servidor.');
        return upload(params);
      }
      const value=await request('/api/invoke',{method,params});
      if(method==='session_restore'){projectId=value.project?.id??null;selected=value.selectedPassageId??value.project?.passages[0]?.id??null;notify({type:'selection',passageId:selected});}
      if(method==='session_select'){selected=params.passageId;projectId=params.projectId;notify({type:'selection',passageId:selected});void heartbeat();}
      return value;
    },
    loadDrafts:async(id)=>{if(id.startsWith('example:'))return null;const value=await request('/api/drafts/load',{projectId:id});snapshots.set(id,structuredClone(value));return value.envelope;},
    saveDrafts,
    refreshProject:()=>request('/api/refresh',{}),
    openProject:()=>request('/api/refresh',{}),
    setupProject:()=>Promise.reject(new Error('O projeto é configurado pela administração do servidor.')),
    render:params=>request('/api/invoke',{method:'render',params}),
    onEvent:listener=>{listeners.add(listener);return()=>listeners.delete(listener);},
    copyText:text=>navigator.clipboard.writeText(text),
    recordUsage:event=>request('/api/usage',event).catch(()=>{}),
  });
  function download(value,name){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),10000);}
  function exportLocal(){
    let value=latestEnvelope;
    if(!value&&identity)try{value=JSON.parse(sessionStorage.getItem('collab-recovery:'+identity.user.id)||'null');}catch{}
    if(value)download(value,'studio-local-recovery.json');else throw new Error('Nenhuma cópia local disponível nesta aba.');
  }
  async function heartbeat(){
    if(!identity||!selected)return;
    try{await request('/api/presence',{passageId:selected,active:document.visibilityState==='visible'&&Date.now()-lastInput<90_000});}catch{}
  }
  for(const type of ['pointerdown','keydown','scroll'])window.addEventListener(type,()=>{lastInput=Date.now();},{passive:true});
  window.addEventListener('beforeunload',event=>{if(failed||inflight){event.preventDefault();event.returnValue='';}});
  window.collab=Object.freeze({me,request,clientId,download,exportLocal,
    state:()=>({selected,projectId,failed,inflight}),
    reload:()=>{if((failed||inflight)&&!confirm('Há edições não confirmadas. Exporte a cópia local antes de recarregar. Continuar?'))return;location.reload();},
    logout:async()=>{if(failed||inflight)throw new Error('Exporte as edições locais antes de sair.');await request('/api/logout',{});if(identity)sessionStorage.removeItem('collab-recovery:'+identity.user.id);location.assign('/login');},
  });
  me().then(()=>{
    const events=new EventSource('/api/events');
    let connected=false;
    events.onopen=()=>{if(connected)notify({type:'resync-required'});connected=true;notify({type:'connected'});};
    events.onmessage=message=>{try{const event=JSON.parse(message.data);if(event.type==='session-expired')events.close();notify(event);}catch{}};
    events.onerror=()=>notify({type:'disconnected'});
    setInterval(heartbeat,15_000);void heartbeat();
  }).catch(error=>notify({type:'save-failed',message:error.message}));
})();
