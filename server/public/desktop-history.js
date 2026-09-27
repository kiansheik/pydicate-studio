'use strict';
(() => {
  const api = window.collab;
  if (!api) return;
  const labels = {
    complete: 'Concluída',
    analysis: 'Em análise',
    review: 'Em revisão',
    queued: 'Na fila quando a cópia foi salva',
    running: 'Em execução quando a cópia foi salva',
    cancelling: 'Cancelamento solicitado na cópia',
    blocked: 'Interrompida',
    failed: 'Falhou',
    cancelled: 'Cancelada',
    'ready-for-review': 'Pronta para revisão',
    'needs-input': 'Aguardava resposta',
  };
  function element(tag, text, parent) {
    const node = document.createElement(tag);
    if (text !== undefined && text !== null) node.textContent = String(text);
    parent?.append(node);
    return node;
  }
  function textSection(parent, title, value, code = false) {
    if (value === undefined || value === null || value === '') return;
    const section = element('section', undefined, parent);
    element('h3', title, section);
    const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
    element(code ? 'pre' : 'p', text, section);
  }
  function fileURL(entry) {
    return (
      '/api/desktop-history/file?' +
      new URLSearchParams({ snapshot: entry.snapshot, path: entry.path })
    );
  }
  function describe(parent, entry, value) {
    if (entry.kind === 'image') {
      const image = element('img', undefined, parent);
      image.src = fileURL(entry);
      image.alt = 'Imagem preservada no histórico de análise';
      return;
    }
    if (typeof value === 'string') {
      textSection(parent, 'Conteúdo preservado', value, true);
      return;
    }
    if (!value || typeof value !== 'object') return;
    if (value.browserKey) {
      textSection(parent, 'Origem no desktop', value.origin);
      if (entry.kind === 'pdf-buffer') {
        const draft = value.value;
        if (draft?.view)
          textSection(parent, 'Página física do PDF', String(draft.view.pageIndex + 1));
        if (Array.isArray(draft?.regions)) {
          textSection(parent, 'Regiões preservadas', draft.regions.length + ' região(ões)');
          for (const region of draft.regions)
            textSection(
              parent,
              'Página ' + (region.pageIndex + 1),
              'Retângulo no PDF: ' + region.rect?.join(', '),
            );
        }
      } else textSection(parent, 'Valor preservado', value.value, true);
      return;
    }
    if (value.format === 'pydicate-browser-storage') {
      for (const origin of value.origins || [])
        textSection(
          parent,
          origin.origin,
          Object.keys(origin.entries || {}).length + ' registro(s) local(is) preservado(s).',
        );
      return;
    }
    const input = value.input || value.inputContext || value.context || {};
    if (entry.revisionNumber) element('p', 'Revisão ' + entry.revisionNumber, parent);
    const status = value.workflow?.stage || value.status;
    if (status) element('p', 'Estado na cópia: ' + (labels[status] || status), parent);
    if (value.provider || input.provider)
      element(
        'p',
        'Provedor registrado: ' +
          (value.provider || input.provider) +
          (value.model || input.model ? ' · ' + (value.model || input.model) : ''),
        parent,
      );
    textSection(parent, 'Transcrição diplomática', value.diplomatic ?? input.diplomatic);
    textSection(parent, 'Leitura revisada', value.normalized ?? input.reviewedTarget);
    textSection(
      parent,
      'Grafia provável',
      value.aiInput?.tentativeReading ?? input.tentativeReading,
    );
    textSection(parent, 'Significado provável', value.aiInput?.meaning ?? input.meaning);
    textSection(parent, 'Solicitação', input.description || value.description);
    if (Array.isArray(value.turns)) {
      const conversation = element('section', undefined, parent);
      element('h3', 'Conversa preservada', conversation);
      for (const turn of value.turns) {
        const article = element('article', undefined, conversation);
        element(
          'strong',
          turn.role === 'assistant'
            ? 'Assistente'
            : turn.role === 'user'
              ? 'Pessoa autora'
              : turn.role || 'Mensagem',
          article,
        );
        element('p', turn.text || turn.content || '', article);
        if (turn.at) element('small', new Date(turn.at).toLocaleString('pt-BR'), article);
      }
    }
    textSection(parent, 'Mensagem ainda não enviada', value.composer);
    textSection(
      parent,
      'Resposta preservada',
      value.summary || value.text || value.suggestion?.explanation,
    );
    textSection(
      parent,
      'Tradução sem idioma informado',
      typeof value.translation === 'string'
        ? value.translation
        : value.translation?.text || value.suggestion?.translation,
    );
    textSection(parent, 'Tradução em português', value.translations?.pt);
    textSection(parent, 'Tradução em inglês', value.translations?.en);
    textSection(
      parent,
      'Expressão Pydicate',
      value.raw ?? value.expression ?? value.suggestion?.expression ?? value.evaluation?.expression,
      true,
    );
    textSection(parent, 'Justificativa', value.rationale);
    textSection(parent, 'Resultado registrado', value.evaluation?.surface || value.surface);
    textSection(parent, 'Resultado anotado', value.evaluation?.annotated, true);
    textSection(parent, 'Notas', value.notes || value.fields?.note);
    textSection(parent, 'Interpretação', value.fields?.meaning);
    textSection(parent, 'Observações gramaticais', value.fields?.grammar);
    textSection(
      parent,
      'Incertezas',
      value.uncertainties?.length ? value.uncertainties : undefined,
    );
    textSection(parent, 'Diagnóstico registrado', value.error?.message || value.error);
    if (value.canvas?.fragments?.length)
      for (const [index, fragment] of value.canvas.fragments.entries())
        textSection(parent, 'Peça solta ' + (index + 1), fragment.raw, true);
    if (Array.isArray(value.history) && value.fields) {
      const versions = element('details', undefined, parent);
      element('summary', `${value.history.length} revisão(ões) da nota`, versions);
      for (const revision of value.history) {
        const row = element('article', undefined, versions);
        element(
          'strong',
          'Revisão ' +
            revision.version +
            (revision.savedAt ? ' · ' + new Date(revision.savedAt).toLocaleString('pt-BR') : ''),
          row,
        );
        textSection(row, 'Interpretação', revision.fields?.meaning);
        textSection(row, 'Gramática', revision.fields?.grammar);
        textSection(row, 'Nota', revision.fields?.note);
      }
    }
  }
  function open() {
    const dialog = element('dialog', undefined, document.body);
    dialog.className = 'desktop-history';
    dialog.setAttribute('aria-label', 'Histórico do desktop');
    const header = element('header', undefined, dialog);
    element('h2', 'Histórico do desktop', header);
    const close = element('button', 'Fechar', header);
    close.type = 'button';
    close.onclick = () => dialog.close();
    element(
      'p',
      'Cópias preservadas de rascunhos, conversas, propostas e notas. A consulta não retoma tarefas de IA nem altera a aprovação das passagens.',
      dialog,
    );
    const filters = element('div', undefined, dialog);
    filters.className = 'desktop-history-filters';
    const scopeLabel = element('label', 'Passagens ', filters);
    const scope = element('select', undefined, scopeLabel);
    scope.setAttribute('aria-label', 'Passagens do histórico');
    for (const [id, title] of [
      ['current', 'Passagem aberta'],
      ['all', 'Todas, incluindo vínculos não resolvidos'],
    ]) {
      const option = element('option', title, scope);
      option.value = id;
    }
    if (!api.state().selected) scope.value = 'all';
    const kindLabel = element('label', 'Conteúdo ', filters);
    const kind = element('select', undefined, kindLabel);
    kind.setAttribute('aria-label', 'Conteúdo do histórico');
    for (const [id, title] of [
      ['', 'Tudo'],
      ['draft', 'Rascunhos'],
      ['conversation', 'Conversas'],
      ['job', 'Análises assistidas'],
      ['candidate', 'Propostas'],
      ['candidate-revision', 'Revisões das propostas'],
      ['decision', 'Decisões registradas'],
      ['legacy-ai', 'Respostas anteriores de IA'],
      ['lexical-note', 'Notas de interpretação'],
      ['image', 'Imagens'],
      ['grammar', 'Reparos da gramática'],
      ['usage', 'Atividade'],
      ['parser-lab', 'Laboratório de análise'],
      ['preferences', 'Preferências'],
      ['pdf-buffer', 'Rascunhos de regiões do PDF'],
      ['lexical-buffer', 'Notas ainda não salvas'],
      ['learning', 'Prática salva'],
      ['retry', 'Tentativas anteriores de envio'],
    ]) {
      const option = element('option', title, kind);
      option.value = id;
    }
    const status = element('p', '', dialog);
    status.setAttribute('role', 'status');
    const panes = element('div', undefined, dialog);
    panes.className = 'desktop-history-panes';
    const list = element('nav', undefined, panes);
    list.setAttribute('aria-label', 'Registros preservados');
    const detail = element('article', 'Selecione um registro para consultar.', panes);
    detail.className = 'desktop-history-detail';
    const more = element('button', 'Carregar mais registros', list);
    more.hidden = true;
    let cursor = null,
      generation = 0,
      detailGeneration = 0;
    async function show(entry) {
      const request = ++detailGeneration;
      detail.replaceChildren();
      element('p', 'Carregando registro…', detail);
      try {
        const params = new URLSearchParams({ snapshot: entry.snapshot, path: entry.path });
        if (entry.section) {
          params.set('section', entry.section);
          params.set('recordId', entry.recordId);
        }
        const result = await api.request('/api/desktop-history/item?' + params);
        if (request !== detailGeneration || !dialog.isConnected) return;
        detail.replaceChildren();
        element('h2', result.entry.title, detail);
        if (result.entry.label) element('p', result.entry.label, detail);
        if (result.entry.originalPassageId)
          element('small', 'Identidade original: ' + result.entry.originalPassageId, detail);
        describe(detail, result.entry, result.data);
        if (
          result.browserRestore &&
          window.desktopHistoryStorage &&
          (result.data?.format === 'pydicate-browser-storage' || entry.kind === 'pdf-buffer')
        ) {
          const restore = element(
            'button',
            entry.kind === 'pdf-buffer'
              ? 'Restaurar estas regiões neste navegador'
              : 'Restaurar preferências e regiões neste navegador',
            detail,
          );
          restore.type = 'button';
          element(
            'p',
            'Preenche somente dados ausentes neste navegador. As regiões são conferidas com o PDF online. Tentativas de envio ficam apenas no histórico.',
            detail,
          );
          const feedback = element('p', '', detail);
          feedback.setAttribute('role', 'status');
          restore.onclick = async () => {
            restore.disabled = true;
            feedback.textContent = 'Conferindo dados e restaurando…';
            try {
              const data =
                result.data?.format === 'pydicate-browser-storage'
                  ? result.data
                  : {
                      format: 'pydicate-browser-storage',
                      version: 1,
                      origins: [
                        {
                          origin: result.data.origin,
                          entries: { [result.data.browserKey]: result.data.serialized },
                        },
                      ],
                    };
              const restored = await window.desktopHistoryStorage.restore({
                data,
                context: result.browserRestore,
                evidenceStatus: (params) => window.studio.invoke('evidence_status', params),
              });
              feedback.textContent = `${restored.imported} restaurado(s), ${restored.unchanged} já presente(s), ${restored.conflicts} conflito(s), ${restored.archived} mantido(s) apenas no histórico. Abra a passagem novamente ou recarregue após salvar suas edições abertas.`;
              if (restored.issues.length) {
                const issues = element('details', undefined, detail);
                element('summary', 'Dados preservados sem substituir edições', issues);
                for (const issue of restored.issues)
                  element('p', issue.key.slice(0, 150) + ': ' + issue.reason, issues);
              }
            } catch (error) {
              feedback.textContent = error.message;
            } finally {
              restore.disabled = false;
            }
          };
        }
        const raw = element('details', undefined, detail);
        element('summary', 'Registro completo e proveniência', raw);
        element('pre', JSON.stringify(result.data, null, 2), raw);
        const download = element('a', 'Baixar arquivo original completo', detail);
        download.href = fileURL(entry);
        download.download = entry.path.split('/').at(-1);
        if (
          result.relatedFiles?.length &&
          ['job', 'candidate', 'candidate-revision'].includes(entry.kind)
        ) {
          const related = element('details', undefined, detail);
          element('summary', 'Imagens e reparos preservados nesta cópia', related);
          for (const file of result.relatedFiles) {
            const link = element('a', file.path.split('/').at(-1), related);
            link.href = fileURL({ ...file, snapshot: entry.snapshot });
            link.target = '_blank';
            link.rel = 'noopener';
          }
        }
      } catch (error) {
        if (request === detailGeneration) detail.replaceChildren(element('p', error.message));
      }
    }
    async function load(append = false) {
      const request = ++generation;
      status.textContent = 'Consultando cópias preservadas…';
      more.disabled = true;
      if (!append) {
        list.replaceChildren();
        list.append(more);
        cursor = null;
      }
      const params = new URLSearchParams({ limit: '50', cursor: String(append ? cursor || 0 : 0) });
      if (scope.value === 'current' && api.state().selected)
        params.set('passageId', api.state().selected);
      if (kind.value) params.set('kind', kind.value);
      try {
        const result = await api.request('/api/desktop-history?' + params);
        if (request !== generation || !dialog.isConnected) return;
        status.textContent = `${result.total} registro(s) · ${result.archives.length} cópia(s) preservada(s).`;
        if (!result.total)
          status.textContent +=
            scope.value === 'current'
              ? ' Escolha todas as passagens para consultar vínculos históricos não resolvidos.'
              : ' Nenhuma cópia importada disponível.';
        for (const entry of result.entries) {
          const row = element('button');
          row.type = 'button';
          row.className = 'desktop-history-record';
          element('strong', entry.title, row);
          if (entry.label) element('span', entry.label, row);
          element(
            'small',
            [
              entry.sourceId,
              entry.ordinal ? 'passagem ' + entry.ordinal : '',
              entry.revisionNumber ? 'revisão ' + entry.revisionNumber : '',
              entry.status ? labels[entry.status] || entry.status : '',
              entry.originalPassageId && !entry.passageId ? 'vínculo não resolvido' : '',
            ]
              .filter(Boolean)
              .join(' · '),
            row,
          );
          row.onclick = () => void show(entry);
          list.insertBefore(row, more);
        }
        cursor = result.nextCursor;
        more.hidden = cursor === null;
      } catch (error) {
        if (request === generation) status.textContent = error.message;
      } finally {
        if (request === generation) more.disabled = false;
      }
    }
    more.onclick = () => void load(true);
    scope.onchange = kind.onchange = () => void load();
    dialog.addEventListener('close', () => {
      generation++;
      detailGeneration++;
      dialog.remove();
    });
    dialog.showModal();
    void load();
  }
  api
    .me()
    .then(({ user }) => {
      if (user.role !== 'admin') return;
      const host = document.getElementById('collab-panel');
      if (!host) return;
      const button = element('button', 'Histórico do desktop', host);
      button.type = 'button';
      button.onclick = open;
    })
    .catch(() => {});
})();
