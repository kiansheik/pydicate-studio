'use strict';
const fs=require('node:fs/promises'),path=require('node:path');
const {execFile}=require('node:child_process');const {promisify}=require('node:util');
const execute=promisify(execFile);
async function git(parent,repo,args){
  if(!['oldtupicorpus','nhe-enga'].includes(repo))throw new Error('Invalid publication repository');
  return (await execute('git',['-c','safe.directory='+path.join(parent,repo),'-C',path.join(parent,repo),...args],{timeout:60000,maxBuffer:2*1024*1024})).stdout.trim();
}
async function register(store,parent,receipt){
  if(receipt?.format!=='pydicate-import-receipt'||receipt.version!==1||!Array.isArray(receipt.receipts)||receipt.receipts.length>200)throw new Error('Invalid import receipt');
  for(const row of receipt.receipts){
    if(!/^[a-f0-9]{40}$/.test(row.commitSha)||!/^[a-f0-9]{64}$/.test(row.snapshotSha256))throw new Error('Invalid publication hash');
    const message=await git(parent,row.repository,['show','-s','--format=%B',row.commitSha]);
    if(!message.split('\n').includes('Studio-Submission: '+row.submissionId)||!message.split('\n').includes('Studio-Snapshot: '+row.snapshotSha256))throw new Error('Commit does not identify the exact submitted version');
  }
  await store.transaction(async()=>{
    for(const row of receipt.receipts){
      const submission=(await store.db.query('SELECT * FROM submissions WHERE id=$1',[row.submissionId])).rows[0];
      if(!submission||submission.snapshot_sha256!==row.snapshotSha256)throw new Error('Unknown or mismatched submission');
      const inserted=await store.db.query('INSERT INTO publication_receipts VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING RETURNING submission_id',[row.submissionId,row.repository,row.commitSha,row.snapshotSha256,store.now()]);
      if(inserted.rowCount)await store.db.query("INSERT INTO submission_events(submission_id,event,at,details) VALUES($1,'imported',$2,$3)",[row.submissionId,store.now(),{repo:row.repository,commit:row.commitSha}]);
    }
  });
}
async function verifyMerged(store,parent){
  const rows=(await store.db.query('SELECT r.*,s.author_id,s.project_id,s.snapshot FROM publication_receipts r JOIN submissions s ON s.id=r.submission_id')).rows;
  let marked=0;
  for(const row of rows){
    try {
      // A reviewed commit must be both in fetched main AND in the deployed working branch.
      await git(parent,row.repository,['merge-base','--is-ancestor',row.commit_sha,'origin/main']);
      await git(parent,row.repository,['merge-base','--is-ancestor',row.commit_sha,'HEAD']);
    }catch{continue;}
    await store.transaction(async()=>{
      const result=await store.db.query('INSERT INTO merge_notifications(submission_id,user_id,commit_sha,merged_at) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING id',[row.submission_id,row.author_id,row.commit_sha,store.now()]);
      if(result.rowCount){
        const snapshot=JSON.parse(row.snapshot), pending=snapshot.passageId;
        if(pending.startsWith('pending:')){
          const current=(await store.db.query('SELECT data FROM drafts WHERE project_id=$1 AND passage_id=$2',[row.project_id,pending])).rows[0];
          const draft=current?.data&&JSON.parse(current.data);
          if(draft?.revisionId===snapshot.draft.revisionId && draft.raw===snapshot.draft.raw){
            await store.db.query('UPDATE drafts SET data=NULL,version=version+1 WHERE project_id=$1 AND passage_id=$2',[row.project_id,pending]);
            await store.db.query('UPDATE projects SET revision=revision+1 WHERE id=$1',[row.project_id]);
            await store.db.query('INSERT INTO revisions(project_id,passage_id,user_id,at,before_json,after_json) VALUES($1,$2,NULL,$3,$4,NULL)',[row.project_id,pending,store.now(),current.data]);
            await store.audit(null,'submission.retire-pending',pending);
          }
        }
        marked++;await store.db.query("INSERT INTO submission_events(submission_id,event,at,details) VALUES($1,'merged',$2,$3)",[row.submission_id,store.now(),{repo:row.repository,commit:row.commit_sha}]);}
    });
  }
  return {merged:marked};
}
module.exports={register,verifyMerged};
if(require.main===module)(async()=>{
  const {Store}=require('./store.cjs');const store=await Store.open(process.env.COLLAB_STATE_DIR||'/data');
  try{if(process.argv[2]==='record'){const file=process.argv[3];if(!file||(await fs.stat(file)).size>2*1024*1024)throw new Error('Invalid receipt file');await register(store,process.env.PYDICATE_PROJECT_PARENT,JSON.parse(await fs.readFile(file,'utf8')));}
    else if(process.argv[2]==='verify')console.log(JSON.stringify(await verifyMerged(store,process.env.PYDICATE_PROJECT_PARENT)));
    else throw new Error('Usage: publication.cjs record RECEIPT | verify');
  }finally{await store.close();}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
