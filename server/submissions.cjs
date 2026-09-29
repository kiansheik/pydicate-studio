'use strict';
const {randomUUID,createHash}=require('node:crypto');
const {fault,identifier,passageKey,text}=require('./store.cjs');
const snapshotHash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
class Submissions {
  constructor(store,{readEvidence=null}={}){this.store=store;this.readEvidence=readEvidence;}
  async submit(user,{passageId,revisionId},project,context={}){
    identifier(passageId);identifier(revisionId);
    return this.store.transaction(async()=>{
      await this.store.assertUser(user);
      // Take the author's saved revision, never a browser-authored identity or someone else's current draft.
      const rows=(await this.store.db.query(`SELECT id,after_json FROM revisions WHERE project_id=$1 AND passage_id=$2 AND user_id=$3 AND after_json IS NOT NULL ORDER BY id DESC LIMIT 500`,[project.id,passageId,user.id])).rows;
      const row=rows.find(r=>JSON.parse(r.after_json).revisionId===revisionId);
      if(!row)throw fault(409,'SAVE_BEFORE_SUBMIT','Salve uma edição sua antes de enviar. A revisão solicitada não foi encontrada.');
      const existing=(await this.store.db.query('SELECT id,snapshot_sha256 FROM submissions WHERE author_id=$1 AND draft_revision_id=$2',[user.id,row.id])).rows[0];
      // Sending for review means the author is done. The claim is handed back on
      // every success, including a repeated send, so a reviewer is never locked
      // out by a tab the author simply left open.
      if(existing){await this.store.releaseOwned(passageId,user);return {id:existing.id,snapshotSha256:existing.snapshot_sha256,reused:true};}
      const draft=JSON.parse(row.after_json);
      if(!draft.raw?.trim())throw fault(400,'EMPTY_SUBMISSION','Inclua uma análise antes de enviar para revisão.');
      const source=project.passages.find(p=>p.id===passageId);
      if(source && source.sourceFingerprint!==draft.sourceFingerprint)throw fault(409,'STALE_SUBMISSION','A fonte mudou. Reconcilie e salve uma nova versão antes de enviar.');
      const sourceId=source?.sourceId??draft.pending?.sourceId;
      const sourceDescriptor=project.sources?.find(s=>s.id===sourceId);
      if(!sourceId||(!sourceDescriptor&&!project.passages.some(p=>p.sourceId===sourceId)))throw fault(409,'SOURCE_MISSING','Fonte desconhecida; recarregue o projeto.');
      const evidenceStatus=await this.readEvidence?.({projectId:project.id,sourceId,passageId:passageKey(passageId)},user,context);
      const regions=evidenceStatus?.passage?.regions?.filter(region=>region.assetId===evidenceStatus.asset?.id)||[];
      // Capture only this passage's saved crops. A selected source PDF or an
      // inherited predecessor guide is not evidence authored for this passage.
      const evidence=regions.length?{version:1,assetId:evidenceStatus.asset.id,passageId:passageKey(passageId),
        manifestRevision:evidenceStatus.revision,regions,view:evidenceStatus.passage.view}:null;
      const snapshot={format:'pydicate-submission',version:1,projectId:project.id,passageId,sourceId,
        ...(sourceDescriptor?{source:{id:sourceDescriptor.id,title:sourceDescriptor.title,year:sourceDescriptor.year}}:{}),
        ...(evidence?{evidence}:{}),
        draft,original:source?{id:source.id,sourceExpression:source.sourceExpression,sourceFingerprint:source.sourceFingerprint,ordinal:source.ordinal}:null,
        engineFingerprint:project.engineFingerprint,context:this.store.context};
      const id=randomUUID(),sha=snapshotHash(snapshot);
      await this.store.db.query('INSERT INTO submissions VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[id,project.id,passageKey(passageId),user.id,row.id,JSON.stringify(snapshot),sha,this.store.now()]);
      await this.store.db.query("INSERT INTO submission_events(submission_id,actor_id,event,at) VALUES($1,$2,'submitted',$3)",[id,user.id,this.store.now()]);
      await this.store.audit(user.id,'submission.submit',passageId,'succeeded',null,'server',{submissionId:id,snapshotSha256:sha});
      await this.store.releaseOwned(passageId,user);
      return {id,snapshotSha256:sha,reused:false};
    });
  }
  async list(user,after=0){
    if(!Number.isSafeInteger(after)||after<0)throw fault(400,'CURSOR','Cursor inválido.');
    // All workspace members can review scientific submissions; account emails are never returned.
    const rows=(await this.store.db.query(`SELECT s.id,s.passage_id AS "passageId",s.author_id AS "authorId",u.name AS author,
      s.snapshot_sha256 AS "snapshotSha256",s.submitted_at AS "submittedAt",s.draft_revision_id AS "draftRevisionId",
      (SELECT e.event FROM submission_events e WHERE e.submission_id=s.id ORDER BY e.id DESC LIMIT 1) AS status
      FROM submissions s JOIN users u ON u.id=s.author_id WHERE s.draft_revision_id>$1 ORDER BY s.draft_revision_id LIMIT 101`,[after])).rows;
    return {submissions:rows.slice(0,100),next:rows.length>100?rows[99].draftRevisionId:null};
  }
  async get(id){
    identifier(id);const row=(await this.store.db.query('SELECT * FROM submissions WHERE id=$1',[id])).rows[0];
    if(!row)throw fault(404,'SUBMISSION_MISSING','Contribuição desconhecida.');
    return row;
  }
  async review(user,input){
    if(!['ready','changes_requested'].includes(input.event))throw fault(400,'REVIEW_STATE','Estado inválido.');
    text(input.note??'',4000,false);
    return this.store.transaction(async()=>{
      const actor=await this.store.assertUser(user);if(!['admin','reviewer'].includes(actor.role))throw fault(403,'REVIEWER_REQUIRED','Somente revisores podem revisar contribuições.');
      const row=await this.get(input.id);
      if(input.snapshotSha256!==row.snapshot_sha256)throw fault(409,'SUBMISSION_CHANGED','Confira a revisão exata antes de decidir.');
      const last=(await this.store.db.query('SELECT event FROM submission_events WHERE submission_id=$1 ORDER BY id DESC LIMIT 1',[row.id])).rows[0];
      if(['imported','merged'].includes(last?.event))throw fault(409,'ALREADY_IMPORTED','Esta versão já foi importada; envie uma nova revisão.');
      await this.store.db.query('INSERT INTO submission_events(submission_id,actor_id,event,at,details) VALUES($1,$2,$3,$4,$5)',[row.id,user.id,input.event,this.store.now(),{note:input.note??'',snapshotSha256:row.snapshot_sha256}]);
      await this.store.audit(user.id,'submission.'+input.event,row.passage_id);
      return {ok:true};
    });
  }
  async export(ids){
    if(!Array.isArray(ids)||!ids.length||ids.length>200||new Set(ids).size!==ids.length)throw fault(400,'SUBMISSION_IDS','Escolha de 1 a 200 contribuições diferentes.');
    return this.store.db.transaction(async()=>{
      const submissions=[];
      for(const id of ids){const row=await this.get(id);submissions.push({id:row.id,authorId:row.author_id,snapshotSha256:row.snapshot_sha256,snapshotJson:row.snapshot});}
      // Snapshot TEXT retains the exact bytes covered by its SHA-256 across DB exports.
      return {format:'pydicate-submission-package',version:1,exportedAt:new Date(this.store.now()).toISOString(),submissions};
    },{readOnly:true});
  }
}
module.exports={Submissions,snapshotHash};
