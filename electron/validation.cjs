'use strict';

const LIMITS = Object.freeze({
  draftBytes: 4 * 1024 * 1024,
  text: 100_000,
  projectBytes: 16 * 1024 * 1024,
});

function fail(field) {
  throw new Error(`Dados inválidos em ${field}.`);
}

function object(value, field, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(field);
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) fail(field);
  if (keys && Object.keys(value).some((key) => !keys.includes(key))) fail(field);
  return value;
}

function string(value, field, max = LIMITS.text, nonempty = false) {
  if (typeof value !== 'string' || value.length > max || (nonempty && !value.length)) fail(field);
  return value;
}

function translations(value) {
  object(value, 'traduções por idioma', ['pt', 'en']);
  for (const text of Object.values(value)) string(text, 'tradução');
}

function id(value, field = 'identificador') {
  return string(value, field, 256, true);
}

function boolean(value, field) {
  if (typeof value !== 'boolean') fail(field);
}

function oneOf(value, values, field) {
  if (!values.includes(value)) fail(field);
}

function analysis(value) {
  object(value, 'análise', [
    'kind',
    'predicate',
    'subject',
    'object',
    'hiddenSubject',
    'mood',
    'negated',
  ]);
  if (
    value.kind !== 'imperative' ||
    value.predicate !== 'apiti' ||
    value.subject !== 'nde' ||
    value.object !== 'moro'
  )
    fail('análise');
  boolean(value.hiddenSubject, 'participante entendido');
  boolean(value.negated, 'negação');
  oneOf(value.mood, ['imperative', 'indicative'], 'modo');
  return value;
}

function renderRequest(value) {
  object(value, 'pedido de realização', ['revisionId', 'engineFingerprint', 'analysis']);
  id(value.revisionId, 'revisão');
  id(value.engineFingerprint, 'versão do motor');
  analysis(value.analysis);
  return value;
}

function canvas(value) {
  object(value, 'área de trabalho', ['fragments', 'positions', 'layout']);
  if (value.layout !== undefined && !['bottom-up', 'horizontal'].includes(value.layout))
    fail('orientação da área de trabalho');
  if (!Array.isArray(value.fragments) || value.fragments.length > 128)
    fail('trechos da área de trabalho');
  object(value.positions, 'posições da área de trabalho');
  const identifiers = new Set();
  let total = 0;
  for (const fragment of value.fragments) {
    object(fragment, 'trecho da área de trabalho', ['id', 'raw', 'x', 'y']);
    if (
      typeof fragment.id !== 'string' ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(fragment.id) ||
      ['main', '__proto__', 'prototype', 'constructor'].includes(fragment.id) ||
      identifiers.has(fragment.id)
    )
      fail('identificador do trecho');
    identifiers.add(fragment.id);
    string(fragment.raw, 'código do trecho');
    total += fragment.raw.length;
    canvasPoint({ x: fragment.x, y: fragment.y });
  }
  if (total > 1_000_000) fail('texto da área de trabalho');
  const positions = Object.entries(value.positions);
  if (positions.length > 4096) fail('quantidade de posições');
  for (const [key, value] of positions) {
    const separator = key.indexOf(':');
    const container = key.slice(0, separator);
    const node = key.slice(separator + 1);
    if (
      separator < 1 ||
      key.length > 4096 ||
      (container !== 'main' && !identifiers.has(container)) ||
      !(node === 'root' || node.startsWith('root/')) ||
      /[\s\u0000-\u001f]/u.test(node)
    )
      fail('identificador da posição');
    canvasPoint(value);
  }
  return value;
}

function canvasPoint(value) {
  object(value, 'posição', ['x', 'y']);
  for (const axis of ['x', 'y'])
    if (
      typeof value[axis] !== 'number' ||
      !Number.isFinite(value[axis]) ||
      Math.abs(value[axis]) > 1_000_000
    )
      fail('coordenada');
}

