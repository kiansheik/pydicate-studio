import { describe, expect, it } from 'vitest';
import {
  edgePath,
  isOperationJunction,
  layoutRuntimeTree,
  NODE_HEIGHT,
  NODE_WIDTH,
  treeEvaluationPreview,
  treeNodeHeight,
  treeNodeWidth,
  type RuntimeGraph,
  type RuntimeNode,
} from './runtime-tree';

const node = (id: string, kind: string, label = id): RuntimeNode => ({
  id,
  label,
  runtimeType: kind,
  category: kind,
  definition: '',
  tag: '',
  attributes: {},
  morphology: {},
  expression: { kind, code: label },
});

const compound: RuntimeGraph = {
  version: 1,
  rootId: 'compose',
  diagnostics: [],
  nodes: [
    node('compose', 'binary', '/'),
    node('past', 'binary', '*'),
    node('subject', 'binary', '*'),
    node('patient', 'binary', '*'),
    ...['ypy', 'pûera', 'og', 'emi', 'tym'].map((name) => node(name, 'reference')),
  ],
  edges: [
    ['compose', 'past'],
    ['compose', 'ypy'],
    ['past', 'pûera'],
    ['past', 'subject'],
    ['subject', 'og'],
    ['subject', 'patient'],
    ['patient', 'emi'],
    ['patient', 'tym'],
  ].map(([source, target], index) => ({
    id: String(index),
    source,
    target,
    field: 'operand',
    index: null,
    label: 'operand',
    kind: 'child',
    evidence: 'source',
  })),
};

