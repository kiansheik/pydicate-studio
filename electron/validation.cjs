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

function envelope(value) {
  object(value, 'rascunhos', ['version', 'projectId', 'drafts']);
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
      'notes',
      'analysis',
      'updatedAt',
    ]);
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

module.exports = { LIMITS, id, analysis, renderRequest, envelope, project, renderResult };
