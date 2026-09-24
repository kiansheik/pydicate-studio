import { describe, expect, it } from 'vitest';
import {
  activeArtifact,
  acceptanceLabel,
  artifactUsable,
  candidateDecompositions,
  candidateLexicalEvidence,
  describeAmbiguity,
  formatBytes,
  jobLabel,
  lexicalEvidenceLabel,
  lexicalHintsForRequest,
  normalizationFixtures,
  normalizeLabInput,
  previewLabInput,
  routeLabel,
  validationLabel,
  type LabArtifact,
  type LabCandidate,
  type LabJob,
  type LabResult,
  type LabStatus,
} from './parser-lab';

function candidate(overrides: Partial<LabCandidate> = {}): LabCandidate {
  return {
    schemaVersion: 1,
    source: '(+ixé * só)',
    surface: 'asó',
    normalized: 'aso',
    route: 'composition',
    family: 'clause',
    bindings: {},
    spans: [],
    score: 0.6,
    scoreMeaning: 'ordenação',
    features: {},
    completeness: 'complete',
    annotated: '',
    morphemes: [],
    provenance: { route: 'composition' },
    editable: true,
    seconds: 0,
    ...overrides,
  };
}

describe('lab normalization mirrors the Python profile', () => {
  it('matches every committed fixture', () => {
    for (const row of normalizationFixtures)
      expect([row.input, normalizeLabInput(row.input)]).toEqual([row.input, row.normalized]);
  });

  it('collapses spacing, case and accents but not historical spelling', () => {
    for (const value of ['Asó xe rokype', 'ASOXEROKYPE', 'a so xé ró kŷ pe', 'Asó, xe rokype.'])
      expect(normalizeLabInput(value)).toBe('asoxerokype');
    expect(normalizeLabInput('Açó xe rokîpe')).toBe('acoxerokipe');
  });

  it('keeps apostrophes, which are meaningful in this orthography', () => {
    expect(normalizeLabInput('mombe’u')).toBe("mombe'u");
    expect(normalizeLabInput("pu'ir")).toBe("pu'ir");
  });

  it('reports the removed punctuation and refuses empty or oversized input', () => {
    const preview = previewLabInput('Asó, xe rokype.');
    expect(preview.normalized).toBe('asoxerokype');
    expect(preview.removedPunctuation).toEqual([',', '.']);
    expect(preview.error).toBeUndefined();
    expect(previewLabInput('   ').error).toMatch(/Escreva uma frase/);
    expect(previewLabInput('a'.repeat(500)).error).toMatch(/muito longo/);
  });

  it('collapses the real dictionary accent collisions onto one key', () => {
    expect(normalizeLabInput('agûaí')).toBe(normalizeLabInput('agûãî'));
    expect(normalizeLabInput('ãgûa')).toBe(normalizeLabInput('agûá'));
    expect(normalizeLabInput('agûaí')).not.toBe(normalizeLabInput('ãgûa'));
  });
});

