import passagesFixture from './example-passages.json';
import renderFixture from './render-snapshots.json';
import { expressionFor } from './model';
import type { ImperativeAnalysis, RenderRequest, RenderResult, StudioProject } from './types';

// The expressions and saved references are quoted from oldtupicorpus, with their
// exact revision/paths in example-passages.json. See fixtures-attribution.md.
// Printed page metadata is inherited from the legacy record, not a PDF index.
const initialAnalysis: ImperativeAnalysis = {
  kind: 'imperative',
  predicate: 'apiti',
  subject: 'nde',
  object: 'moro',
  hiddenSubject: true,
  mood: 'imperative',
  negated: true,
};

export function createExampleProject(): StudioProject {
  return {
    id: 'example:araujo-0067',
    name: 'Araújo · Catecismo de 1686',
    mode: 'example',
    engineFingerprint: renderFixture.engineFingerprint,
    // These are fixture provenance, not a report about repositories on this computer.
    repositories: renderFixture.repositories.map((repository) => ({ ...repository })),
    diagnostics: [
      'Exemplo incluído: os resultados foram avaliados previamente pelo motor Python; não há execução de Python neste modo.',
      'As referências vêm de registros legados. Nenhuma aprovação editorial ou transcrição foi criada pelo Studio.',
      'As páginas impressas vêm do corpus; o vínculo com páginas do PDF ainda não foi informado.',
    ],
    passages: passagesFixture.passages.map((passage) => ({
      id: `example:araujo-${String(passage.ordinal).padStart(4, '0')}`,
      legacyId: passage.legacyId,
      sourceId: 'araujo_catecismo_1686',
      ordinal: passage.ordinal,
      title: `Araújo ${String(passage.ordinal).padStart(4, '0')}`,
      sourceExpression: passage.sourceExpression,
      sourceFingerprint: passage.sourceFingerprint,
      acceptedReference: passage.reference,
      referenceProvenance: 'example',
      diplomatic: passage.diplomatic,
      normalized: passage.normalized,
      translation: passage.translation,
      notes: '',
      witness: {
        title: 'Araújo · Catecismo',
        year: '1686',
        printedPage: passage.printedPage,
        pdfPage: null,
        region: null,
      },
      status: 'analysis',
      analysis:
        passage.sourceExpression === expressionFor(initialAnalysis) ? { ...initialAnalysis } : null,
    })),
  };
}

/** The browser selects evaluated fixtures; it contains no Tupi realization rules. */
export async function renderExample(request: RenderRequest): Promise<RenderResult> {
  if (request.engineFingerprint !== renderFixture.engineFingerprint) {
    throw new Error(
      'O motor solicitado difere do exemplo incluído. Reabra o exemplo para atualizar a comparação.',
    );
  }
  const expression = expressionFor(request.analysis);
  const snapshot = renderFixture.snapshots.find((entry) => entry.expression === expression);
  if (!snapshot) {
    throw new Error(
      'Esta configuração não possui um resultado avaliado no exemplo. Abra um projeto local para usar o motor Python.',
    );
  }
  return {
    revisionId: request.revisionId,
    engineFingerprint: renderFixture.engineFingerprint,
    expression: snapshot.expression,
    surface: snapshot.surface,
    annotated: snapshot.annotated,
    morphemes: snapshot.morphemes.map((morpheme) => ({ ...morpheme })),
    origin: 'snapshot',
  };
}
