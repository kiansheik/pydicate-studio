'use strict';
const fs = require('node:fs/promises');
const { randomBytes, createHash } = require('node:crypto');
const { fault } = require('./store.cjs');
const token = () => randomBytes(32).toString('base64url');
const digest = text => createHash('sha256').update(text).digest('hex');
const tokenPattern = /^[A-Za-z0-9_-]{43}$/;

/** Fixed first-party code bridge, not a general OIDC client. No password/hash import. */
class AcademiaIdentity {
  constructor(store, auth, settings = {}, fetcher = fetch) {
    this.store = store; this.auth = auth; this.settings = settings; this.fetcher = fetcher;
    this.checks = new Map();
    this.enabled = settings.enabled === true;
    this.cookieName = auth.secure ? '__Host-studio-identity' : 'studio-dev-identity';
    if (this.enabled) {
      const parsed = new URL(settings.issuer);
      if (parsed.origin !== settings.issuer || (parsed.protocol !== 'https:' && !(settings.allowHttp && ['127.0.0.1','localhost'].includes(parsed.hostname)))) throw new Error('Identity issuer must be an HTTPS origin.');
      if (!settings.secretFile) throw new Error('Identity client secret file is required.');
    }
  }
  assertEnabled() { if (!this.enabled) throw fault(404,'IDENTITY_DISABLED','O login Academia Tupi ainda não foi habilitado.'); }
  cookie(value, clear = false) { return `${this.cookieName}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${clear ? 0 : 600}${this.auth.secure ? '; Secure' : ''}`; }
  async call(endpoint, payload) {
    this.assertEnabled();
    try {
      const stat=await fs.stat(this.settings.secretFile); if(!stat.isFile()||stat.size>1024)throw new Error();
      const secret = (await fs.readFile(this.settings.secretFile,'utf8')).trim();
      if (!/^[A-Za-z0-9_-]{64,256}$/.test(secret)) throw new Error();
      const response = await this.fetcher(this.settings.issuer + '/api/auth/studio/' + endpoint, {
        method:'POST',redirect:'error',signal:AbortSignal.timeout(8000),
        headers:{'Content-Type':'application/json','X-Studio-Client-Secret':secret},body:JSON.stringify(payload),
      });
      const reader=response.body.getReader(); let length=0;const chunks=[];
      try { while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>8192)throw new Error();chunks.push(Buffer.from(value));} }
      finally { await reader.cancel().catch(()=>{}); }
      if (!response.ok) throw new Error();
      return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch { throw fault(503,'IDENTITY_UNAVAILABLE','Não foi possível verificar a conta no Neologismos. Recomece o login; nenhuma senha foi copiada.'); }
  }
  validate(claims) {
    if (claims?.iss !== this.settings.issuer || claims?.aud !== this.settings.clientId ||
        claims.email_verified !== true || !/^[a-f0-9-]{36}$/i.test(claims.sub??'') ||
        !/^[a-f0-9]{64}$/.test(claims.auth_revision??'') || typeof claims.email !== 'string' ||
        claims.email.length>254 || !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(claims.email)) {
      throw fault(401,'IDENTITY_INVALID','A identidade recebida não pôde ser verificada.');
    }
    return {...claims,email:claims.email.toLowerCase()};
  }
  async start(input = {}, session = null) {
    this.assertEnabled();
    let inviteHash=null, linkUser=null, passwordProof=null;
    if(input.inviteToken){
      if(!tokenPattern.test(input.inviteToken))throw fault(400,'INVALID_TOKEN','Convite inválido ou expirado.');
      inviteHash=digest(input.inviteToken);
      const row=(await this.store.db.query("SELECT t.* FROM password_tokens t JOIN users u ON u.id=t.user_id WHERE t.hash=$1 AND t.kind='invite' AND t.expires_at>$2 AND u.disabled=0 AND u.password_hash IS NULL",[inviteHash,this.store.now()])).rows[0];
      if(!row)throw fault(400,'INVALID_TOKEN','Convite inválido ou expirado.');
    }
    if(session){
      const user=await this.store.user(session.user.id);
      if(user.external_subject || !(await require('./auth.cjs').checkPassword(input.currentPassword,user.password_hash)))throw fault(401,'PASSWORD_WRONG','Confirme sua senha atual do Studio para vincular a conta.');
      if(user.role==='admin' && (await this.store.db.query("SELECT count(*) AS n FROM users WHERE role='admin' AND disabled=0 AND password_hash IS NOT NULL")).rows[0].n<=1)throw fault(409,'LOCAL_ADMIN_REQUIRED','Mantenha uma conta administrativa local de recuperação antes de vincular esta conta.');
      linkUser=user.id;passwordProof=digest(user.password_hash);
    }
    const cookie=token(),state=token(),verifier=token();
    await this.store.db.query('INSERT INTO identity_flows VALUES($1,$2,$3,$4,$5,$6,$7)',[digest(cookie),digest(state),verifier,inviteHash,linkUser,passwordProof,this.store.now()+600000]);
    const url=new URL(this.settings.issuer+'/api/auth/studio/authorize');
    url.search=new URLSearchParams({client_id:this.settings.clientId,redirect_uri:this.auth.origin+'/sso/callback',state,
      code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256'}).toString();
    return {url:url.href,cookie:this.cookie(cookie)};
  }
  async finish(input, rawCookie) {
    this.assertEnabled();
    const cookies=String(rawCookie??'').split(';').map(s=>s.trim()).filter(s=>s.startsWith(this.cookieName+'='));
    const cookie=cookies.length===1?cookies[0].slice(this.cookieName.length+1):'';
    if (!tokenPattern.test(cookie)||!tokenPattern.test(input.state??'')||!tokenPattern.test(input.code??'')||input.iss!==this.settings.issuer)throw fault(400,'IDENTITY_STATE','Recomece o login nesta aba.');
    const flow=(await this.store.db.query('DELETE FROM identity_flows WHERE cookie_hash=$1 AND state_hash=$2 AND expires_at>$3 RETURNING *',[digest(cookie),digest(input.state),this.store.now()])).rows[0];
    if(!flow)throw fault(400,'IDENTITY_STATE','Este login expirou ou já foi utilizado.');
    const claims=this.validate(await this.call('exchange',{client_id:this.settings.clientId,redirect_uri:this.auth.origin+'/sso/callback',code:input.code,code_verifier:flow.verifier}));
    return this.store.transaction(async()=>{
      const linked=(await this.store.db.query('SELECT user_id,verified_email FROM identity_links WHERE issuer=$1 AND subject=$2',[claims.iss,claims.sub])).rows[0];
      let user=linked && await this.store.user(linked.user_id);
      if(!linked){
        if(flow.invite_hash){
          const invitation=(await this.store.db.query("SELECT t.user_id FROM password_tokens t JOIN users u ON u.id=t.user_id WHERE t.hash=$1 AND t.kind='invite' AND t.expires_at>$2 AND u.disabled=0 AND u.password_hash IS NULL",[flow.invite_hash,this.store.now()])).rows[0];
          user=invitation && await this.store.user(invitation.user_id);
        }else if(flow.link_user_id){
          user=await this.store.user(flow.link_user_id);
          if(!user?.password_hash || digest(user.password_hash)!==flow.password_proof)throw fault(409,'LINK_CHANGED','A conta local mudou. Recomece a vinculação.');
        }
        if(!user || user.external_subject || user.disabled || user.email!==claims.email)throw fault(403,'STUDIO_INVITE_REQUIRED','Use um convite válido para este mesmo e-mail. Uma conta Neo não concede acesso automático ao Studio.');
        if(flow.link_user_id && user.role==='admin' && (await this.store.db.query("SELECT count(*) AS n FROM users WHERE role='admin' AND disabled=0 AND password_hash IS NOT NULL")).rows[0].n<=1)throw fault(409,'LOCAL_ADMIN_REQUIRED','Mantenha uma conta administrativa local de recuperação.');
        await this.store.db.query('INSERT INTO identity_links VALUES($1,$2,$3,$4,$5)',[user.id,claims.iss,claims.sub,claims.email,this.store.now()]);
        await this.store.db.query('UPDATE users SET password_hash=NULL WHERE id=$1',[user.id]);
        await this.auth.revoke(user.id);
        await this.store.audit(user.id,'identity.link');
      }else if(!user || user.disabled || linked.verified_email!==claims.email || user.email!==claims.email || (flow.link_user_id && flow.link_user_id!==user.id)){
        throw fault(403,'IDENTITY_ACCOUNT_CHANGED','A conta foi alterada ou desativada. Peça ajuda à administração.');
      }
      return this.auth.issueSession(await this.store.user(user.id),claims);
    });
  }
  async checkSession(row) {
    if(!row.identity_subject)return true;
    if(!this.enabled)return false;
    if(this.store.now()-row.identity_checked_at<60000)return true;
    const key=row.hash;
    if(this.checks.has(key))return this.checks.get(key);
    const task=(async()=>{
      const result=await this.call('introspect',{sub:row.identity_subject,auth_revision:row.identity_revision});
      if(!result.active){await this.store.db.query('DELETE FROM sessions WHERE hash=$1',[row.hash]);return false;}
      const claims=this.validate(result);
      if(claims.sub!==row.identity_subject||claims.auth_revision!==row.identity_revision||claims.email!==row.email){await this.store.db.query('DELETE FROM sessions WHERE hash=$1',[row.hash]);return false;}
      await this.store.db.query('UPDATE identity_sessions SET checked_at=$1 WHERE session_hash=$2',[this.store.now(),row.hash]);return true;
    })();
    this.checks.set(key,task);try{return await task;}finally{this.checks.delete(key);}
  }
}
module.exports={AcademiaIdentity};
