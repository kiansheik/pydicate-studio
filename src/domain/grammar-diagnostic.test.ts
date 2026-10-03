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

it('keeps the saved selection identity separate from IDs inside an isolated target tree', () => {
  const project = createExampleProject();
  const node = (id: string, code: string, start: number): AuthorNode => ({
    id,
    code,
    start,
    end: start + code.length,
    kind: 'reference',
    label: code,
    children: [],
  });
  const root: AuthorNode = {
    ...node('root', 'a * b', 0),
    kind: 'binary',
    operator: '*',
    evaluation: { status: 'ok', surface: 'target surface' },
    children: [
      { slot: 'left', node: node('root/left', 'a', 0) },
      { slot: 'right', node: node('root/right', 'b', 4) },
    ],
  };
  const selectedNode = { id: 'root/left', code: 'a * b', start: 1, end: 6 };
  const { evidence, prompt } = grammarDiagnostic(
    project,
    project.passages[0],
    { raw: 'a * b', root },
    { mode: 'engine', integrated: true },
    { containingExpression: '(a * b) * c', selectedNode },
  );
  expect(evidence.expression).toBe('a * b');
  expect(evidence.currentSurface).toBe('target surface');
  expect(evidence.parentExpression).toBe('(a * b) * c');
  expect(evidence.selectedNodeId).toBe('root/left');
  expect(evidence.selectedNode).toEqual(selectedNode);
  expect(evidence.stepsExpression).toBe('a * b');
  expect(evidence.steps.map((step) => step.expression)).toEqual(['a * b', 'a', 'b']);
  expect(prompt).toContain('A expressão completa permanece como contexto: (a * b) * c.');
  const embedded = JSON.parse(prompt.match(/```json\n([\s\S]*?)\n```/)![1]);
  expect(embedded.parentExpression).toBe(evidence.parentExpression);
  expect(embedded.selectedNode).toEqual(selectedNode);
});
