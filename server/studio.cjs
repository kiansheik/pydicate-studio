'use strict';
const path = require('node:path');
const { spawn } = require('node:child_process');
const { fault, identifier } = require('./store.cjs');

// Deliberately NOT the entire desktop bridge. New desktop methods stay denied.
const READ = new Set(`render learning_library parse_expression evaluate_expression predicate_catalog
predicate_create composition_define node_definition source_preview source_new_preview
lexicon_search structure_search structure_resolve lexicon_inspect lexicon_create lexicon_update
dictionary_search dictionary_lookup dictionary_entry_get dictionary_predicate assistant_context
reference_verify reference_status passage_lexicon evidence_status evidence_bytes evidence_save
lexical_notes_list lexical_notes_save lexical_notes_export`.split(/\s+/));
const REVIEW = new Set(['source_apply', 'reference_approve', 'contribution_prepare']);
const PREVIEW = new Set(['source_preview', 'source_new_preview', 'lexicon_create', 'lexicon_update', 'composition_define']);

function authorizeMethod(method, role) {
  if (!READ.has(method) && !REVIEW.has(method)) throw fault(403,'HOSTED_UNAVAILABLE','Esta operação não está habilitada no servidor colaborativo. IA paga, reparos da gramática e configurações locais ficam no desktop.');
  if (REVIEW.has(method) && !['reviewer','admin'].includes(role)) throw fault(403,'REVIEWER_REQUIRED','Somente revisores podem publicar na fonte ou aprovar referências.');
}
class Queue {
  constructor() { this.tail = Promise.resolve(); this.count = 0; this.users = new Map(); }
  run(userId, action) {
    if (this.count >= 32 || (this.users.get(userId) || 0) >= 8) return Promise.reject(fault(429,'ENGINE_BUSY','Aguarde as operações em andamento.'));
    this.count++; this.users.set(userId,(this.users.get(userId)||0)+1);
    const pending = this.tail.catch(() => {}).then(action);
    this.tail = pending;
    return pending.finally(() => { this.count--; this.users.set(userId,this.users.get(userId)-1); });
  }
}
async function createStudio(config, store, emit = () => {}) {
  // Lazy imports allow HTTP/auth tests to run without Electron or corpus fixtures.
  const { PythonWorker } = require('../electron/python-worker.cjs');
  const { createNextService } = require('../electron/next-service.cjs');
  const validate = require('../electron/validation.cjs');
  let project, worker, pickedFile = null, service;
  const queue = new Queue(), previews = new Map();
  // SMTP and provider secrets are not inherited by the grammar process.
  const workerEnv = Object.fromEntries(['PATH','HOME','LANG','LC_ALL','TMPDIR','SYSTEMROOT','VIRTUAL_ENV']
    .filter(k => process.env[k]).map(k => [k,process.env[k]]));
  function makeWorker() {
    return new PythonWorker({ executable: config.python,
      script: path.join(config.applicationDirectory,'python/worker.py'),
      stateDirectory: path.join(config.stateDirectory,'projects'),
      spawnProcess: (file,args,options) => spawn(file,args,{...options,env:{...workerEnv,
        PYTHONDONTWRITEBYTECODE:'1',PYTHONUNBUFFERED:'1',PYTHONIOENCODING:'utf-8'}}),
    });
  }
  async function open() {
    const candidate = makeWorker();
    try {
      const next = validate.project(await candidate.request('open_project',{parentPath:config.parent}));
      if (project && next.id !== project.id) throw new Error('Project identity changed. Restart after reviewing the server workspace.');
      const initial=!project; worker?.close(); worker = candidate; project = next; if(initial)store.seed(project);
      return project;
    } catch (error) { candidate.close(); throw error; }
  }
  await open();
  service = createNextService({ stateDirectory:config.stateDirectory, applicationDirectory:config.applicationDirectory,
    draftStore:store, getProject:()=>project, getWorker:()=>worker, getParent:()=>config.parent,
    defaultParent:config.parent, openPath:open, reloadProject:open, emit,
    duringProjectWrite:action=>action(),
    adoptProject:value=>{ project=validate.project(value); },
    chooseFile:async()=>pickedFile,
  });
  const hasPassage = id => project.passages.some(p=>p.id===id) || !!store.snapshot(project.id).envelope?.drafts[id];
  function passage(id, pending = false) {
    identifier(id);
    if (!hasPassage(id) && !(pending && /^pending:[a-f0-9-]{36}$/.test(id))) throw fault(404,'PASSAGE_MISSING','Passagem desconhecida.');
    return id;
  }
  function validateChanges(changes) {
    if (!Array.isArray(changes)) throw fault(400,'INVALID_PATCH','Alterações inválidas.');
    const sources = new Set(project.passages.map(p=>p.sourceId));
    for (const change of changes) {
      passage(change.id, true);
      if (change.draft?.pending && !sources.has(change.draft.pending.sourceId)) throw fault(400,'SOURCE_MISSING','Fonte desconhecida.');
    }
  }
  async function invoke(method, input, context) {
    if (method === 'dictionary_status') return {available:false,message:'No servidor, consulte o dicionário pela busca de peças/Léxico. O site incorporado do desktop não está habilitado.'};
    if (!READ.has(method) && !REVIEW.has(method)) throw fault(403,'HOSTED_UNAVAILABLE','Esta operação não está habilitada no servidor colaborativo. IA paga, reparos da gramática e configurações locais ficam no desktop.');
    return queue.run(context.user.id,async()=>{
      const user = store.assertUser(context.user);
      authorizeMethod(method,user.role);
      const params = structuredClone(input);
      if (params.projectId && params.projectId!==project.id) throw fault(403,'PROJECT_MISMATCH','Projeto inválido.');
      // File selection, parent directories and shell/provider settings never come from HTTP.
      for (const key of ['parentPath','stateDirectory','corpusPath','enginePath','filePath','directory']) {
        if (Object.hasOwn(params,key)) throw fault(400,'PATH_FORBIDDEN','Caminhos locais não são aceitos.');
      }
      params.projectId=project.id;
      let target = params.passageId;
      if (target) passage(target,true);
      if (method==='source_apply') {
        const preview=previews.get(params.previewId);
        if (!preview || preview.userId!==user.id || preview.clientId!==context.clientId || preview.expires<store.now()) throw fault(409,'PREVIEW_REQUIRED','Gere e revise uma nova prévia nesta sessão.');
        target=preview.passageId;
      }
      if (['evidence_save','reference_approve','source_apply'].includes(method) && target) store.assertClaim(target,user,context.clientId,true);
      if (method==='lexical_notes_save') {
        if (params.note?.passageId) { passage(params.note.passageId,true); store.assertClaim(params.note.passageId,user,context.clientId,true); }
        params.note={...params.note,provenance:{...params.note?.provenance,collaboration:{userId:user.id,name:user.name}}};
      }
      const started=performance.now();
      try {
        const result=method==='render'
          ? validate.renderResult(await worker.request('render',validate.renderRequest(input)))
          : await service.invoke(method,params);
        if (PREVIEW.has(method) && result?.previewId) {
          if (previews.size>256) previews.delete(previews.keys().next().value);
          previews.set(result.previewId,{userId:user.id,clientId:context.clientId,passageId:target,expires:store.now()+15*60_000});
        }
        if (method==='source_apply') previews.delete(params.previewId);
        store.audit(user.id,'operation.'+method,target??null,'succeeded',Math.round(performance.now()-started));
        if (['source_apply','reference_approve'].includes(method)) emit({type:'source-change',projectId:project.id});
        return result;
      } catch(error) {
        store.audit(user.id,'operation.'+method,target??null,'failed',Math.round(performance.now()-started));
        // Engine diagnostics are needed by the editor, but never enter telemetry.
        if (!error.status) { error.status=422; error.code ||= 'ENGINE_ERROR'; }
        throw error;
      }
    });
  }
  return {
    get project(){return project;}, hasPassage, passage, validateChanges, invoke,
    refresh:context=>queue.run(context.user.id,async()=>{store.assertUser(context.user);return open();}),
    upload:(file,params,context)=>queue.run(context.user.id,async()=>{
      const user=store.assertUser(context.user);
      if (user.role==='contributor') throw fault(403,'REVIEWER_REQUIRED','Um revisor deve vincular o PDF.');
      passage(params.passageId,true);
      if (!project.passages.some(p=>p.sourceId===params.sourceId)) throw fault(400,'SOURCE_MISSING','Fonte desconhecida.');
      pickedFile=file;
      try {
        const result=await service.invoke('evidence_attach',{...params,projectId:project.id});
        store.audit(user.id,'evidence.attach',params.passageId);
        emit({type:'evidence-change',projectId:project.id,sourceId:params.sourceId});
        return result;
      } finally { pickedFile=null; }
    }),
    close:async()=>{await queue.tail.catch(()=>{});await service.close();worker?.close();},
  };
}
module.exports={createStudio,Queue,READ,REVIEW,authorizeMethod};
