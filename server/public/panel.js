'use strict';
(() => {
  const api=window.collab;if(!api)return;
  const loginUrl=()=>'/login?returnTo='+encodeURIComponent(location.pathname+location.search);
  const panel=document.createElement('aside');panel.id='collab-panel';panel.setAttribute('aria-label','Colaboração');
  const toggle=document.createElement('button');toggle.id='collab-toggle';toggle.textContent='Equipe e comentários';toggle.onclick=()=>{panel.hidden=!panel.hidden;};
  document.body.append(toggle,panel);panel.hidden=true;
  function element(tag,text,parent=panel){const node=document.createElement(tag);if(['input','textarea','select','form'].includes(tag)){node.autocomplete='off';node.setAttribute('data-1p-ignore','true');node.setAttribute('data-lpignore','true');}if(text!==undefined)node.textContent=text;parent.append(node);return node;}
  function button(text,action,parent=panel){const node=element('button',text,parent);node.type='button';node.onclick=()=>Promise.resolve().then(action).catch(error=>{status.textContent=error.message;});return node;}
  function feedbackButton(text,action,parent){
    const group=element('div',undefined,parent),node=element('button',text,group),message=element('p','',group);
    node.type='button';message.setAttribute('role','status');message.setAttribute('aria-live','polite');
    node.onclick=async()=>{if(node.disabled)return;node.disabled=true;node.textContent='Enviando…';node.setAttribute('aria-busy','true');message.setAttribute('role','status');message.textContent='Enviando…';
      try{message.textContent=await action();}
      catch(error){message.setAttribute('role','alert');message.textContent=error.message;}
      finally{node.disabled=false;node.textContent=text;node.removeAttribute('aria-busy');}
    };return node;
  }
  element('h2','Servidor colaborativo');const status=element('p','Conectando…');status.setAttribute('role','status');
  const identity=element('p',''),selection=element('p',''),people=element('div'),actions=element('div');
  button('Exportar cópia local',()=>api.exportLocal(),actions);
  button('Carregar estado compartilhado',()=>api.reload(),actions);
  button('Sair',()=>api.logout(),actions);
  const help=element('a','Tutorial e documentação ↗',actions);help.href='/help';help.target='_blank';help.rel='noopener';
  feedbackButton('Enviar última versão salva para revisão',async()=>{await api.submit();void loadSubmissions().catch(()=>{});return 'Enviada. A passagem está aguardando revisão; a versão enviada foi preservada.';},actions);
  element('p','Edição sem reservas. Se outra pessoa salvar primeiro, sua cópia local será preservada para comparar com a versão compartilhada.');
  const upstreamBox=element('details');element('summary','Atualizações do corpus e da gramática',upstreamBox);
  const upstreamStatus=element('p','Consultando atualizações…',upstreamBox),upstreamRows=element('div',undefined,upstreamBox);
  let upstreamHeads;
  async function loadUpstream(){
    const data=await api.request('/api/upstream-status');
    if(!data.enabled){upstreamStatus.textContent='Atualizações automáticas não configuradas neste servidor.';return;}
    const states={checking:'Verificando versões disponíveis.',current:'Corpus e gramática atualizados.',waiting:'Atualização aguardando um período sem atividade.',updated:'Corpus e gramática atualizados com backup.',failed:'A atualização não foi concluída. O estado foi preservado para verificação.'};
    upstreamStatus.textContent=(states[data.state]||'Aguardando a primeira verificação.')+` Verificação a cada ${data.intervalMinutes} minutos; atualização após ${data.idleMinutes} minutos sem atividade, com backup antes de alterar arquivos.`;
    if(data.checkedAt)upstreamStatus.textContent+=' Última verificação: '+new Date(data.checkedAt).toLocaleString('pt-BR')+'.';
    upstreamRows.replaceChildren();
    const labels={current:'atualizado',available:'nova versão disponível',dirty:'adiado: há alterações locais',diverged:'adiado: os históricos precisam ser conciliados'};
    for(const repo of data.repositories||[])element('p',repo.name+': '+(labels[repo.state]||'verificando')+(repo.head?' · '+repo.head.slice(0,8):''),upstreamRows);
    const heads=JSON.stringify((data.repositories||[]).map(repo=>[repo.name,repo.head]));
    if(upstreamHeads!==undefined&&heads!==upstreamHeads){
      element('p','Uma nova versão foi instalada. Salve suas edições e carregue o estado compartilhado para usar os dados atualizados.',upstreamRows);
      button('Carregar dados atualizados',()=>api.reload(),upstreamRows);
    }
    if((data.repositories||[]).length&&data.repositories.every(repo=>repo.head))upstreamHeads??=heads;
  }
  button('Atualizar estado das fontes',loadUpstream,upstreamBox);
  void loadUpstream().catch(()=>{upstreamStatus.textContent='Não foi possível consultar as atualizações.';});
  setInterval(()=>void loadUpstream().catch(()=>{}),60_000);
  const comments=element('section');element('h3','Comentários da passagem',comments);const list=element('div',undefined,comments);
  const form=element('form',undefined,comments),label=element('label','Comentário',form),input=element('textarea',undefined,label);input.maxLength=4000;input.required=true;
  const reply=element('input',undefined,form);reply.type='number';reply.min='1';reply.placeholder='ID da discussão para responder (opcional)';reply.setAttribute('aria-label','ID da discussão para responder');
  const send=element('button','Enviar comentário',form);send.type='submit';
  form.onsubmit=async event=>{event.preventDefault();send.disabled=true;try{await api.request('/api/comment',{passageId:api.state().selected,body:input.value,parentId:reply.value?Number(reply.value):null});input.value='';reply.value='';await loadComments();}catch(error){status.textContent=error.message;}finally{send.disabled=false;}};
  const submissionsBox=element('details');element('summary','Contribuições enviadas',submissionsBox);const submissionRows=element('div',undefined,submissionsBox);
  let currentUser;
  async function loadSubmissions(){
    const data=await api.request('/api/submissions');submissionRows.replaceChildren();
    for(const item of data.submissions){const row=element('article',undefined,submissionRows);element('p',`${item.author} · ${item.passageId} · ${{submitted:'Aguardando revisão',ready:'Pronta para incorporar',changes_requested:'Correção solicitada',imported:'Incorporada',merged:'Publicada'}[item.status]||item.status}`,row);
      button('Ver versão enviada',async()=>{const detail=await api.request('/api/submission?id='+encodeURIComponent(item.id));api.download(detail,'studio-submission-'+item.id+'.json');},row);
      if(currentUser?.role==='admin'||currentUser?.role==='reviewer'){
        button('Marcar pronta para revisão local',async()=>{await api.request('/api/submission/review',{id:item.id,snapshotSha256:item.snapshotSha256,event:'ready'});await loadSubmissions();},row);
        button('Pedir correção',async()=>{const note=prompt('Explique a correção solicitada (também deixe um comentário na passagem):');if(note===null)return;await api.request('/api/submission/review',{id:item.id,snapshotSha256:item.snapshotSha256,event:'changes_requested',note});await loadSubmissions();},row);
      }
    }
    if(data.next!==null)element('p','Mostrando as primeiras 100 contribuições. A exportação administrativa contém a seleção completa.',submissionRows);
  }
  button('Atualizar contribuições',loadSubmissions,submissionsBox);
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
  const claudeBox=element('details');element('summary','Claude Code · minha conta',claudeBox);
  element('p','Entre com a sua própria assinatura Claude (Pro, Max, Team ou Enterprise). A entrada acontece no site da Anthropic, no seu navegador: o Studio não vê nem guarda a sua senha ou o seu token. O uso é da sua conta.',claudeBox);
  const claudeState=element('p','Verificando…',claudeBox);claudeState.setAttribute('role','status');
  const claudeStep=element('div',undefined,claudeBox);claudeStep.hidden=true;
  const claudeLink=element('a','Abrir a página de entrada do Claude',claudeStep);
  claudeLink.target='_blank';claudeLink.rel='noopener noreferrer';
  element('p','Entre na página aberta, copie o código exibido no final e cole abaixo.',claudeStep);
  const claudeCode=element('input',undefined,claudeStep);claudeCode.type='text';claudeCode.autocomplete='off';
  claudeCode.placeholder='Código da página de entrada';claudeCode.setAttribute('aria-label','Código de autorização do Claude');
  let claudeOut;
  function claudeShow(status){
    claudeState.textContent=status.loggedIn
      ?'Conectado'+(status.account?' como '+status.account:'')+(status.organization?' · '+status.organization:'')+'. A sessão vale até expirar na Anthropic.'
      :status.authMethod==='unavailable'?'O Claude Code não está disponível neste servidor. Peça à administração.':'Não conectado.';
    if(claudeOut)claudeOut.hidden=!status.loggedIn;
  }
  async function claudeLoad(){claudeShow(await api.request('/api/claude-auth'));}
  button('Entrar com minha conta Claude',async()=>{
    claudeState.textContent='Abrindo a entrada da Anthropic…';
    const started=await api.request('/api/claude-auth/start',{});
    claudeLink.href=started.url;claudeStep.hidden=false;claudeCode.focus();
    claudeState.textContent='Abra a página, entre e cole o código abaixo.';
    window.open(started.url,'_blank','noopener');
  },claudeBox);
  button('Concluir entrada',async()=>{
    try{claudeShow(await api.request('/api/claude-auth/code',{code:claudeCode.value}));claudeStep.hidden=true;}
    finally{claudeCode.value='';}
  },claudeStep);
  claudeOut=button('Sair da minha conta Claude',async()=>{claudeShow(await api.request('/api/claude-auth/logout',{}));},claudeBox);
  claudeOut.hidden=true;
  void claudeLoad().catch(error=>{claudeState.textContent=error.message;});
  const providerBox=element('details');element('summary','IA e minhas credenciais (execução desativada)',providerBox);
  element('p','Codex e Claude continuam desativados. Você pode preparar uma chave de API pessoal ou escolher o financiamento do projeto. Não envie senha, auth.json ou sessão de outra pessoa. As cotas abaixo só serão aplicadas quando a execução isolada for implementada.',providerBox);
  const provider=element('select',undefined,providerBox);provider.setAttribute('aria-label','Provedor de IA');
  for(const value of ['codex','claude']){const option=element('option',value,provider);option.value=value;}
  const funding=element('select',undefined,providerBox);funding.setAttribute('aria-label','Financiamento de IA');
  for(const [value,label] of [['disabled','Desativado'],['owner','Financiado pelo projeto'],['personal','Minha chave de API']]){const option=element('option',label,funding);option.value=value;}
  const apiKey=element('input',undefined,providerBox);apiKey.type='password';apiKey.autocomplete='off';apiKey.placeholder='Nova chave de API (não é exibida novamente)';apiKey.setAttribute('aria-label','Chave de API pessoal');
  const limit=element('input',undefined,providerBox);limit.type='number';limit.min='0';limit.step='1';limit.value='0';limit.setAttribute('aria-label','Limite mensal futuro em centavos de dólar');
  element('small','Limite futuro em centavos de dólar; zero não autoriza gasto. Não altera os limites do provedor.',providerBox);
  const providerStatus=element('p','',providerBox);
  async function providerLoad(){const data=await api.request('/api/providers');const row=data.providers.find(p=>p.provider===provider.value);funding.value=row.funding;limit.value=String(row.monthlyLimitCents);providerStatus.textContent=(row.configured?'Chave pessoal armazenada. ':'Sem chave pessoal. ')+data.message;}
  provider.onchange=()=>void providerLoad().catch(error=>{status.textContent=error.message;});
  button('Salvar preferências de IA',async()=>{try{await api.request('/api/providers',{provider:provider.value,funding:funding.value,monthlyLimitCents:Number(limit.value),apiKey:apiKey.value});await providerLoad();}finally{apiKey.value='';}},providerBox);
  button('Remover minha chave',async()=>{await api.request('/api/providers',{provider:provider.value,funding:'disabled',monthlyLimitCents:0,removeKey:true});apiKey.value='';await providerLoad();},providerBox);
  void providerLoad().catch(()=>{});
  const account=element('details');element('summary','Alterar minha senha',account);
  const old=element('input',undefined,account);old.type='password';old.placeholder='Senha atual';old.autocomplete='off';old.setAttribute('aria-label','Senha atual');
  const next=element('input',undefined,account);next.type='password';next.placeholder='Nova senha (15+ caracteres)';next.autocomplete='off';next.setAttribute('aria-label','Nova senha');
  button('Trocar senha e encerrar sessões',async()=>{if(api.state().failed||api.state().inflight)throw new Error('Exporte as edições locais antes de trocar a senha.');await api.request('/api/password',{currentPassword:old.value,password:next.value});old.value='';next.value='';location.assign(loginUrl());},account);
  function admin(){
    const section=element('details');element('summary','Administração',section);
    const address=element('input',undefined,section);address.type='email';address.placeholder='E-mail do convite';address.setAttribute('aria-label','E-mail do convite');
    const name=element('input',undefined,section);name.placeholder='Nome';name.maxLength=80;name.setAttribute('aria-label','Nome');
    const role=element('select',undefined,section);role.setAttribute('aria-label','Papel');for(const [value,text]of[['contributor','Colaborador'],['reviewer','Revisor'],['admin','Administrador']]){const option=element('option',text,role);option.value=value;}
    feedbackButton('Enviar convite',async()=>{const email=address.value.trim();if(!address.reportValidity()||!email)throw new Error('Informe um e-mail válido para o convite.');await api.request('/api/admin/invite',{email,name:name.value,role:role.value});return 'Convite enviado para '+email+'. Peça à pessoa para conferir a caixa de entrada e o spam.';},section);
    const users=element('div',undefined,section);
    async function loadUsers(){const data=await api.request('/api/admin/users');users.replaceChildren();for(const user of data.users){const row=element('article',undefined,users);element('p',`${user.name} · ${user.email} · ${user.role}${user.disabled?' · desativado':''}`,row);
      const select=element('select',undefined,row);select.setAttribute('aria-label','Papel de '+user.name);for(const value of ['contributor','reviewer','admin']){const option=element('option',value,select);option.value=value;}select.value=user.role;
      const disabled=element('input',undefined,row);disabled.type='checkbox';disabled.checked=user.disabled;disabled.setAttribute('aria-label','Desativar '+user.name);
      button('Salvar conta',async()=>{if(!confirm('Alterar esta conta e encerrar suas sessões?'))return;await api.request('/api/admin/user',{id:user.id,role:select.value,disabled:disabled.checked});await loadUsers();},row);}}
    button('Listar contas',loadUsers,section);
    const report=element('pre',undefined,section);
    button('Relatório de atividade — 7 dias',async()=>{const data=await api.request('/api/admin/report?days=7');report.textContent=JSON.stringify(data,null,2);},section);
    button('Exportar relatório — todo o histórico',async()=>api.download(await api.request('/api/admin/report?days=0'),'studio-usage-report.json'),section);
  }
  element('p','Todos os rascunhos e comentários deste espaço são compartilhados. A telemetria contém categorias e tempos, não o texto. Os dados de pesquisa e cada revisão salva são preservados sem expiração automática. Presença e contagens não calculam pagamentos nem certificam revisão.',panel).className='collab-disclosure';
  window.addEventListener('collab-status',event=>{
    const data=event.detail;
    if(data.type==='submissions-change')void loadSubmissions().catch(()=>{});
    if(data.type==='selection')void loadComments().catch(error=>{status.textContent=error.message;});
    if(data.type==='comments-change'&&data.passageId===api.state().selected?.replace(/^pending:/,'passage:'))void loadComments().catch(()=>{});
    if(data.type==='presence'){people.replaceChildren();element('h3','Quem está aqui',people);for(const person of data.people)element('p',`${person.name}: ${person.active?'ativo':'ausente'} — ${person.passageId||'consultando'}`,people);}
    if(data.type==='saved')status.textContent='Rascunho salvo no servidor.';
    if(data.type==='save-failed'){status.textContent=data.message;panel.hidden=false;}
    if(data.type==='session-expired'){status.textContent='Sessão expirada. Exporte suas edições locais antes de entrar novamente.';panel.hidden=false;button('Entrar em outra aba',()=>window.open(loginUrl(),'_blank','noopener'));}
    if(data.type==='disconnected')status.textContent='Conexão interrompida. Salvamentos não confirmados continuam nesta aba.';
    if(data.type==='connected')status.textContent='Conectado ao servidor. Rascunhos e comentários compartilhados.';
    if(data.type==='resync-required'||(data.type==='drafts-change'&&data.clientId!==api.clientId))status.textContent='Há mudanças remotas. Salve ou exporte o trabalho local e use “Carregar estado compartilhado” para vê-las.';
  });
  api.me().then(({user})=>{currentUser=user;identity.textContent=user.name+' · '+user.role;
    if(user.authMethod==='academia'){account.replaceChildren();element('summary','Minha conta Academia Tupi',account);const link=element('a','Gerenciar senha no Neologismos',account);link.href='https://neo.academiatupi.com/login';link.target='_blank';link.rel='noopener noreferrer';}
    else fetch('/api/auth-options').then(r=>r.json()).then(options=>{if(options.academia)button('Vincular conta Neo (confirme a senha atual acima)',async()=>{const result=await api.request('/api/sso/link',{currentPassword:old.value,returnTo:location.pathname+location.search});old.value='';location.assign(result.url);},account);}).catch(()=>{});
    if(user.role==='admin')admin();return Promise.all([loadComments(),loadSubmissions()]);}).catch(error=>{status.textContent=error.message;});
})();
