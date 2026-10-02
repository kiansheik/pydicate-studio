/* Optional browser transport. Loaded before the unchanged React entry point. */
(() => {
  'use strict';
  const clientId=crypto.randomUUID(),listeners=new Set(),snapshots=new Map(),refreshReceipts=new Map();
  let identity,identityPromise,selected=null,projectId=null,failed=false,inflight=0,lastInput=Date.now(),latestEnvelope=null;
  let activityClockOffset=0,serverMonotonicOffset=null;
  const notify=event=>{for(const listener of listeners)listener(event);window.dispatchEvent(new CustomEvent('collab-status',{detail:event}));};
  async function me(){
    if(identity)return identity;
    identityPromise??=(async()=>{
      const startedAt=Date.now(),started=performance.now();
      const response=await fetch('/api/me',{credentials:'same-origin'});
      if(!response.ok)throw new Error('Entre novamente para usar o servidor.');
      const value=await response.json(),elapsed=performance.now()-started;
      if(Number.isFinite(value.serverTime)) {
        activityClockOffset=value.serverTime-(startedAt+elapsed/2);
        serverMonotonicOffset=value.serverTime-(started+elapsed/2);
      }
      identity=value;return identity;
    })().catch(error=>{identityPromise=null;throw error;});
    return identityPromise;
  }
  async function request(url,input,options={}){
    const who=await me();
    const response=await fetch(url,{method:input===undefined?'GET':'POST',credentials:'same-origin',
      ...(options.keepalive?{keepalive:true}:{}),
      headers:{...(input===undefined?{}:{'Content-Type':'application/json'}),'X-CSRF-Token':who.csrf,'X-Studio-Client':clientId,...options.headers},
      ...(input===undefined?{}:{body:options.binary?input:JSON.stringify(input)})});
    if(!response.ok){
      let error;try{error=(await response.json()).error;}catch{error={message:'Resposta inválida do servidor.'};}
      if(response.status===401)notify({type:'session-expired'});
      const failure=new Error(error.message);failure.code=error.code||'HTTP_ERROR';failure.status=response.status;failure.retryAfterExplicit=response.headers.has('retry-after');failure.retryAfterMs=Math.max(1000,Number(response.headers.get('retry-after'))*1000||(error.code==='ENGINE_BUSY'?2000:error.code==='UPSTREAM_UPDATING'?15000:60000));throw failure;
    }
    return response.headers.get('content-type')?.startsWith('application/pdf')?response.arrayBuffer():response.json();
  }
  async function recordUsage(event) {
    try {
      if(event.event!=='activity.active')return await request('/api/usage',event);
      await me();
      // Copy once: retries retain this exact receipt, never recalibrate its
      // timestamps twice or modify the caller's original local-clock event.
      const calibrated={...event,
        intervalStartMs:Math.round(event.intervalStartMs+activityClockOffset),
        intervalEndMs:Math.round(event.intervalEndMs+activityClockOffset)};
      try { return await request('/api/usage',calibrated,{keepalive:true}); }
      catch(error) {
        const transient=!error.status||error.status===429||error.status>=500;
        const delay=error.retryAfterExplicit?error.retryAfterMs:1000;
        const now=serverMonotonicOffset===null?Date.now():performance.now()+serverMonotonicOffset;
        if(!transient||delay>5000||now+delay-calibrated.intervalEndMs>=90000)return;
        await new Promise(resolve=>setTimeout(resolve,delay));
        return await request('/api/usage',calibrated,{keepalive:true});
      }
    } catch { /* A missed interval is never extrapolated into later activity. */ }
  }
  // Share identical reads and bound browser pressure on the serialized engine.
  // Writes remain distinct and are never retried automatically.
  const readMethods=new Set('analysis_list analysis_get ai_status ai_history render evaluate_expression parse_expression predicate_catalog lexicon_search lexicon_inspect structure_search structure_resolve structure_prepare dictionary_status dictionary_search dictionary_lookup dictionary_entry_get dictionary_predicate assistant_context reference_status passage_lexicon evidence_status lexical_notes_list learning_library'.split(' '));
  const reads=new Map(),invokeQueue=[];
  let activeInvokes=0,cooldownUntil=0,wakeTimer;
  function pumpInvokes(){
    clearTimeout(wakeTimer);
    if(!invokeQueue.length)return;
    if(Date.now()<cooldownUntil){wakeTimer=setTimeout(pumpInvokes,cooldownUntil-Date.now());return;}
    while(activeInvokes<3&&invokeQueue.length){
      const task=invokeQueue.shift();activeInvokes++;
      request('/api/invoke',task.input).then(task.resolve,error=>{
        if(error.status===429||(error.status===503&&error.code==='UPSTREAM_UPDATING'))cooldownUntil=Math.max(cooldownUntil,Date.now()+error.retryAfterMs);
        task.reject(error);
      }).finally(()=>{activeInvokes--;pumpInvokes();});
    }
  }
  function invokeRequest(method,params){
    const key=readMethods.has(method)?stable({method,params}):null;
    if(key&&reads.has(key))return reads.get(key);
    const pending=new Promise((resolve,reject)=>{invokeQueue.push({input:{method,params},resolve,reject});pumpInvokes();});
    const result=pending.finally(()=>{if(key)reads.delete(key);});
    if(key)reads.set(key,result);
    return result;
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
  async function refreshProject(retried=false){
    const project=await request('/api/refresh',{}),base=snapshots.get(project.id);
    if(!base)return project;
    const loaded=structuredClone(base);
    const saved=await request('/api/drafts/load',{projectId:project.id});
    if(!saved.envelope||saved.envelope.projectId!==project.id)return project;
    // The two reads may straddle publication. Never retire a local shell using
    // newer draft metadata while its canonical source row is still absent.
    const passageIds=new Set(project.passages.map(p=>p.id));
    const ahead=Object.keys(loaded.envelope.drafts).some(id=>id.startsWith('pending:')&&
      !saved.envelope.drafts[id]&&saved.envelope.drafts[id.replace(/^pending:/,'passage:')]&&
      !passageIds.has(id.replace(/^pending:/,'passage:')));
    if(ahead){
      if(!retried)return refreshProject(true);
      throw new Error('A publicação mudou durante a atualização. Seu rascunho local foi preservado; tente atualizar novamente.');
    }
    const changes=[];
    for(const id of new Set([...Object.keys(loaded.envelope.drafts),...Object.keys(saved.envelope.drafts)])){
      const before=loaded.envelope.drafts[id]??null,draft=saved.envelope.drafts[id]??null;
      if((base.versions[id]??0)!==(loaded.versions[id]??0)||stable(base.envelope.drafts[id]??null)!==stable(before))continue;
      if(stable(before)!==stable(draft))changes.push({id,draft,version:saved.versions[id]??0,
        expectedRevisionId:before?.revisionId??null,expectedDraft:before,expectedVersion:loaded.versions[id]??0});
    }
    if(!changes.length)return project;
    const receiptId=crypto.randomUUID(),publication={receiptId,projectId:project.id,
      storageRevision:saved.envelope.storageRevision,changes};
    refreshReceipts.set(receiptId,publication);
    if(refreshReceipts.size>16)refreshReceipts.delete(refreshReceipts.keys().next().value);
    return {...project,draftPublication:publication};
  }
  async function upload(params){
    const input=document.createElement('input');input.type='file';input.accept='application/pdf';
    const file=await new Promise(resolve=>{input.onchange=()=>resolve(input.files?.[0]??null);input.oncancel=()=>resolve(null);input.click();});
    if(!file)return null;
    if(file.size>100*1024*1024)throw new Error('Escolha um PDF de até 100 MiB.');
    return request('/api/pdf',file,{binary:true,headers:{'Content-Type':'application/pdf','X-Studio-Evidence':JSON.stringify({sourceId:params.sourceId,passageId:params.passageId,replace:params.replace===true,expectedRevision:params.expectedRevision})}});
  }
  window.studio=Object.freeze({
    runtime:'collaborative',
    capabilities:Object.freeze({get passageManagement(){return identity?.user?.role==='admin';},get analysis(){return identity?.aiEnabled===true;},get sourceReview(){return ['reviewer','admin'].includes(identity?.user?.role);}}),
    evidenceUrl:({projectId,sourceId,assetId})=>'/api/pdf?'+new URLSearchParams({projectId,sourceId,assetId}),
    evidenceCacheScope:()=>identity?.user?.id??null,
    submitContribution:()=>window.collab.submit(),
    prepareSubmission:(id,pageIndex)=>request('/api/submission/prepare',{id,pageIndex}),
    publishSubmission:async token=>{
      const value=await request('/api/submission/publish',{token});
      snapshots.set(value.envelope.projectId,structuredClone({envelope:value.envelope,versions:value.versions}));
      latestEnvelope=value.envelope;notify({type:'submissions-change'});return value;
    },
    listSubmissions:async id=>{
      const rows=[];let after=0;
      do{const data=await request('/api/submissions?'+new URLSearchParams({projectId:id,after:String(after)}));rows.push(...data.submissions);after=data.next;}while(after!==null);
      return rows;
    },
    invoke:async(method,params={})=>{
      if(method==='evidence_attach'||method==='evidence_relocate'){
        if(method==='evidence_relocate')throw new Error('Peça à administração para recuperar o PDF do backup no servidor.');
        return upload(params);
      }
      const value=await invokeRequest(method,params);
      if(method==='source_apply' && value.draftPublication){
        const publication=value.draftPublication,base=snapshots.get(publication.projectId);
        if(base&&publication.projectId===value.id){
          for(const change of publication.changes){
            base.versions[change.id]=change.version;
            if(change.draft===null)delete base.envelope.drafts[change.id];
            else base.envelope.drafts[change.id]=structuredClone(change.draft);
          }
          base.envelope.storageRevision=publication.storageRevision;
        }
      }
      if(method==='session_restore'){projectId=value.project?.id??null;selected=value.selectedPassageId??value.project?.passages[0]?.id??null;notify({type:'selection',passageId:selected});}
      if(method==='analysis_accept' && value.envelope && value.versions) snapshots.set(value.envelope.projectId,structuredClone({envelope:value.envelope,versions:value.versions}));
      if(method==='session_select'){selected=params.passageId;projectId=params.projectId;notify({type:'selection',passageId:selected});void heartbeat();}
      return value;
    },
    loadDrafts:async(id)=>{if(id.startsWith('example:'))return null;const value=await request('/api/drafts/load',{projectId:id});snapshots.set(id,structuredClone(value));return value.envelope;},
    managePassages:async(input)=>{
      const base=snapshots.get(projectId);
      if(failed||inflight||!base)throw new Error('Espere o salvamento terminar antes de organizar.');
      const value=await request('/api/admin/passages',{...input,projectId,storageRevision:base.envelope.storageRevision});
      snapshots.set(projectId,structuredClone({envelope:value.envelope,versions:value.versions}));
      latestEnvelope=value.envelope;
      return value;
    },
    saveDrafts,
    refreshProject,
    acknowledgeDraftPublication:(receiptId,ids)=>{
      const publication=refreshReceipts.get(receiptId),base=publication&&snapshots.get(publication.projectId);
      if(!base)return [];
      const accepted=new Set(ids),merged=[];
      for(const change of publication.changes){
        if(!accepted.has(change.id))continue;
        if((base.versions[change.id]??0)!==change.expectedVersion||
          stable(base.envelope.drafts[change.id]??null)!==stable(change.expectedDraft))continue;
        base.versions[change.id]=change.version;
        if(change.draft===null)delete base.envelope.drafts[change.id];
        else base.envelope.drafts[change.id]=structuredClone(change.draft);
        merged.push(change.id);
      }
      base.envelope.storageRevision=publication.storageRevision;
      refreshReceipts.delete(receiptId);
      return merged;
    },
    openProject:refreshProject,
    setupProject:()=>Promise.reject(new Error('O projeto é configurado pela administração do servidor.')),
    render:params=>invokeRequest('render',params),
    onEvent:listener=>{listeners.add(listener);return()=>listeners.delete(listener);},
    copyText:text=>navigator.clipboard.writeText(text),
    recordUsage,
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
    submit:async()=>{
      if(failed||inflight)throw new Error('Espere a confirmação do salvamento antes de enviar.');
      const saved=snapshots.get(projectId)?.envelope?.drafts[selected];
      if(!saved)throw new Error('Salve sua edição antes de enviar.');
      const result=await request('/api/submit',{passageId:selected,revisionId:saved.revisionId});
      notify({type:'submissions-change'});return result;
    },
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
