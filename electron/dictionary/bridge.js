(() => {
  'use strict';
  const bootstrap = document.currentScript;
  const datasetFingerprint = bootstrap?.dataset.datasetFingerprint;
  const parentOrigin = bootstrap?.dataset.parentOrigin;
  if (!/^sha256:[a-f0-9]{64}$/.test(datasetFingerprint || '') || !parentOrigin) return;
  const results = document.getElementById('results');
  if (!results) return;

  const note = document.createElement('p');
  note.className = 'studio-dictionary-note';
  note.textContent = 'Clique no verbete ou em + Árvore para adicionar essa entrada à passagem.';
  results.before(note);
  const status = document.createElement('p');
  status.className = 'studio-dictionary-status';
  status.setAttribute('role', 'status');
  note.after(status);

  function entryIndex(entry) {
    const value = entry?.dataset.studioEntryIndex;
    if (!/^(0|[1-9]\d*)$/.test(value || '')) return null;
    const number = Number(value);
    return Number.isSafeInteger(number) ? number : null;
  }
  function select(entry) {
    const index = entryIndex(entry);
    if (index === null) {
      status.textContent =
        'Esta entrada ainda não tem um vínculo verificável com o motor. Continue consultando sua definição.';
      return;
    }
    window.parent.postMessage(
      { type: 'studio-dictionary-select', version: 1, entryIndex: index, datasetFingerprint },
      parentOrigin,
    );
    status.textContent = 'Entrada selecionada para a árvore.';
  }
  function decorate() {
    for (const entry of results.querySelectorAll('.entry')) {
      if (entry.querySelector(':scope > .studio-entry-actions')) continue;
      const headword = entry.querySelector(':scope > .preview > a.search-link');
      const name = headword?.textContent?.trim() || 'esta entrada';
      const actions = document.createElement('div');
      actions.className = 'studio-entry-actions';
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'studio-add-entry';
      button.textContent = '+ Árvore';
      button.setAttribute('aria-label', `Adicionar ${name} à árvore`);
      if (entryIndex(entry) === null) {
        button.disabled = true;
        button.title = 'Esta entrada não tem vínculo verificável com o motor.';
        const explanation = document.createElement('small');
        explanation.textContent =
          'Consulta disponível; criação de peça ainda indisponível para esta entrada.';
        actions.append(explanation);
      } else if (headword) {
        headword.title = `Adicionar esta entrada de ${name} à árvore`;
      }
      button.addEventListener('click', () => select(entry));
      actions.prepend(button);
      entry.append(actions);
    }
  }
  new MutationObserver(decorate).observe(results, { childList: true });
  decorate();

  let overlay = null;
  let returnFocus = null;
  function closeSource() {
    overlay?.remove();
    overlay = null;
    returnFocus?.focus();
  }
  function openSource(url, anchor) {
    closeSource();
    returnFocus = anchor;
    overlay = document.createElement('div');
    overlay.className = 'studio-source-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Fonte citada');
    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = 'Voltar ao dicionário';
    close.addEventListener('click', closeSource);
    const frame = document.createElement('iframe');
    frame.title = 'Página da fonte citada';
    frame.setAttribute('sandbox', 'allow-scripts allow-same-origin');
    frame.src = url.href;
    frame.addEventListener('load', () => {
      // Keep the original scan viewer, while its optional remote transcription
      // links cannot navigate away from the local authoring workspace.
      const doc = frame.contentDocument;
      doc?.addEventListener(
        'click',
        (event) => {
          const link = event.target?.closest?.('a[href]');
          if (link && new URL(link.href).origin !== window.location.origin) {
            event.preventDefault();
            link.title = 'Esta transcrição externa não está incluída na consulta local.';
          }
        },
        true,
      );
      doc?.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') closeSource();
      });
    });
    overlay.append(close, frame);
    document.body.append(overlay);
    close.focus();
  }
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && overlay) closeSource();
  });
  document.addEventListener(
    'click',
    (event) => {
      const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (!anchor) return;
      const entry = anchor.closest('.entry');
      if (
        entry &&
        anchor === entry.querySelector(':scope > .preview > a.search-link') &&
        entryIndex(entry) !== null
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
        select(entry);
        return;
      }
      const url = new URL(anchor.href, window.location.href);
      if (
        url.origin === window.location.origin &&
        url.pathname === '/nhe-enga/docs/primary_sources/'
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
        openSource(url, anchor);
      } else if (
        url.origin !== window.location.origin ||
        (!url.pathname.startsWith('/nhe-enga/docs/primary_sources/') &&
          url.pathname !== window.location.pathname)
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
        status.textContent = 'Esta seção não está incluída no dicionário local do Studio.';
      }
    },
    true,
  );
  for (const link of document.querySelectorAll('.content > a[href]')) {
    link.hidden = true;
    if (link.nextElementSibling?.tagName === 'BR') link.nextElementSibling.hidden = true;
  }
  window.parent.postMessage(
    { type: 'studio-dictionary-ready', version: 1, datasetFingerprint },
    parentOrigin,
  );
})();
