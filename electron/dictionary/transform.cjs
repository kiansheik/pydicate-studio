const INDEX_ANCHOR = "first_word: item.f || '',";
const ENTRY_ANCHOR = "entry.classList.add('entry');";

function replaceOnce(source, marker, replacement) {
  if (source.split(marker).length !== 2)
    throw new Error(
      'O site do dicionário mudou. Não foi possível vincular suas entradas com segurança.',
    );
  return source.replace(marker, replacement);
}

function transformScript(source) {
  source = replaceOnce(source, INDEX_ANCHOR, `__studioEntryIndex: index,\n      ${INDEX_ANCHOR}`);
  return replaceOnce(
    source,
    ENTRY_ANCHOR,
    `${ENTRY_ANCHOR}\n      if (Number.isSafeInteger(result.__studioEntryIndex) && result.__studioEntryIndex >= 0) entry.dataset.studioEntryIndex = String(result.__studioEntryIndex);`,
  );
}

function transformHtml(
  source,
  { datasetFingerprint, bridgeBase = '/__studio_dictionary', parentOrigin = 'studio://app' },
) {
  if (!/^sha256:[a-f0-9]{64}$/.test(datasetFingerprint))
    throw new Error('Identidade do dicionário inválida.');
  if (!/^\/[a-zA-Z0-9/_-]+$/.test(bridgeBase)) throw new Error('Caminho do dicionário inválido.');
  if (!/^(studio:\/\/app|http:\/\/(127\.0\.0\.1|localhost):\d+)$/.test(parentOrigin))
    throw new Error('Origem do aplicativo inválida.');
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
