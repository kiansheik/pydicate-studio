'use strict';
(() => {
  const api=window.collab;if(!api)return;
  const panel=document.createElement('aside');panel.id='collab-panel';panel.setAttribute('aria-label','Colaboração');
  const toggle=document.createElement('button');toggle.id='collab-toggle';toggle.textContent='Equipe e comentários';toggle.onclick=()=>{panel.hidden=!panel.hidden;};
  document.body.append(toggle,panel);panel.hidden=true;
  function element(tag,text,parent=panel){const node=document.createElement(tag);if(text!==undefined)node.textContent=text;parent.append(node);return node;}
  function button(text,action,parent=panel){const node=element('button',text,parent);node.type='button';node.onclick=()=>Promise.resolve().then(action).catch(error=>{status.textContent=error.message;});return node;}
  element('h2','Servidor colaborativo');const status=element('p','Conectando…');status.setAttribute('role','status');
  const identity=element('p',''),selection=element('p',''),people=element('div'),actions=element('div');
  button('Reservar passagem',()=>api.request('/api/claim',{passageId:api.state().selected}),actions);
  button('Liberar passagem',()=>api.request('/api/claim',{passageId:api.state().selected,release:true}),actions);
  button('Exportar cópia local',()=>api.exportLocal(),actions);
  button('Carregar estado compartilhado',()=>api.reload(),actions);
  button('Sair',()=>api.logout(),actions);
  element('p','A reserva dura dois minutos e é renovada enquanto você está ativo. Outras pessoas podem consultar e comentar. Mudanças remotas exigem recarga explícita; não misturamos árvores concorrentes automaticamente.');
  const comments=element('section');element('h3','Comentários da passagem',comments);const list=element('div',undefined,comments);
  const form=element('form',undefined,comments),label=element('label','Comentário',form),input=element('textarea',undefined,label);input.maxLength=4000;input.required=true;
  const reply=element('input',undefined,form);reply.type='number';reply.min='1';reply.placeholder='ID da discussão para responder (opcional)';reply.setAttribute('aria-label','ID da discussão para responder');
  const send=element('button','Enviar comentário',form);send.type='submit';
  form.onsubmit=async event=>{event.preventDefault();send.disabled=true;try{await api.request('/api/comment',{passageId:api.state().selected,body:input.value,parentId:reply.value?Number(reply.value):null});input.value='';reply.value='';await loadComments();}catch(error){status.textContent=error.message;}finally{send.disabled=false;}};
  let commentSequence=0;
  async function loadComments(){
    const id=api.state().selected,sequence=++commentSequence;if(!id)return;
    selection.textContent='Passagem: '+id;list.replaceChildren();let after=0;
    do{const data=await api.request('/api/comments?passageId='+encodeURIComponent(id)+'&after='+after);if(sequence!==commentSequence)return;
      for(const comment of data.comments){const row=element('article',undefined,list);element('strong',`#${comment.id} — ${comment.author}${comment.parentId?' · resposta a #'+comment.parentId:''}`,row);element('p',comment.body,row);element('small',new Date(comment.createdAt).toLocaleString('pt-BR')+(comment.resolvedAt?' · resolvido':''),row);
        if(!comment.parentId)button(comment.resolvedAt?'Reabrir':'Resolver',async()=>{await api.request('/api/comment/resolve',{id:comment.id,resolved:!comment.resolvedAt});await loadComments();},row);}
      after=data.next;
    }while(after!==null);
  }
  button('Atualizar comentários',loadComments,comments);
  button('Exportar histórico desta passagem',async()=>{
    const id=api.state().selected;let after=0;const revisions=[];
    do{const data=await api.request('/api/history?passageId='+encodeURIComponent(id)+'&after='+after);revisions.push(...data.revisions);after=data.next;}while(after!==null);
    api.download({passageId:id,revisions},'studio-passage-history.json');
  });
  const account=element('details');element('summary','Alterar minha senha',account);
  const old=element('input',undefined,account);old.type='password';old.placeholder='Senha atual';old.autocomplete='current-password';old.setAttribute('aria-label','Senha atual');
  const next=element('input',undefined,account);next.type='password';next.placeholder='Nova senha (15+ caracteres)';next.autocomplete='new-password';next.setAttribute('aria-label','Nova senha');
  button('Trocar senha e encerrar sessões',async()=>{if(api.state().failed||api.state().inflight)throw new Error('Exporte as edições locais antes de trocar a senha.');await api.request('/api/password',{currentPassword:old.value,password:next.value});old.value='';next.value='';location.assign('/login');},account);
  function admin(){
    const section=element('details');element('summary','Administração',section);
    const address=element('input',undefined,section);address.type='email';address.placeholder='E-mail do convite';address.setAttribute('aria-label','E-mail do convite');
    const name=element('input',undefined,section);name.placeholder='Nome';name.maxLength=80;name.setAttribute('aria-label','Nome');
    const role=element('select',undefined,section);role.setAttribute('aria-label','Papel');for(const [value,text]of[['contributor','Colaborador'],['reviewer','Revisor'],['admin','Administrador']]){const option=element('option',text,role);option.value=value;}
    button('Enviar convite',async()=>{await api.request('/api/admin/invite',{email:address.value,name:name.value,role:role.value});status.textContent='Convite enviado. A pessoa definirá sua própria senha.';},section);
    const users=element('div',undefined,section);
    async function loadUsers(){const data=await api.request('/api/admin/users');users.replaceChildren();for(const user of data.users){const row=element('article',undefined,users);element('p',`${user.name} · ${user.email} · ${user.role}${user.disabled?' · desativado':''}`,row);
      const select=element('select',undefined,row);select.setAttribute('aria-label','Papel de '+user.name);for(const value of ['contributor','reviewer','admin']){const option=element('option',value,select);option.value=value;}select.value=user.role;
      const disabled=element('input',undefined,row);disabled.type='checkbox';disabled.checked=user.disabled;disabled.setAttribute('aria-label','Desativar '+user.name);
      button('Salvar conta',async()=>{if(!confirm('Alterar esta conta e encerrar suas sessões?'))return;await api.request('/api/admin/user',{id:user.id,role:select.value,disabled:disabled.checked});await loadUsers();},row);}}
    button('Listar contas',loadUsers,section);
    const report=element('pre',undefined,section);
    button('Relatório de atividade — 7 dias',async()=>{const data=await api.request('/api/admin/report?days=7');report.textContent=JSON.stringify(data,null,2);},section);
    button('Exportar relatório — 90 dias',async()=>api.download(await api.request('/api/admin/report?days=90'),'studio-usage-report.json'),section);
  }
  element('p','Todos os rascunhos e comentários deste espaço são compartilhados. A telemetria contém categorias e tempos, não o texto. Presença e contagens não calculam pagamentos nem certificam revisão.',panel).className='collab-disclosure';
  window.addEventListener('collab-status',event=>{
    const data=event.detail;
    if(data.type==='selection')void loadComments().catch(error=>{status.textContent=error.message;});
    if(data.type==='comments-change'&&data.passageId===api.state().selected?.replace(/^pending:/,'passage:'))void loadComments().catch(()=>{});
    if(data.type==='presence'){people.replaceChildren();element('h3','Quem está aqui',people);for(const person of data.people)element('p',`${person.name}: ${person.active?'ativo':'ausente'} — ${person.passageId||'consultando'}`,people);for(const claim of data.claims)element('small',`${claim.name} reservou ${claim.passageId} · `,people);}
    if(data.type==='saved')status.textContent='Rascunho salvo no servidor.';
    if(data.type==='save-failed'){status.textContent=data.message;panel.hidden=false;}
    if(data.type==='session-expired'){status.textContent='Sessão expirada. Exporte suas edições locais antes de entrar novamente.';panel.hidden=false;button('Entrar em outra aba',()=>window.open('/login','_blank','noopener'));}
    if(data.type==='disconnected')status.textContent='Conexão interrompida. Salvamentos não confirmados continuam nesta aba.';
    if(data.type==='connected')status.textContent='Conectado ao servidor. Rascunhos e comentários compartilhados.';
    if(data.type==='resync-required'||(data.type==='drafts-change'&&data.clientId!==api.clientId))status.textContent='Há mudanças remotas. Salve ou exporte o trabalho local e use “Carregar estado compartilhado” para vê-las.';
  });
  api.me().then(({user})=>{identity.textContent=user.name+' · '+user.role;if(user.role==='admin')admin();return loadComments();}).catch(error=>{status.textContent=error.message;});
})();
