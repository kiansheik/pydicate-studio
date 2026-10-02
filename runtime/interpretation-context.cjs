'use strict';
const { createHash } = require('node:crypto');
const fingerprint = (value) =>
  'sha256:' + createHash('sha256').update(JSON.stringify(value)).digest('hex');
const canonicalPassage = (value) => value?.replace(/^pending:/, 'passage:');
const meaningful = (note) =>
  Object.values(note.fields ?? {}).some((value) => typeof value === 'string' && value.trim());

/** Private job evidence: latest saved revisions only, never notebook history. */
function freezeInterpretationNotes(records) {
  if (!Array.isArray(records) || records.length > 10000)
    throw new Error('Caderno de interpretações inválido.');
  const selected = records.filter(meaningful).map(({ history, ...note }) => note);
  if (Buffer.byteLength(JSON.stringify(selected)) > 4 * 1024 * 1024)
    throw new Error('O caderno de interpretações excede o limite desta consulta (4 MiB).');
  return structuredClone(selected);
}

function publicNote(note) {
  if (!note) return null;
  return {
    id: note.id,
    version: note.version,
    scope: note.scope,
    fields: structuredClone(note.fields),
    provenance: {
      revisionId: note.revisionId,
      expressionFingerprint: note.expressionFingerprint,
      ...(note.nodeFingerprint ? { nodeFingerprint: note.nodeFingerprint } : {}),
      savedAt: note.updatedAt,
      originalDefinition: note.provenance?.definition,
      originalExpression: note.provenance?.expression,
    },
  };
}

/** Bind contributor interpretations to proved current syntax, independently of
 * engine definitions. An occurrence never migrates by surface/string similarity.
 */
function interpretationContext(
  records,
  inventory,
  { sourceId, passageId, selectedNode, scope = 'passage', includeOccurrences = true },
) {
  const entries = new Map((inventory.entries ?? []).map((entry) => [entry.id, entry]));
  const bindings = [],
    diagnostics = (inventory.diagnostics ?? [])
      .filter((message) => typeof message === 'string')
      .slice(0, 20)
      .map((message) => message.slice(0, 600));
  let bytes = 0,
    truncated = false;
  for (const occurrence of inventory.occurrences ?? []) {
    if (occurrence.certainty === 'candidate') continue;
    if (scope === 'constituent') {
      if (!selectedNode) continue;
      const start = occurrence.start,
        end = occurrence.end;
      const contained =
        Number.isInteger(start) && Number.isInteger(end)
          ? start >= selectedNode.start && end <= selectedNode.end
          : occurrence.sourceNodeId === selectedNode.id ||
            occurrence.sourceNodeId?.startsWith(selectedNode.id + '/');
      if (!contained) continue;
    }
    const entry = entries.get(occurrence.lexicalId);
    if (!entry) continue;
    const matching = records.filter((note) => note.lexicalId === entry.id && meaningful(note));
    const general = matching.find((note) => note.scope === 'entry');
    const local = matching.filter(
      (note) =>
        includeOccurrences &&
        note.scope === 'occurrence' &&
        note.sourceId === sourceId &&
        canonicalPassage(note.passageId) === canonicalPassage(passageId),
    );
    const stable = local.find((note) => {
      const saved = note.nodeFingerprint ?? note.provenance?.occurrence?.nodeFingerprint;
      return (
        saved &&
        saved === occurrence.nodeFingerprint &&
        note.occurrenceId === occurrence.noteOccurrenceId
      );
    });
    const legacy = local.find(
      (note) =>
        !note.nodeFingerprint &&
        !note.provenance?.occurrence?.nodeFingerprint &&
        note.expressionFingerprint === inventory.expressionFingerprint &&
        note.occurrenceId === occurrence.id,
    );
    const current = stable ?? legacy;
    if (!general && !current) continue;
    const explicitDefinition = occurrence.hasDefinitionOverride
      ? (occurrence.compositeDefinition ?? occurrence.baseDefinition)
      : undefined;
    const sourceDefinitionUnavailable =
      occurrence.hasDefinitionOverride && explicitDefinition === undefined;
    const originalDefinition =
      occurrence.inheritedDefinition ??
      occurrence.compositeDefinition ??
      occurrence.baseDefinition ??
      entry.definition;
    const preferredMeaning = current?.fields.meaning?.trim()
      ? current.fields.meaning
      : explicitDefinition !== undefined
        ? explicitDefinition
        : sourceDefinitionUnavailable
          ? null
          : general?.fields.meaning?.trim()
            ? general.fields.meaning
            : (occurrence.compositeDefinition ?? occurrence.baseDefinition ?? entry.definition);
    const meaningSource = current?.fields.meaning?.trim()
      ? 'occurrence-interpretation'
      : explicitDefinition !== undefined
        ? 'source-definition'
        : sourceDefinitionUnavailable
          ? 'source-definition-unavailable'
          : general?.fields.meaning?.trim()
            ? 'general-interpretation'
            : 'engine-definition';
    const binding = {
      lexicalId: entry.id,
      name: entry.name,
      kind: entry.kind,
      occurrenceId: occurrence.id,
      noteOccurrenceId: occurrence.noteOccurrenceId,
      nodeFingerprint: occurrence.nodeFingerprint,
      sourceNodeId: occurrence.sourceNodeId,
      expression: occurrence.expression ?? entry.expression,
      originalDefinition,
      ...(explicitDefinition !== undefined ? { explicitDefinition } : {}),
      ...(sourceDefinitionUnavailable ? { sourceDefinitionUnavailable: true } : {}),
      general: publicNote(general),
      occurrence: publicNote(current),
      preferredMeaning,
      meaningSource,
      status: 'contributor-interpretation',
    };
    const size = Buffer.byteLength(JSON.stringify(binding));
    if (bindings.length >= 200 || bytes + size > 200000) {
      truncated = true;
      break;
    }
    bytes += size;
    bindings.push(binding);
  }
  if (truncated)
    diagnostics.push(
      'Parte das interpretações foi omitida pelo limite de contexto; não trate a lista como completa.',
    );
  if (bindings.some((binding) => binding.sourceDefinitionUnavailable))
    diagnostics.push(
      'Um nó tem definição explícita na fonte, mas seu significado não foi confirmado nesta realização. A nota geral não substitui essa definição indisponível.',
    );
  return {
    version: 1,
    expressionFingerprint: inventory.expressionFingerprint,
    revisionId: inventory.revisionId,
    engineFingerprint: inventory.engineFingerprint,
    scope,
    bindings,
    fingerprint: fingerprint(bindings),
    diagnostics,
    truncated,
  };
}

const INTERPRETATION_GUIDE =
  'interpretationContext contém notas salvas do colaborador vinculadas aos nós atuais. meaning é uma interpretação editorial, grammar e note são observações, não alterações automáticas da gramática. Use preferredMeaning no nó indicado: leitura específica da ocorrência tem precedência sobre orientação geral; uma definição explícita na fonte tem precedência sobre nota geral herdada. originalDefinition e a proveniência continuam disponíveis. Não aplique notas a irmãos, outros sentidos ou novas versões sem vínculo atual. Não transforme essa orientação em atestação ou aprovação. Se uma nota contradiz definição explícita ou evidência gramatical, exponha a divergência; não invente concordância. Preserve todos os significados internos e indique contexto truncado.';

module.exports = { freezeInterpretationNotes, interpretationContext, INTERPRETATION_GUIDE };