function envelope(value) {
  object(value, 'rascunhos', ['version', 'projectId', 'drafts', 'storageRevision']);
  if (
    value.storageRevision !== undefined &&
    (!Number.isSafeInteger(value.storageRevision) || value.storageRevision < 0)
  )
    fail('revisão de armazenamento');
  if (value.version !== 1) fail('versão dos rascunhos');
  id(value.projectId, 'projeto');
  object(value.drafts, 'rascunhos');
  const entries = Object.entries(value.drafts);
  if (entries.length > 5000) fail('quantidade de rascunhos');
  for (const [key, draft] of entries) {
    if (['__proto__', 'constructor', 'prototype'].includes(key)) fail('identificador do rascunho');
    object(draft, 'rascunho', [
      'passageId',
      'revisionId',
      'sourceFingerprint',
      'diplomatic',
      'normalized',
      'translation',
      'translations',
      'notes',
      'analysis',
      'raw',
      'locators',
      'updatedAt',
      'workflow',
      'canvas',
      'pending',
      'aiInput',
      'aiAcceptances',
    ]);
    if (draft.aiInput !== undefined) {
      object(draft.aiInput, 'orientação de análise', [
        'tentativeReading',
        'meaning',
        'constraints',
      ]);
      for (const key of ['tentativeReading', 'meaning', 'constraints'])
        string(draft.aiInput[key], 'orientação de análise');
    }
    if (draft.aiAcceptances !== undefined) {
      if (!Array.isArray(draft.aiAcceptances) || draft.aiAcceptances.length > 1000)
        fail('histórico de aceitação');
      for (const receipt of draft.aiAcceptances) {
        const keys = [
          'operationId',
          'jobId',
          'candidateId',
          'candidateRevision',
          'baseRevisionId',
          'revisionId',
          'at',
        ];
        object(receipt, 'aceitação', [...keys, 'revalidation']);
        keys.forEach((key) => string(receipt[key], key, 256, true));
        if (!Number.isFinite(Date.parse(receipt.at))) fail('data de aceitação');
        if (receipt.revalidation !== undefined) {
          const check = receipt.revalidation;
          object(check, 'verificação local da proposta', [
            'engineFingerprint',
            'expressionFingerprint',
            'sourceFingerprint',
            'at',
            'status',
            'surface',
            'annotated',
            'changedSinceProposal',
            'error',
          ]);
          for (const key of ['engineFingerprint', 'expressionFingerprint', 'at'])
            string(check[key], key, 256, true);
          if (!Number.isFinite(Date.parse(check.at))) fail('data da verificação local');
          if (check.sourceFingerprint !== undefined)
            string(check.sourceFingerprint, 'fonte', 256, true);
          oneOf(check.status, ['complete', 'partial', 'failed'], 'resultado da verificação local');
          for (const key of ['surface', 'annotated'])
            if (check[key] !== undefined) string(check[key], key);
          if (check.changedSinceProposal !== undefined)
            boolean(check.changedSinceProposal, 'mudança na realização');
          if (check.error !== undefined) {
            object(check.error, 'erro da verificação local', ['code', 'message']);
            string(check.error.code, 'código do erro', 256, true);
            string(check.error.message, 'mensagem do erro', 4000);
          }
        }
      }
    }
    if (draft.translations !== undefined) translations(draft.translations);
    if (draft.raw !== undefined) string(draft.raw, 'código');
    if (draft.canvas !== undefined) canvas(draft.canvas);
    if (draft.pending !== undefined) {
      object(draft.pending, 'contexto da nova passagem', [
        'sourceId',
        'previousPassageId',
        'beforePassageId',
        'ordinal',
      ]);
      if (!key.startsWith('pending:') || !/^[a-zA-Z0-9_-]{1,200}$/.test(draft.pending.sourceId))
        fail('fonte da nova passagem');
      if (typeof draft.pending.sourceId !== 'string') fail('fonte da nova passagem');
      if (!Number.isSafeInteger(draft.pending.ordinal) || draft.pending.ordinal < 1)
        fail('ordem da nova passagem');
      if (draft.pending.beforePassageId !== undefined && draft.pending.beforePassageId !== null)
        string(draft.pending.beforePassageId, 'passagem seguinte', 200, true);
      if (draft.pending.previousPassageId !== undefined)
        string(draft.pending.previousPassageId, 'passagem anterior', 200, true);
    }
    if (draft.workflow !== undefined) {
      object(draft.workflow, 'etapa', ['stage', 'updatedAt']);
      oneOf(draft.workflow.stage, ['analysis', 'review', 'complete'], 'etapa');
      string(draft.workflow.updatedAt, 'data da etapa', 40, true);
      if (!Number.isFinite(Date.parse(draft.workflow.updatedAt))) fail('data da etapa');
    }
    if (draft.locators !== undefined) {
      object(draft.locators, 'localização', [
        'printedPage',
        'folio',
        'line',
        'section',
        'subsection',
      ]);
      Object.values(draft.locators).forEach((value) => string(value, 'localização', 1000));
    }
    id(draft.passageId, 'passagem');
    if (key !== draft.passageId) fail('passagem do rascunho');
    id(draft.revisionId, 'revisão');
    id(draft.sourceFingerprint, 'versão da fonte');
    for (const field of ['diplomatic', 'normalized', 'translation', 'notes'])
      string(draft[field], field);
    string(draft.updatedAt, 'data do rascunho', 40, true);
    if (!Number.isFinite(Date.parse(draft.updatedAt))) fail('data do rascunho');
    if (draft.analysis !== null) analysis(draft.analysis);
  }
  if (Buffer.byteLength(JSON.stringify(value), 'utf8') > LIMITS.draftBytes)
    fail('tamanho dos rascunhos');
  return value;
}

