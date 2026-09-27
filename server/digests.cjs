'use strict';
const {randomUUID}=require('node:crypto');
async function sendDigests(store,sendMail,{mode='off',origin='https://studio.academiatupi.com'}={}){
  if(mode==='off')return {sent:0};
  if(!['hourly','daily'].includes(mode))throw new Error('Digest mode must be off, hourly or daily');
  const period=mode==='daily'?86400000:3600000;
  const cutoff=Math.floor(store.now()/period)*period,bucket=mode+':'+cutoff;
  let sent=0;
  // This session lock prevents two scheduler processes from submitting the same outbox simultaneously.
  const owner=await store.db.pool.connect();
  try{
    if(!(await owner.query('SELECT pg_try_advisory_lock(731868603) AS owned')).rows[0].owned)return {sent:0};
    await store.transaction(async()=>{
      const users=(await store.db.query('SELECT DISTINCT n.user_id FROM merge_notifications n JOIN users u ON u.id=n.user_id WHERE n.sent_at IS NULL AND n.merged_at<$1 AND u.disabled=0',[cutoff])).rows;
      for(const user of users){
        const pending=(await store.db.query("SELECT 1 FROM digest_batches WHERE user_id=$1 AND state!='sent' LIMIT 1",[user.user_id])).rows[0];if(pending)continue;
        const rows=(await store.db.query('SELECT id,submission_id,commit_sha FROM merge_notifications WHERE user_id=$1 AND sent_at IS NULL AND merged_at<$2 ORDER BY id LIMIT 200',[user.user_id,cutoff])).rows;
        if(!rows.length)continue;
        const body='Suas contribuições integradas ao corpus e disponíveis no Studio:\n\n'+rows.map(r=>r.submission_id+' — commit '+r.commit_sha.slice(0,12)).join('\n')+'\n\n'+origin+'\n\nEste resumo confirma integração técnica. Pagamentos/bônus continuam sujeitos à revisão do projeto.\n';
        await store.db.query("INSERT INTO digest_batches VALUES($1,$2,$3,$4,$5,'pending',$6) ON CONFLICT(user_id,bucket) DO NOTHING",[randomUUID(),user.user_id,bucket,JSON.stringify(rows.map(r=>r.id)),body,store.now()]);
      }
    });
    const batches=(await store.db.query("SELECT b.*,u.email FROM digest_batches b JOIN users u ON u.id=b.user_id WHERE b.state!='sent' AND u.disabled=0 ORDER BY b.updated_at LIMIT 100")).rows;
    for(const batch of batches){
      await store.db.query("UPDATE digest_batches SET state='sending',updated_at=$1 WHERE id=$2",[store.now(),batch.id]);
      try{
        await sendMail({to:batch.email,subject:'Contribuições integradas — Pydicate Studio',body:batch.body,messageId:'<'+batch.id+'@studio.academiatupi.com>'});
        await store.transaction(async()=>{
          await store.db.query("UPDATE digest_batches SET state='sent',updated_at=$1 WHERE id=$2",[store.now(),batch.id]);
          await store.db.query('UPDATE merge_notifications SET sent_at=$1 WHERE id=ANY($2::bigint[])',[store.now(),batch.notification_ids]);
          await store.audit(batch.user_id,'mail.merge-digest');
        });sent++;
      }catch{
        await store.db.query("UPDATE digest_batches SET state='pending',updated_at=$1 WHERE id=$2",[store.now(),batch.id]);
        await store.audit(batch.user_id,'mail.merge-digest',null,'failed');
      }
    }
  }finally{await owner.query('SELECT pg_advisory_unlock(731868603)').catch(()=>{});owner.release();}
  return {sent};
}
module.exports={sendDigests};
if(require.main===module)(async()=>{
  const {Store}=require('./store.cjs'),{mailer}=require('./mail.cjs');
  const store=await Store.open(process.env.COLLAB_STATE_DIR||'/tmp/digests');
  try{console.log(JSON.stringify(await sendDigests(store,mailer(process.env.PYDICATE_PYTHON||'python3'),{mode:process.env.COLLAB_DIGEST_MODE||'off',origin:process.env.COLLAB_PUBLIC_URL})));}
  finally{await store.close();}
})().catch(()=>{console.error('Merge digest failed; records were preserved for retry.');process.exitCode=1;});