describe('candidate and artifact presentation', () => {
  it('names each proposal route', () => {
    expect(routeLabel(candidate({ provenance: { route: 'retrieval' } }))).toMatch(/corpus/);
    expect(routeLabel(candidate())).toMatch(/Composta/);
    expect(routeLabel(candidate({ provenance: { route: 'agent' } }))).toMatch(/assistida/);
    expect(routeLabel(candidate({ route: 'morphology', provenance: {} }))).toMatch(/morfologia/);
  });

  it('keeps nested decomposition meanings scoped and avoids duplicate legacy evidence', () => {
    const linked = {
      relation: 'surface-linked' as const,
      source: '(potar * moro).var(1).base_nominal()',
      dictionaryHeadword: 'poropotara',
      senseId: 'navarro:1',
      definition: 'sentido do constituinte',
    };
    const component = { origin: 'shared' as const, headword: 'potar', scope: 'component' as const };
    const unrelated = {
      origin: 'navarro' as const,
      headword: 'oka',
      definition: 'casa',
      scope: 'whole' as const,
    };
    const nested = candidate({
      provenance: {
        decompositions: [{ ...linked, span: { type: 'noun', start: 3, end: 13 } }],
        decomposition: linked,
        lexicalEvidence: [
          {
            origin: 'navarro',
            headword: linked.dictionaryHeadword,
            senseId: linked.senseId,
            definition: linked.definition,
            scope: 'whole',
          },
          component,
          unrelated,
        ],
      },
    });
    expect(routeLabel(nested)).toBe('Análise decomposta');
    expect(candidateDecompositions(nested)).toHaveLength(1);
    expect(candidateDecompositions(nested)[0].span).toEqual({ type: 'noun', start: 3, end: 13 });
    expect(candidateLexicalEvidence(nested)).toEqual([component, unrelated]);
    expect(lexicalEvidenceLabel(unrelated)).toContain('Significado do constituinte');
  });

  it('keeps a matching unknown root provisional without claiming full lexical recognition', () => {
    const hypothesis = candidate({
      completeness: 'partial',
      provenance: { lexicalStatus: 'provisional', acceptance: 'confirmed' },
    });
    expect(acceptanceLabel(hypothesis)).toMatch(/Sintaxe provisória/);
    expect(validationLabel(hypothesis)).toMatch(/significado.*por confirmar/);
    expect(describeAmbiguity({ candidates: [hypothesis] } as LabResult)).toMatch(
      /Uma hipótese provisória.*léxico ainda precisa/,
    );
    expect(acceptanceLabel(candidate())).not.toMatch(/Única/);
  });

  it('reports omitted alternatives and search limits instead of promising exhaustive readings', () => {
    const result = {
      candidates: [candidate()],
      configuration: { diagnostics: { truncated: true, candidateTotal: 12 } },
    } as LabResult;
    expect(describeAmbiguity(result)).toMatch(/Exibindo 1 de 12 propostas/);
    const limited = describeAmbiguity({
      ...result,
      configuration: { diagnostics: { truncated: true, candidateTotal: 1 } },
    } as LabResult);
    expect(limited).toMatch(/outras leituras podem existir/);
    expect(limited).not.toMatch(/1 de 1|omitidas/);
    expect(
      describeAmbiguity({
        ...result,
        configuration: { diagnostics: { budgetExhausted: 'seconds' } },
      } as LabResult),
    ).toMatch(/outras leituras podem existir/);
  });

  it('preserves dictionary senses and labels missing meaning without inventing a definition', () => {
    expect(
      lexicalEvidenceLabel({
        origin: 'navarro',
        headword: 'teko',
        senseId: 'navarro:123',
        entryIndex: 123,
        definition: 'SIMULADO: modo de ser',
      }),
    ).toBe('Navarro · teko · entrada 123: SIMULADO: modo de ser');
    expect(
      lexicalEvidenceLabel({
        origin: 'navarro',
        headword: 'pe',
        category: 'postposition',
        senseId: 'navarro:1:secret-hash',
        optionalNumber: 2,
      }),
    ).toBe('Navarro · pe (Posposição) · acepção 2: significado não informado');
    expect(lexicalEvidenceLabel({ origin: 'user-hypothesis', headword: 'Arani' })).toBe(
      'Hipótese informada · Arani: significado não informado',
    );
    expect(
      lexicalEvidenceLabel({ origin: 'shared', headword: 'ekat', lexicalStatus: 'hypothetical' }),
    ).toBe('Léxico compartilhado · ekat · hipótese não atestada: significado não informado');
  });

  it('sends only filled lexical hypotheses and preserves their spelling and category', () => {
    expect(
      lexicalHintsForRequest([
        { root: '  Arani  ', category: 'proper_noun' },
        { root: '', category: 'noun' },
        { root: '   ', category: 'noun' },
        { root: 'mombe’u', category: 'transitive_verb' },
      ]),
    ).toEqual([
      { root: 'Arani', category: 'proper_noun' },
      { root: 'mombe’u', category: 'transitive_verb' },
    ]);
  });

  it('states ambiguity instead of hiding competing analyses', () => {
    const base = { candidates: [] } as unknown as LabResult;
    expect(describeAmbiguity(base)).toMatch(/Nenhuma análise completa/);
    expect(describeAmbiguity({ ...base, candidates: [candidate()] })).toMatch(/Uma análise/);
    expect(
      describeAmbiguity({
        ...base,
        candidates: [candidate(), candidate({ source: '(ixé * oka)' })],
      }),
    ).toMatch(/2 análises/);
  });

  it('treats an artifact built under another engine as unusable', () => {
    const artifact: LabArtifact = {
      artifactId: 'index-1',
      kind: 'index',
      status: 'complete',
      completed: true,
      counts: {},
      metrics: {},
      recipe: {},
      parents: [],
      contextFingerprint: 'sha256:a',
    };
    expect(artifactUsable(artifact, 'sha256:a')).toBe(true);
    expect(artifactUsable(artifact, 'sha256:b')).toBe(false);
    expect(artifactUsable({ ...artifact, completed: false }, 'sha256:a')).toBe(false);
  });

  it('finds the active artifact of a kind', () => {
    const status = {
      artifacts: [{ artifactId: 'index-1', kind: 'index' }],
      active: { index: 'index-1' },
    } as unknown as LabStatus;
    expect(activeArtifact(status, 'index')?.artifactId).toBe('index-1');
    expect(activeArtifact(status, 'ranker')).toBeNull();
    expect(activeArtifact(null, 'index')).toBeNull();
  });

  it('labels an interrupted job honestly', () => {
    const job = { stage: 'prepare', status: 'interrupted' } as LabJob;
    expect(jobLabel(job)).toBe('Preparação · interrompido');
    expect(jobLabel({ ...job, stage: 'train', status: 'succeeded' })).toBe('Treino · concluído');
  });

  it('formats artifact sizes', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(900_000)).toBe('900 kB');
    expect(formatBytes(2_600_000_000)).toBe('2.6 GB');
    expect(formatBytes(null)).toBe('desconhecido');
  });
});
