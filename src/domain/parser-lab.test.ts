import { describe, expect, it } from 'vitest';
import {
  activeArtifact,
  artifactUsable,
  describeAmbiguity,
  formatBytes,
  jobLabel,
  normalizationFixtures,
  normalizeLabInput,
  previewLabInput,
  routeLabel,
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
