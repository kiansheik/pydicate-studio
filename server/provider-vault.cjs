'use strict';
const fs=require('node:fs/promises');
const {randomBytes,createCipheriv,createDecipheriv}=require('node:crypto');
const {fault}=require('./store.cjs');
class ProviderVault {
  constructor(store,keyFile=''){this.store=store;this.keyFile=keyFile;}
  async key(){
    if(!this.keyFile)throw fault(503,'VAULT_UNCONFIGURED','O cofre de credenciais não foi configurado pela administração.');
    const stat=await fs.stat(this.keyFile);
    if(!stat.isFile()||stat.size>128)throw fault(503,'VAULT_INVALID','Arquivo de chave inválido.');
    const key=Buffer.from((await fs.readFile(this.keyFile,'utf8')).trim(),'hex');
    if(key.length!==32)throw fault(503,'VAULT_INVALID','Chave do cofre inválida.');
    return key;
  }
  async encrypt(userId,provider,secret){
    const key=await this.key(),nonce=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,nonce);
    cipher.setAAD(Buffer.from(`pydicate-v1:${userId}:${provider}`));
    const bytes=Buffer.concat([cipher.update(secret,'utf8'),cipher.final()]);
    return JSON.stringify({version:1,nonce:nonce.toString('base64'),tag:cipher.getAuthTag().toString('base64'),ciphertext:bytes.toString('base64')});
  }
  // Internal-only for a future isolated provider worker. No HTTP endpoint returns this.
  async decrypt(userId,provider,payload){
    const value=JSON.parse(payload);if(value.version!==1)throw new Error('Unsupported credential version');
    const cipher=createDecipheriv('aes-256-gcm',await this.key(),Buffer.from(value.nonce,'base64'));
    cipher.setAAD(Buffer.from(`pydicate-v1:${userId}:${provider}`));cipher.setAuthTag(Buffer.from(value.tag,'base64'));
    return Buffer.concat([cipher.update(Buffer.from(value.ciphertext,'base64')),cipher.final()]).toString('utf8');
  }
  async status(user){
    const rows=(await this.store.db.query('SELECT provider,funding,monthly_limit_cents,credential_ciphertext IS NOT NULL AS configured FROM provider_settings WHERE user_id=$1',[user.id])).rows;
    return {enabled:false,credentialStorageAvailable:!!this.keyFile,providers:['codex','claude'].map(provider=>{
      const row=rows.find(r=>r.provider===provider);
      return {provider,funding:row?.funding||'disabled',monthlyLimitCents:row?.monthly_limit_cents||0,configured:!!row?.configured,
        ownerConfigured:!!process.env[`COLLAB_${provider.toUpperCase()}_API_KEY_FILE`]};
    }),message:'Execução de IA desativada. Preferências e chaves podem ser preparadas, mas ainda não geram uso. Limites são configurações futuras, não cotas já aplicadas.'};
  }
  async save(user,input){
    if(!['codex','claude'].includes(input.provider)||!['disabled','owner','personal'].includes(input.funding)||
      !Number.isSafeInteger(input.monthlyLimitCents)||input.monthlyLimitCents<0||input.monthlyLimitCents>1000000){
      throw fault(400,'PROVIDER_SETTINGS','Preferências inválidas.');
    }
    let encrypted;
    if(input.apiKey!==undefined&&input.apiKey!==''){
      if(typeof input.apiKey!=='string'||input.apiKey.length<20||input.apiKey.length>512||/[\s\u0000-\u001f]/.test(input.apiKey))throw fault(400,'PROVIDER_KEY','Chave de API inválida. Não envie senha ou arquivo de sessão.');
      encrypted=await this.encrypt(user.id,input.provider,input.apiKey);
    }
    await this.store.transaction(async()=>{
      await this.store.assertUser(user);
      const current=(await this.store.db.query('SELECT credential_ciphertext FROM provider_settings WHERE user_id=$1 AND provider=$2',[user.id,input.provider])).rows[0];
      const credential=input.removeKey===true?null:encrypted??current?.credential_ciphertext??null;
      await this.store.db.query(`INSERT INTO provider_settings VALUES($1,$2,$3,$4,$5,$6)
        ON CONFLICT(user_id,provider) DO UPDATE SET funding=excluded.funding,monthly_limit_cents=excluded.monthly_limit_cents,
        credential_ciphertext=excluded.credential_ciphertext,updated_at=excluded.updated_at`,
        [user.id,input.provider,input.funding,input.monthlyLimitCents,credential,this.store.now()]);
      await this.store.audit(user.id,'provider.settings',null,'changed');
    });
    return this.status(user);
  }
}
module.exports={ProviderVault};
