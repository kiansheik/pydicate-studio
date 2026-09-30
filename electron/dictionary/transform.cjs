const INDEX_ANCHOR = "first_word: item.f || '',";
const ENTRY_ANCHOR = "entry.classList.add('entry');";
const HISTORY_ANCHOR = 'history.pushState(null, null, newUrl);';
const INIT_ANCHOR = '  init();';

// Installed inside the dictionary closure so exact row identity, rendering and
// search behavior stay owned by the dictionary. This API only changes its view.
const NAVIGATION = `  window.__studioDictionaryNavigate = ({ entryIndex, query }) => {
    if (!dataReady) return null;
    const row = entryIndex === null ? null : jsonData.find(item => item.__studioEntryIndex === entryIndex);
    if (entryIndex !== null && !row) return false;
    searchInput.value = query || (row ? row.first_word : '');
    if (query) performSearch({ updateHistory: false });
    else resultsDiv.replaceChildren();
    if (row) {
      let entry = resultsDiv.querySelector('[data-studio-entry-index="' + entryIndex + '"]');
      if (!entry) {
        renderResults([{ ...row, exact_match: true }], query || row.first_word);
        updateShowMoreLinks();
        updateRetainQueryLinks();
        entry = resultsDiv.querySelector('[data-studio-entry-index="' + entryIndex + '"]');
      }
      entry?.scrollIntoView({ block: 'nearest' });
    }
    return true;
  };
  init().then(() => window.dispatchEvent(new Event('studio-dictionary-loaded')));`;

function replaceOnce(source, marker, replacement) {
  if (source.split(marker).length !== 2)
    throw new Error(
      'O site do dicionário mudou. Não foi possível vincular suas entradas com segurança.',
    );
  return source.replace(marker, replacement);
}

function transformScript(source) {
  source = replaceOnce(source, INDEX_ANCHOR, `__studioEntryIndex: index,\n      ${INDEX_ANCHOR}`);
  source = replaceOnce(
    source,
    ENTRY_ANCHOR,
    `${ENTRY_ANCHOR}\n      if (Number.isSafeInteger(result.__studioEntryIndex) && result.__studioEntryIndex >= 0) entry.dataset.studioEntryIndex = String(result.__studioEntryIndex);`,
  );
  // Parent history owns searches in Studio. An iframe history entry would make
  // browser Back change only the child and leave the visible workspace URL stale.
  source = replaceOnce(
    source,
    HISTORY_ANCHOR,
    "window.dispatchEvent(new CustomEvent('studio-dictionary-query', { detail: query }));",
  );
  return replaceOnce(source, INIT_ANCHOR, NAVIGATION);
}

function transformHtml(
  source,
  { datasetFingerprint, bridgeBase = '/__studio_dictionary', parentOrigin = 'studio://app' },
) {
  if (!/^sha256:[a-f0-9]{64}$/.test(datasetFingerprint))
    throw new Error('Identidade do dicionário inválida.');
  if (!/^\/[a-zA-Z0-9/_-]+$/.test(bridgeBase)) throw new Error('Caminho do dicionário inválido.');
  if (!validParentOrigin(parentOrigin)) throw new Error('Origem do aplicativo inválida.');
  // Network-loaded scripts may arrive after the HTML is interactive. The site's
  // init() enables these controls only after its searchable data is ready.
  source = source.replace(
    /<(?:input|button)\b[^>]*\bid=["'](?:searchInput|searchButton)["'][^>]*>/gi,
    (tag) => (/\bdisabled\b/i.test(tag) ? tag : tag.replace(/>$/, ' disabled>')),
  );
  source = source.replace(
    /<script\b[^>]*src=["']https?:\/\/www\.googletagmanager\.com\/[^"']+["'][^>]*>\s*<\/script>/gi,
    '',
  );
  source = source.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, (script) =>
    /\bgtag\s*\(|window\.dataLayer\s*=/.test(script) ? '' : script,
  );
  return replaceOnce(
    source,
    '</head>',
    `<link rel="stylesheet" href="${bridgeBase}/bridge.css">\n<script defer src="${bridgeBase}/bridge.js" data-dataset-fingerprint="${datasetFingerprint}" data-parent-origin="${parentOrigin}"></script>\n</head>`,
  );
}

function transformStyles(source) {
  return source.replace(/@import\s+(?:url\(\s*)?["']https?:\/\/[^"']+["']\s*\)?\s*;/gi, '');
}

module.exports = { transformHtml, transformScript, transformStyles };

function validParentOrigin(value) {
  if (value === 'studio://app') return true;
  try {
    const url = new URL(value);
    return (
      url.origin === value &&
      !url.username &&
      !url.password &&
      (url.protocol === 'https:' ||
        (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))
    );
  } catch {
    return false;
  }
}
module.exports.validParentOrigin = validParentOrigin;
