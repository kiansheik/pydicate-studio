import { expect, it } from 'vitest';
import { grammarDiagnostic } from './grammar-diagnostic';
import { createExampleProject } from './example';
import type { AuthorNode } from './authoring';

it('exports successful and failing steps with exact context and distinguishes empty connections', () => {
  const project = createExampleProject();
  project.repositories = [
    {
      name: 'nhe-enga',
      path: '/workspace/nhe-enga',
      revision: 'engine-revision',
      branch: 'main',
      dirty: true,
      fingerprint: 'engine',
    },
  ];
  const root: AuthorNode = {
    id: 'root',
    kind: 'binary',
    operator: '*',
    label: '*',
    code: 'tym * __studio_slot_ab12',
    start: 0,
    end: 24,
    evaluation: { status: 'blocked', message: 'Conexão vazia', causes: ['root/right'] },
    children: [
      {
        slot: 'left',
        node: {
          id: 'root/left',
          kind: 'reference',
          label: 'tym',
          code: 'tym',
          start: 0,
          end: 3,
          children: [],
          evaluation: { status: 'ok', surface: 'tym' },
        },
      },
      {
        slot: 'right',
        node: {
          id: 'root/right',
          kind: 'hole',
          label: 'Conectar aqui',
          code: '__studio_slot_ab12',
          start: 6,
          end: 24,
          children: [],
          evaluation: { status: 'missing', message: 'Conecte uma peça' },
        },
      },
    ],
  };
  const { evidence, prompt } = grammarDiagnostic(project, project.passages[0], {
    raw: root.code,
    root,
    selectedNodeId: 'root/right',
    fragmentId: 'piece-1',
    revisionId: 'revision-1',
  });
  expect(evidence.enginePath).toBe('/workspace/nhe-enga');
  expect(evidence.selectedNodeId).toBe('root/right');
  expect(evidence.fragmentId).toBe('piece-1');
  expect(evidence.steps.map((step) => step.evaluation.status)).toEqual([
    'blocked',
    'ok',
    'missing',
  ]);
  expect(evidence.steps[1].evaluation).toEqual({ status: 'ok', surface: 'tym' });
  expect(prompt).toContain('Não trate uma conexão vazia');
  expect(prompt).toContain('Não altere transcrições');
  expect(prompt).toContain('Não faça chamadas a provedores de IA');
  const repair = grammarDiagnostic(
    project,
    project.passages[0],
    {
      raw: root.code,
      root,
      revisionId: 'revision-1',
    },
    {
      mode: 'engine',
      intendedSurface: 'membyrĩ',
      explanation: 'O diminutivo perde a oclusiva após consoante.',
    },
  );
  expect(repair.evidence.intendedSurface).toBe('membyrĩ');
  expect(repair.prompt).toContain('reload_engine');
  expect(repair.prompt).toContain('verify_ground_truth e line_status em todas as fontes');
  expect(repair.prompt).toContain('aguarde a aprovação dele');
  expect(repair.prompt).toContain('O diminutivo perde a oclusiva');
  const tree = grammarDiagnostic(
    project,
    project.passages[0],
    {
      raw: root.code,
      root,
    },
    { mode: 'tree' },
  );
  expect(tree.prompt).toContain('Proponha quais elementos ou operações acrescentar');
});