function project(value) {
  object(value, 'projeto');
  id(value.id, 'projeto');
  string(value.name, 'nome do projeto', 1000, true);
  oneOf(value.mode, ['example', 'local'], 'tipo de projeto');
  id(value.engineFingerprint, 'versão do motor');
  if (!Array.isArray(value.diagnostics) || value.diagnostics.length > 1000) fail('diagnóstico');
  value.diagnostics.forEach((entry) => string(entry, 'diagnóstico'));
  if (!Array.isArray(value.repositories) || value.repositories.length > 10) fail('repositórios');
  for (const repo of value.repositories) {
    object(repo, 'repositório');
    for (const field of ['name', 'path', 'revision', 'branch', 'fingerprint'])
      string(repo[field], field, 4096);
    boolean(repo.dirty, 'alterações locais');
  }
  if (!Array.isArray(value.passages) || value.passages.length < 1 || value.passages.length > 20_000)
    fail('passagens');
  const ids = new Set();
  for (const passage of value.passages) {
    object(passage, 'passagem');
    id(passage.id, 'passagem');
    if (ids.has(passage.id)) fail('passagem repetida');
    ids.add(passage.id);
    for (const field of ['legacyId', 'sourceId', 'sourceFingerprint']) id(passage[field], field);
    for (const field of [
      'title',
      'sourceExpression',
      'diplomatic',
      'normalized',
      'translation',
      'notes',
    ])
      string(passage[field], field);
    if (passage.translations !== undefined) translations(passage.translations);
    if (!Number.isSafeInteger(passage.ordinal) || passage.ordinal < 1) fail('ordem da passagem');
    if (passage.acceptedReference !== null) string(passage.acceptedReference, 'referência');
    oneOf(passage.referenceProvenance, ['legacy', 'none', 'example'], 'origem da referência');
    oneOf(passage.status, ['untranscribed', 'analysis', 'review', 'approved', 'changed'], 'estado');
    object(passage.witness, 'testemunho');
    for (const field of ['title', 'year']) string(passage.witness[field], field, 1000);
    if (passage.witness.printedPage !== null)
      string(passage.witness.printedPage, 'página impressa', 1000);
    if (
      passage.witness.pdfPage !== null &&
      (!Number.isSafeInteger(passage.witness.pdfPage) || passage.witness.pdfPage < 0)
    )
      fail('página do PDF');
    const region = passage.witness.region;
    if (
      region !== null &&
      (!Array.isArray(region) ||
        region.length !== 4 ||
        region.some((coordinate) => !Number.isFinite(coordinate)))
    )
      fail('região da página');
    if (passage.analysis !== null) analysis(passage.analysis);
  }
  return value;
}

function renderResult(value) {
  object(value, 'realização');
  id(value.revisionId, 'revisão');
  id(value.engineFingerprint, 'versão do motor');
  for (const field of ['expression', 'surface', 'annotated']) string(value[field], field);
  oneOf(value.origin, ['engine', 'snapshot'], 'origem da realização');
  if (!Array.isArray(value.morphemes) || value.morphemes.length > 1000) fail('morfemas');
  for (const morpheme of value.morphemes) {
    object(morpheme, 'morfema');
    for (const field of ['text', 'tag', 'nodeId', 'explanation']) string(morpheme[field], field);
  }
  return value;
}

module.exports = { LIMITS, id, analysis, renderRequest, envelope, project, renderResult, canvas };