describe('operation connection layout', () => {
  it('uses compact connection labels only for source operations', () => {
    for (const kind of ['binary', 'comparison', 'unary']) {
      const operation = node('step', kind, '==');
      expect(isOperationJunction(operation)).toBe(true);
      expect(treeNodeWidth(operation)).toBe(56);
    }
    expect(treeNodeWidth(node('step', 'method', '.imp()'))).toBe(72);
    expect(treeNodeWidth(node('step', 'call', 'very_long_reusable_construction_name()'))).toBe(190);
    for (const kind of ['reference', 'literal', 'unsupported']) {
      expect(isOperationJunction(node('item', kind))).toBe(false);
      expect(treeNodeWidth(node('item', kind))).toBe(NODE_WIDTH);
    }
    const runtime = { ...node('object', 'binary'), expression: undefined };
    expect(isOperationJunction(runtime)).toBe(false);
    expect(treeNodeWidth(runtime)).toBe(NODE_WIDTH);
  });

  it('compacts all nine compound elements without junction/card overlap or dropped steps', () => {
    const compact = layoutRuntimeTree(compound, new Set());
    const fullCards = layoutRuntimeTree(
      {
        ...compound,
        nodes: compound.nodes.map((item) => ({ ...item, expression: undefined })),
      },
      new Set(),
    );
    expect(compact.positions.size).toBe(9);
    expect(compact.width).toBe(986);
    expect(compact.width).toBeLessThan(fullCards.width * 0.6);
    expect(compact.height).toBe(fullCards.height);
    const positions = [...compact.positions.values()];
    positions.forEach((first, index) => {
      for (const second of positions.slice(index + 1)) {
        const horizontalOverlap =
          first.x < second.x + treeNodeWidth(second.node) &&
          second.x < first.x + treeNodeWidth(first.node);
        const verticalOverlap =
          first.y < second.y + NODE_HEIGHT && second.y < first.y + NODE_HEIGHT;
        expect(horizontalOverlap && verticalOverlap).toBe(false);
      }
    });
    for (const edge of compact.edges) {
      const source = compact.positions.get(edge.source)!;
      const target = compact.positions.get(edge.target)!;
      expect(target.x - source.x - treeNodeWidth(source.node)).toBe(130);
      expect(edgePath(source, target, false)).toMatch(
        `M ${source.x + treeNodeWidth(source.node)} `,
      );
    }
    const collapsed = layoutRuntimeTree(compound, new Set(['subject']));
    expect(collapsed.positions.get('subject')!.hiddenCount).toBe(4);
    expect(collapsed.positions.get('subject')!.depth).toBe(2);
    expect(collapsed.positions.size).toBe(5);
  });

  it('preserves the existing geometry for evaluated-object graphs', () => {
    const graph = {
      ...compound,
      nodes: compound.nodes.map((item) => ({ ...item, expression: undefined })),
    };
    const layout = layoutRuntimeTree(graph, new Set());
    for (const position of layout.positions.values()) expect(position.x).toBe(position.depth * 372);
    expect(layout.width).toBe(1730);
    expect(layout.height).toBe(620);
    expect(edgePath(layout.positions.get('compose')!, layout.positions.get('past')!, false)).toBe(
      'M 242 366.875 C 307 366.875, 307 163.75, 372 163.75',
    );
  });

  it('reserves space for intermediate and final forms without overlapping source steps', () => {
    const graph = structuredClone(compound);
    for (const item of graph.nodes) {
      item.expression!.isRoot = item.id === graph.rootId;
      if (isOperationJunction(item)) {
        item.evaluation = {
          status: 'ok',
          surface:
            item.id === graph.rootId
              ? "oemitymbûerypy pupé Tupã potabame'engi no, uma passagem longa"
              : 'oemitymbûerypeime muito mais texto para ver o recorte',
        };
      }
    }
    const root = graph.nodes[0];
    expect(treeNodeWidth(root)).toBe(300);
    expect(treeNodeWidth(graph.nodes[1])).toBe(230);
    expect(treeNodeHeight(root)).toBe(148);
    expect(treeEvaluationPreview(root)).toMatchObject({
      label: 'Resultado final',
      text: root.evaluation!.status === 'ok' ? root.evaluation!.surface : '',
      lines: expect.any(Array),
    });
    const layout = layoutRuntimeTree(graph, new Set());
    const positions = [...layout.positions.values()];
    expect(positions).toHaveLength(compound.nodes.length);
    positions.forEach((first, index) => {
      for (const second of positions.slice(index + 1)) {
        const horizontalOverlap =
          first.x < second.x + treeNodeWidth(second.node) &&
          second.x < first.x + treeNodeWidth(first.node);
        const verticalOverlap =
          first.y < second.y + treeNodeHeight(second.node) &&
          second.y < first.y + treeNodeHeight(first.node);
        expect(horizontalOverlap && verticalOverlap).toBe(false);
      }
    });
    expect(layout.height).toBeGreaterThan(layoutRuntimeTree(compound, new Set()).height);
    for (const position of positions)
      expect(position.y + treeNodeHeight(position.node)).toBeLessThanOrEqual(layout.height);
    const collapsed = layoutRuntimeTree(graph, new Set([graph.rootId]));
    expect(collapsed.height).toBe(treeNodeHeight(root));
    expect(collapsed.positions.get(graph.rootId)?.hiddenCount).toBe(8);
  });

  it('distinguishes zero output, missing evaluation, scalar values and unavailable forms', () => {
    const operation = node('step', 'binary', '*');
    expect(treeEvaluationPreview(operation)).toBeNull();
    expect(treeNodeHeight(operation)).toBe(NODE_HEIGHT);
    operation.evaluation = { status: 'ok', surface: '' };
    expect(treeEvaluationPreview(operation)).toEqual({
      status: 'ok',
      text: '',
      label: 'Resultado',
      lines: ['∅ · forma vazia'],
      truncated: false,
    });
    expect(treeNodeHeight(operation)).toBe(130);
    operation.evaluation = { status: 'value', value: 'False' };
    expect(treeEvaluationPreview(operation)).toMatchObject({
      label: 'Valor',
      text: 'False',
      lines: ['False'],
    });
    const message = 'Detalhes técnicos longos da avaliação sem argumento';
    operation.evaluation = { status: 'unavailable', message };
    expect(treeEvaluationPreview(operation)).toEqual({
      status: 'unavailable',
      text: message,
      label: 'Avaliação indisponível',
      lines: ['Não foi possível avaliar'],
      truncated: false,
    });
  });

  it('wraps long results on words, clips explicitly and preserves Unicode graphemes', () => {
    const operation = node('step', 'binary', '*');
    operation.evaluation = {
      status: 'ok',
      surface: 'xero pe ore pytuna Tupã potaba meenga arakatupe mundo inteiro',
    };
    const preview = treeEvaluationPreview(operation)!;
    expect(preview.lines).toEqual(['xero pe ore pytuna Tupã', 'potaba meenga arakatupe…']);
    expect(preview.truncated).toBe(true);
    expect(preview.text).toBe(operation.evaluation.surface);
    operation.evaluation.surface = 'ã'.repeat(60);
    const combining = treeEvaluationPreview(operation)!;
    expect(combining.lines[0]).toBe('ã'.repeat(25));
    expect(combining.lines[1]).toBe('ã'.repeat(24) + '…');
    operation.evaluation.surface = '🌿'.repeat(60);
    const emoji = treeEvaluationPreview(operation)!;
    expect(emoji.lines[0]).toBe('🌿'.repeat(12));
    expect(emoji.lines[1]).toBe('🌿'.repeat(12) + '…');
    expect(emoji.text).toBe(operation.evaluation.surface);
  });

  it('shows the engine error at its own step and distinguishes dependent or empty steps', () => {
    const operation = node('step', 'binary', '*');
    operation.evaluation = { status: 'error', message: 'IndexError: list index out of range' };
    const error = treeEvaluationPreview(operation)!;
    expect(error.label).toBe('Erro nesta etapa');
    expect(error.lines.join(' ')).toBe('IndexError: list index out of range');
    expect(error.text).toBe(operation.evaluation.message);
    operation.evaluation = {
      status: 'blocked',
      message: 'A etapa anterior falhou.',
      causes: ['root/left'],
    };
    expect(treeEvaluationPreview(operation)).toMatchObject({
      status: 'blocked',
      label: 'Aguardando partes anteriores',
    });
    operation.evaluation = { status: 'missing', message: 'Escolha uma peça.' };
    expect(treeEvaluationPreview(operation)).toMatchObject({
      status: 'missing',
      label: 'Falta uma peça',
      lines: ['Encaixe vazio'],
    });
  });
});
