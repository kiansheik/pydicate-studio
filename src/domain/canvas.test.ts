import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import type { AuthorNode, ParsedExpression } from './authoring';
import {
  CANVAS_LIMITS,
  bindCanvasAddress,
  canvasPositionKey,
  createCanvasHole,
  editCanvas,
  emptyCanvas,
  isCanvasHole,
  isCanvasState,
  operationRemovalChoices,
  promoteSoleCanvasRoot,
  type CanvasDocument,
  type CanvasState,
} from './canvas';

function parse(raw: string): AuthorNode {
  const parsed: ParsedExpression = JSON.parse(
    execFileSync(
      'python3',
      [
        '-B',
        '-c',
        'import json,sys;from python.studio_authoring import expression_tree;print(json.dumps(expression_tree(sys.stdin.read())))',
      ],
      { input: raw, encoding: 'utf8' },
    ),
  );
  if (!parsed.root) throw new Error(JSON.stringify(parsed.diagnostics));
  return parsed.root;
}
function document(raw: string, canvas: CanvasState = emptyCanvas()): CanvasDocument {
  return {
    raw,
    canvas,
    roots: Object.fromEntries([
      ['main', raw.trim() ? parse(raw) : null],
      ...canvas.fragments.map((fragment) => [fragment.id, parse(fragment.raw)]),
    ]),
  };
}
const source = (nodeId = 'root', fragmentId?: string) => ({ nodeId, fragmentId });
const sample = (): CanvasState => ({
  fragments: [{ id: 'saved', raw: 'ypy', x: 500, y: 20 }],
  positions: { 'main:root': { x: 10, y: 20 }, 'saved:root': { x: 500, y: 20 } },
});

describe('removing only a source-bound operation', () => {
  it('splices a unary child into its parent without a hole or changing the sibling', () => {
    const doc = document('og * -(abá)', sample());
    const before = structuredClone(doc);
    const result = editCanvas(doc, {
      type: 'unwrap',
      source: bindCanvasAddress(doc, source('root/right')),
      keepChildId: 'root/right/operand',
    });
    expect(result.raw).toBe('og * (abá)');
    expect(result.canvas.fragments).toEqual(sample().fragments);
    expect(result.canvas.positions).toEqual({ 'saved:root': sample().positions['saved:root'] });
    expect(doc).toEqual(before);
    expect(parse(result.raw).children.map(({ node }) => node.code)).toEqual(['og', 'abá']);
  });

  it('preserves the other binary branch as a loose piece in the same immutable transaction', () => {
    const doc = document('og * (emi + tym)', sample());
    const before = structuredClone(doc);
    const result = editCanvas(doc, {
      type: 'unwrap',
      source: bindCanvasAddress(doc, source('root/right')),
      keepChildId: 'root/right/right',
      fragmentIds: { 'root/right/left': 'other-branch', 'root/right/right': 'unused-selected' },
      position: { x: 120, y: 80 },
    });
    expect(result.raw).toBe('og * ((tym))');
    expect(result.canvas.fragments).toEqual([
      ...sample().fragments,
      { id: 'other-branch', raw: 'emi', x: 120, y: 80 },
    ]);
    expect(result.raw).not.toContain('__studio_slot_');
    expect(doc).toEqual(before);
  });

  it('offers comparison sides and compose receiver or predicate modifier', () => {
    for (const [raw, slots] of [
      ['emi == tym', ['left', 'right']],
      ['emi.compose(tym)', ['receiver', 'arg0']],
      ['emi.compose(modifier=tym)', ['receiver', 'kw:modifier']],
    ] as const) {
      const doc = document(raw);
      const choices = operationRemovalChoices(doc.roots.main!);
      expect(choices.map((choice) => choice.slot)).toEqual(slots);
      const result = editCanvas(doc, {
        type: 'unwrap',
        source: source(),
        keepChildId: choices[1].node.id,
        fragmentIds: { [choices[0].node.id]: 'receiver' },
      });
      expect(parse(result.raw).code).toBe('tym');
      expect(result.canvas.fragments[0].raw).toBe('emi');
    }
  });

  it('removes scalar method settings without inventing loose predicate branches', () => {
    for (const raw of [
      'abá.var(-1)',
      'abá.var(setter="îe#literal")',
      'abá.circ(False)',
      'abá.inflection(setter=None)',
      'abá.base_nominal(annotated=True)',
      'abá.copy()',
    ]) {
      const doc = document(raw);
      expect(operationRemovalChoices(doc.roots.main!).map((choice) => choice.slot)).toEqual([
        'receiver',
      ]);
      const result = editCanvas(doc, {
        type: 'unwrap',
        source: source(),
        keepChildId: 'root/receiver',
      });
      expect(parse(result.raw).code).toBe('abá');
      expect(result.canvas.fragments).toEqual([]);
    }
  });

  it('drops the deleted node meaning and keeps each child own annotated meaning', () => {
    const kept = 'studio_define(abá, "sentido da base")';
    const other = 'studio_define(tym, "sentido do outro ramo")';
    const doc = document(`og * studio_define(${kept} + ${other}, "sentido removido")`);
    const choices = operationRemovalChoices(doc.roots.main!.children[1].node);
    expect(choices.map((choice) => choice.node.code)).toEqual([kept, other]);
    const result = editCanvas(doc, {
      type: 'unwrap',
      source: source('root/right'),
      keepChildId: choices[0].node.id,
      fragmentIds: { [choices[1].node.id]: 'other' },
    });
    expect(result.raw).toBe(`og * (${kept})`);
    expect(result.raw).not.toContain('sentido removido');
    expect(result.canvas.fragments[0].raw).toBe(other);
    expect(parse(result.raw).children[1].node.method).toBe('studio_define');
  });

  it('preserves Unicode and comments once across retained and detached child source', () => {
    const raw = `# fora 🦜\n(og * studio_define( # anotação\n  (\n    Noun("abá#literal", definition="""linha\n# dentro de texto""") # lado esquerdo\n    + (emi # interior do outro ramo\n       * tym) # lado direito\n  ), # significado\n  "removido # não comentário"\n)) # final\n`;
    const doc = document(raw);
    const choices = operationRemovalChoices(doc.roots.main!.children[1].node);
    const result = editCanvas(doc, {
      type: 'unwrap',
      source: source('root/right'),
      keepChildId: choices[0].node.id,
      fragmentIds: { [choices[1].node.id]: 'other' },
    });
    const combined = [result.raw, ...result.canvas.fragments.map((fragment) => fragment.raw)].join(
      '\n',
    );
    for (const comment of [
      '# fora 🦜',
      '# anotação',
      '# lado esquerdo',
      '# interior do outro ramo',
      '# lado direito',
      '# significado',
      '# final',
    ])
      expect(combined.split(comment)).toHaveLength(2);
    expect(result.raw).toContain('Noun("abá#literal", definition="""linha\n# dentro de texto""")');
    expect(result.raw).not.toContain('removido # não comentário');
    expect(result.raw).toMatch(/^# fora 🦜\n/);
    expect(result.raw).toMatch(/# final\n$/);
    expect(parse(result.raw).operator).toBe('*');
    expect(parse(result.canvas.fragments[0].raw).operator).toBe('*');
    expect(result.canvas.fragments[0].raw).toContain('# interior do outro ramo');
  });

  it('keeps comments around a removed method argument but removes its setting', () => {
    const doc = document('og * abá.var( # escolher\n -1 # variante\n)');
    const result = editCanvas(doc, {
      type: 'unwrap',
      source: source('root/right'),
      keepChildId: 'root/right/receiver',
    });
    expect(result.raw).toContain('# escolher');
    expect(result.raw).toContain('# variante');
    expect(result.raw).not.toContain('-1');
    expect(parse(result.raw).children[1].node.code).toBe('abá');
    expect(result.canvas.fragments).toEqual([]);
  });

  it('preserves CR and CRLF comments without swallowing an operand into a comment', () => {
    for (const newline of ['\r', '\r\n']) {
      const doc = document(`(emi # entre${newline} * (tym # ramo${newline} + og))`);
      const result = editCanvas(doc, {
        type: 'unwrap',
        source: source(),
        keepChildId: 'root/left',
        fragmentIds: { 'root/right': 'other' },
      });
      expect(parse(result.raw).code).toBe('emi');
      expect(parse(result.canvas.fragments[0].raw).operator).toBe('+');
      expect(result.raw.split('# entre')).toHaveLength(2);
      expect(result.raw).not.toContain('tym');
      expect(result.canvas.fragments[0].raw).toContain(`# ramo${newline}`);
    }
  });

  it('edits whole and nested loose operations without changing the primary result', () => {
    for (const [raw, nodeId, childId] of [
      ['abá.var(1)', 'root', 'root/receiver'],
      ['og * -(abá)', 'root/right', 'root/right/operand'],
    ]) {
      const canvas = sample();
      canvas.fragments[0].raw = raw;
      const doc = document('ypy', canvas);
      const before = structuredClone(doc);
      const result = editCanvas(doc, {
        type: 'unwrap',
        source: source(nodeId, 'saved'),
        keepChildId: childId,
      });
      expect(result.raw).toBe('ypy');
      expect(result.canvas.fragments[0].raw).not.toContain('.var');
      expect(result.canvas.fragments[0].raw).not.toContain('-');
      expect(parse(result.canvas.fragments[0].raw)).toBeTruthy();
      expect(result.canvas.positions).toEqual({ 'main:root': canvas.positions['main:root'] });
      expect(doc).toEqual(before);
    }
  });

  it('promotes an unwrapped sole loose tree but retains an ambiguous forest', () => {
    const canvas = sample();
    canvas.fragments[0].raw = '-(abá)';
    const unary = editCanvas(document('', canvas), {
      type: 'unwrap',
      source: source('root', 'saved'),
      keepChildId: 'root/operand',
    });
    expect(parse(unary.raw).code).toBe('abá');
    expect(unary.canvas.fragments).toEqual([]);
    canvas.fragments[0].raw = 'abá * tym';
    const binary = editCanvas(document('', canvas), {
      type: 'unwrap',
      source: source('root', 'saved'),
      keepChildId: 'root/left',
      fragmentIds: { 'root/right': 'other' },
    });
    expect(binary.raw).toBe('');
    expect(binary.canvas.fragments.map((fragment) => parse(fragment.raw).code)).toEqual([
      'abá',
      'tym',
    ]);
  });

  it('rejects stale source and foreign or deeper child choices without changing the forest', () => {
    const doc = document('og * -(abá)', sample());
    const address = bindCanvasAddress(doc, source());
    const changed = document('tym * -(abá)', sample());
    expect(() =>
      editCanvas(changed, { type: 'unwrap', source: address, keepChildId: 'root/right' }),
    ).toThrow(/mudou/);
    const before = structuredClone(doc);
    for (const keepChildId of ['root', 'root/right/operand', 'foreign'])
      expect(() => editCanvas(doc, { type: 'unwrap', source: source(), keepChildId })).toThrow(
        /parte direta/,
      );
    expect(doc).toEqual(before);
  });

  it('does not infer removal roles for primitives, opaque syntax or ambiguous method settings', () => {
    for (const raw of [
      'abá',
      '1',
      '-1',
      'abá + 1',
      'abá == "literal"',
      'Noun("abá")',
      'helper(abá)',
      'abá.unknown(tym)',
      'abá.var(setting)',
      'abá.circ(val=setting)',
      'abá.copy(tym)',
      'abá.compose(tym, other)',
      'abá.compose(*items)',
      'abá.compose(tym, **opts)',
      'studio_define(-(abá), "sentido", **opts)',
      'studio_define(studio_define(-(abá), "inner", **opts), "outer")',
      'abá < tym < og',
    ]) {
      const doc = document(raw);
      expect(operationRemovalChoices(doc.roots.main!), raw).toEqual([]);
      expect(() =>
        editCanvas(doc, { type: 'unwrap', source: source(), keepChildId: 'root/receiver' }),
      ).toThrow(/parte direta/);
    }
  });

  it('rejects an added branch ID collision atomically', () => {
    const doc = document('abá * tym', sample());
    const before = structuredClone(doc);
    expect(() =>
      editCanvas(doc, {
        type: 'unwrap',
        source: source(),
        keepChildId: 'root/left',
        fragmentIds: { 'root/right': 'saved' },
      }),
    ).toThrow(/identificador/);
    expect(doc).toEqual(before);
  });
});

describe('source-bound draft canvas edits', () => {
  it('promotes the sole remaining tree without changing its source or the previous forest', () => {
    const only = {
      raw: '',
      canvas: {
        ...sample(),
        layout: 'horizontal' as const,
        fragments: [{ ...sample().fragments[0], raw: '(emi * tym) # conservar 🦜\n' }],
      },
    };
    const before = structuredClone(only);
    const result = promoteSoleCanvasRoot(only);
    expect(result.raw).toBe(only.canvas.fragments[0].raw);
    expect(result.canvas).toEqual({
      layout: 'horizontal',
      fragments: [],
      positions: { 'main:root': { x: 500, y: 20 } },
    });
    expect(only).toEqual(before);
    expect(promoteSoleCanvasRoot(result)).toBe(result);
    expect(promoteSoleCanvasRoot({ ...only, raw: '__studio_slot_abc' })).toEqual(result);
    for (const raw of ['tym', 'helper( # continuar', '# nota a conservar'])
      expect(promoteSoleCanvasRoot({ ...only, raw }).raw).toBe(raw);
    const multiple = {
      raw: '',
      canvas: {
        ...sample(),
        fragments: [...sample().fragments, { id: 'other', raw: 'emi', x: 0, y: 0 }],
      },
    };
    expect(promoteSoleCanvasRoot(multiple)).toBe(multiple);
    const hole = {
      raw: '',
      canvas: { ...sample(), fragments: [{ ...sample().fragments[0], raw: '__studio_slot_abc' }] },
    };
    expect(promoteSoleCanvasRoot(hole)).toBe(hole);
  });

  it('combines two loose roots into the primary expression in one transaction', () => {
    const canvas: CanvasState = {
      layout: 'bottom-up',
      positions: {},
      fragments: [
        { id: 'a', raw: 'emi', x: 0, y: 0 },
        { id: 'b', raw: 'tym', x: 200, y: 0 },
      ],
    };
    const doc = document('', canvas);
    const before = structuredClone(doc);
    const result = editCanvas(doc, {
      type: 'combine',
      source: source('root', 'a'),
      target: source('root', 'b'),
      operator: '*',
      order: 'source-first',
    });
    expect(result.raw).toBe('(emi) * (tym)');
    expect(result.canvas).toEqual({ layout: 'bottom-up', fragments: [], positions: {} });
    expect(doc).toEqual(before);
  });

  it('edits inline arguments as one exact revision-bound transaction without extra grouping', () => {
    const raw = '# 🌿\n((tym.var(((1)))) / ypy) # keep\n';
    const doc = document(raw, sample());
    const address = bindCanvasAddress(doc, source('root/left'));
    expect(editCanvas(doc, { type: 'argument', source: address, slot: 'arg0', text: '1' })).toEqual(
      { raw, canvas: sample() },
    );
    const result = editCanvas(doc, {
      type: 'argument',
      source: address,
      slot: 'arg0',
      text: '2,5',
    });
    expect(result.raw).toBe(raw.replace('(((1)))', '(((2.5)))'));
    expect(result.canvas.fragments).toEqual(sample().fragments);
    expect(result.canvas.positions).toEqual({ 'saved:root': sample().positions['saved:root'] });
    expect(doc.raw).toBe(raw);
    expect(doc.canvas).toEqual(sample());
    const next = document(result.raw, result.canvas);
    expect(() =>
      editCanvas(next, { type: 'argument', source: address, slot: 'arg0', text: '3' }),
    ).toThrow(/mudou/);
    const undone = editCanvas(next, {
      type: 'argument',
      source: source('root/left'),
      slot: 'arg0',
      text: '1',
    });
    expect(undone.raw).toBe(raw);
  });

  it('edits a loose piece call without changing the main tree or other fragment positions', () => {
    const canvas = sample();
    canvas.fragments[0].raw = 'tym.var( # preserved\n)';
    const doc = document('og', canvas);
    const result = editCanvas(doc, {
      type: 'argument',
      source: source('root', 'saved'),
      slot: null,
      text: 'îe',
    });
    expect(result.raw).toBe('og');
    expect(result.canvas.fragments[0].raw).toBe('tym.var("îe" # preserved\n)');
    expect(result.canvas.positions).toEqual({ 'main:root': canvas.positions['main:root'] });
    expect(doc.canvas).toEqual(canvas);
  });
  it('combines independent roots with an explicit operation while retaining layout, comments and unrelated pieces', () => {
    const original = 'emi * tym # explicação 🦜\n';
    const canvas: CanvasState = {
      ...sample(),
      layout: 'bottom-up',
      fragments: [...sample().fragments, { id: 'untouched', raw: 'no', x: 900, y: 90 }],
    };
    const result = editCanvas(document(original, canvas), {
      type: 'combine',
      source: source('root', 'saved'),
      target: source(),
      operator: '/',
      order: 'target-first',
    });
    const root = parse(result.raw);
    expect(root.operator).toBe('/');
    expect(root.children[0].node.code).toBe('emi * tym');
    expect(root.children[1].node.code).toBe('ypy');
    expect(result.raw).toContain('# explicação 🦜\n');
    expect(result.canvas.layout).toBe('bottom-up');
    expect(result.canvas.fragments).toEqual([canvas.fragments[1]]);
    expect(result.canvas.positions).toEqual({});
  });

  it('combines two loose roots without replacing the existing main result', () => {
    const canvas: CanvasState = {
      layout: 'horizontal',
      fragments: [
        { id: 'a', raw: 'emi', x: 0, y: 0 },
        { id: 'b', raw: 'tym', x: 300, y: 0 },
      ],
      positions: {},
    };
    const result = editCanvas(document('no', canvas), {
      type: 'combine',
      source: source('root', 'a'),
      target: source('root', 'b'),
      operator: '*',
      order: 'source-first',
    });
    expect(result.raw).toBe('no');
    expect(result.canvas.fragments).toEqual([{ ...canvas.fragments[1], raw: '(emi) * (tym)' }]);
    expect(result.canvas.layout).toBe('horizontal');
  });

  it('rejects combining nested or stale parts, and rejects invented operators', () => {
    const doc = document('emi * tym', sample());
    expect(() =>
      editCanvas(doc, {
        type: 'combine',
        source: source('root/left'),
        target: source('root', 'saved'),
        operator: '*',
      }),
    ).toThrow(/independentes/);
    expect(() =>
      editCanvas(doc, {
        type: 'combine',
        source: { ...source(), expectedRaw: 'no' },
        target: source('root', 'saved'),
        operator: '*',
      }),
    ).toThrow(/mudou/);
    expect(() =>
      editCanvas(doc, {
        type: 'combine',
        source: source(),
        target: source('root', 'saved'),
        operator: 'exec',
      }),
    ).toThrow(/válida/);
  });

  it('validates orientation and preserves it through ordinary canvas edits', () => {
    expect(isCanvasState({ ...emptyCanvas(), layout: 'bottom-up' })).toBe(true);
    expect(isCanvasState({ ...emptyCanvas(), layout: 'sideways' })).toBe(false);
    const result = editCanvas(document('tym', { ...emptyCanvas(), layout: 'bottom-up' }), {
      type: 'duplicate',
      source: source(),
      fragmentId: 'copy',
    });
    expect(result.canvas.layout).toBe('bottom-up');
  });
  it('detaches only the selected Unicode occurrence, retaining outer comments and unrelated fragments', () => {
    const raw = 'Noun("🦜î") + (oré * (emi * tym)) # manter 🌿';
    const doc = document(raw, sample());
    const before = structuredClone(doc);
    const node = doc.roots.main!.children[1].node.children[1].node;
    const result = editCanvas(doc, {
      type: 'detach',
      source: source(node.id),
      fragmentId: 'detached',
      position: { x: 900, y: -40 },
    });
    const hole = parse(result.raw).children[1].node.children[1].node;
    expect(isCanvasHole(hole)).toBe(true);
    expect(result.raw).toBe(raw.slice(0, node.start) + hole.code + raw.slice(node.end));
    expect(result.canvas.fragments).toEqual([
      ...sample().fragments,
      { id: 'detached', raw: 'emi * tym', x: 900, y: -40 },
    ]);
    expect(result.canvas.positions).toEqual({ 'saved:root': { x: 500, y: 20 } });
    expect(doc).toEqual(before);
  });

  it('preserves an entire root including wrapping trivia when detached or duplicated', () => {
    const raw = '(\n  emi * tym\n) # guardar 🦜\n';
    const doc = document(raw);
    const detached = editCanvas(doc, { type: 'detach', source: source(), fragmentId: 'whole' });
    expect(detached.raw).toBe(raw);
    expect(detached.canvas.fragments).toEqual([]);
    const duplicate = editCanvas(doc, { type: 'duplicate', source: source(), fragmentId: 'copy' });
    expect(duplicate.raw).toBe(raw);
    expect(duplicate.canvas.fragments[0].raw).toBe(raw);
  });

  it('fills a hole by moving an orphan root and removes only that consumed fragment', () => {
    const hole = createCanvasHole();
    const canvas = sample();
    canvas.fragments[0].raw = 'emi * tym # nota interna';
    const doc = document(`no + ${hole}`, canvas);
    const result = editCanvas(doc, {
      type: 'connect',
      source: source('root', 'saved'),
      target: source('root/right'),
    });
    expect(result.raw).toBe('no + (emi * tym # nota interna\n)');
    expect(parse(result.raw).children[1].node.operator).toBe('*');
    expect(result.canvas).toEqual(emptyCanvas());
  });

  it('recognizes an uppercase reserved slot as an empty target', () => {
    const result = editCanvas(document('no + __studio_slot_A1', sample()), {
      type: 'connect',
      source: source('root', 'saved'),
      target: source('root/right'),
    });
    expect(result.raw).toBe('no + (ypy)');
    expect(result.canvas.fragments).toEqual([]);
  });

  it('moves an existing nested part into a hole without duplicating the original', () => {
    const raw = `(emi * tym) + ${createCanvasHole()}`;
    const result = editCanvas(document(raw), {
      type: 'connect',
      source: source('root/left'),
      target: source('root/right'),
    });
    const parsed = parse(result.raw);
    expect(isCanvasHole(parsed.children[0].node)).toBe(true);
    expect(parsed.children[1].node.code).toBe('emi * tym');
    expect(result.canvas.fragments).toEqual([]);
  });

  it('drops onto an occupied scope by swapping exact disjoint ranges in one transaction', () => {
    const raw = '(emi * tym) / ypy # manter 🦜';
    const result = editCanvas(document(raw), {
      type: 'connect',
      source: source('root/left'),
      target: source('root/right'),
    });
    const parsed = parse(result.raw);
    expect(parsed.operator).toBe('/');
    expect(parsed.children[0].node.code).toBe('ypy');
    expect(parsed.children[1].node.code).toBe('emi * tym');
    expect(result.raw.endsWith(' # manter 🦜')).toBe(true);
  });

  it('swaps a fragment root and an occupied main branch while preserving fragment identity', () => {
    const canvas = sample();
    canvas.fragments[0].raw = 'emi * tym # explicação';
    const result = editCanvas(document('no + ypy', canvas), {
      type: 'swap',
      source: source('root', 'saved'),
      target: source('root/right'),
    });
    expect(result.raw).toBe('no + (emi * tym # explicação\n)');
    expect(result.canvas.fragments).toEqual([{ id: 'saved', raw: 'ypy', x: 500, y: 20 }]);
    expect(result.canvas.positions).toEqual({});
    expect(parse(result.raw).children[1].node.operator).toBe('*');
  });

  it('duplicates a repeated reference from its exact occurrence and leaves every original byte unchanged', () => {
    const raw = 'Noun("🌿") + (tym * tym)';
    const doc = document(raw, sample());
    const result = editCanvas(doc, {
      type: 'duplicate',
      source: source('root/right/right'),
      fragmentId: 'occurrence',
    });
    expect(result.raw).toBe(raw);
    expect(result.canvas.fragments.at(-1)!.raw).toBe('tym');
    expect(result.canvas.positions).toEqual(sample().positions);
    const replaced = editCanvas(doc, {
      type: 'replace',
      source: source('root/right/right'),
      raw: 'og * tym',
    });
    expect(replaced.raw).toBe('Noun("🌿") + (tym * (og * tym))');
  });

  it('removes a nested node as a valid slot and deletes a fragment root without touching main', () => {
    const removed = editCanvas(document('emi * tym', sample()), {
      type: 'remove',
      source: source('root/right'),
    });
    expect(isCanvasHole(parse(removed.raw).children[1].node)).toBe(true);
    expect(removed.canvas.fragments).toEqual(sample().fragments);
    const deleted = editCanvas(document(removed.raw, removed.canvas), {
      type: 'remove',
      source: source('root', 'saved'),
    });
    expect(deleted.raw).toBe(removed.raw);
    expect(deleted.canvas).toEqual(emptyCanvas());
    const emptyRoot = editCanvas(document(createCanvasHole()), {
      type: 'remove',
      source: source(),
    });
    expect(emptyRoot.raw).toBe('');
  });

  it('promotes an orphan to main while preserving the previous complete analysis as an orphan', () => {
    const doc = document('no + tym # antigo', sample());
    const result = editCanvas(doc, {
      type: 'make-main',
      source: source('root', 'saved'),
      position: { x: 600, y: 300 },
    });
    expect(result.raw).toBe('ypy');
    expect(result.canvas.fragments).toHaveLength(1);
    expect(result.canvas.fragments[0]).toMatchObject({ raw: 'no + tym # antigo', x: 600, y: 300 });
    expect(result.canvas.fragments[0].id).not.toBe('saved');
    expect(result.canvas.positions).toEqual({});
  });

  it('promotes a nested main branch and retains the rest as an incomplete editable fragment', () => {
    const result = editCanvas(document('no + (emi * tym)'), {
      type: 'make-main',
      source: source('root/right'),
    });
    expect(result.raw).toBe('emi * tym');
    expect(result.canvas.fragments).toHaveLength(1);
    const remaining = parse(result.canvas.fragments[0].raw);
    expect(remaining.children[0].node.code).toBe('no');
    expect(isCanvasHole(remaining.children[1].node)).toBe(true);
  });

  it('rejects ancestor/descendant rewiring, stale roots and old pointer-down source bindings', () => {
    const doc = document('no + (emi * tym)');
    const bound = bindCanvasAddress(doc, source('root/right/right'));
    expect(() =>
      editCanvas(doc, { type: 'swap', source: source(), target: source('root/right') }),
    ).toThrow(/contém/);
    expect(() =>
      editCanvas(doc, {
        type: 'connect',
        source: source('root/right'),
        target: source('root/right/right'),
      }),
    ).toThrow(/contém/);
    const next = document('ypy + (emi * tym)');
    expect(() => editCanvas(next, { type: 'remove', source: bound })).toThrow(/mudou/);
    expect(() =>
      editCanvas(
        { ...doc, raw: 'no + (og * tym)' },
        { type: 'remove', source: source('root/right/right') },
      ),
    ).toThrow(/mudou/);
    expect(() =>
      editCanvas(document('tym + no'), {
        type: 'swap',
        source: source('missing'),
        target: source(),
      }),
    ).toThrow(/atual/);
  });

  it('preserves no-op source/comments/layout and does not fabricate a predicate from a hole', () => {
    const raw = '(\n  tym # comentário\n  * tym\n)';
    const doc = document(raw, sample());
    expect(editCanvas(doc, { type: 'replace', source: source(), raw })).toEqual({
      raw,
      canvas: sample(),
    });
    expect(
      editCanvas(doc, { type: 'swap', source: source('root/left'), target: source('root/right') }),
    ).toEqual({ raw, canvas: sample() });
    expect(editCanvas(doc, { type: 'swap', source: source(), target: source() })).toEqual({
      raw,
      canvas: sample(),
    });
    expect(() =>
      editCanvas(document(createCanvasHole()), { type: 'duplicate', source: source() }),
    ).toThrow(/não contém/);
  });

  it('preserves root wrapping comments during source replacement and no-op inspector edits', () => {
    const raw = '(\n  tym\n) # nota externa 🦜\n';
    const doc = document(raw, sample());
    expect(editCanvas(doc, { type: 'replace', source: source(), raw: 'tym' })).toEqual({
      raw,
      canvas: sample(),
    });
    const result = editCanvas(doc, { type: 'replace', source: source(), raw: 'emi * tym' });
    expect(result.raw).toBe('(\n  (emi * tym)\n) # nota externa 🦜\n');
    expect(parse(result.raw).code).toBe('emi * tym');
  });

  it('stores positions separately and preserves non-executable fragment text as draft material', () => {
    const doc = document('tym', sample());
    const moved = editCanvas(doc, {
      type: 'position',
      address: source('root', 'saved'),
      position: { x: -50, y: 150 },
    });
    expect(moved.raw).toBe('tym');
    expect(moved.canvas.fragments).toEqual(sample().fragments);
    expect(moved.canvas.positions[canvasPositionKey(source('root', 'saved'))]).toEqual({
      x: -50,
      y: 150,
    });
    const incomplete = editCanvas(doc, {
      type: 'add',
      raw: 'helper( # continuar',
      fragmentId: 'unfinished',
    });
    expect(incomplete.canvas.fragments.at(-1)!.raw).toBe('helper( # continuar');
    expect(isCanvasState(incomplete.canvas)).toBe(true);
  });
});

describe('incomplete orphan recovery', () => {
  it('repairs or clears a bound malformed primary while preserving detached work', () => {
    const raw = 'helper( # continuar';
    const doc: CanvasDocument = {
      raw,
      canvas: sample(),
      roots: { main: null, saved: parse('ypy') },
    };
    const bound = bindCanvasAddress(doc, source('root'));
    expect(bound.expectedRaw).toBe(raw);
    expect(editCanvas(doc, { type: 'replace', source: bound, raw: 'emi * tym' })).toEqual({
      raw: '(emi * tym)',
      canvas: { ...sample(), positions: { 'saved:root': sample().positions['saved:root'] } },
    });
    expect(editCanvas(doc, { type: 'remove', source: bound })).toEqual({
      raw: 'ypy',
      canvas: { fragments: [], positions: { 'main:root': sample().positions['saved:root'] } },
    });
    expect(() => editCanvas(doc, { type: 'replace', source: source('root'), raw: 'tym' })).toThrow(
      /mudou/,
    );
    expect(() =>
      editCanvas(doc, { type: 'replace', source: { ...bound, nodeId: 'root/arg0' }, raw: 'tym' }),
    ).toThrow(/mudou/);
    expect(() =>
      editCanvas({ ...doc, raw: 'helper(tym, # novo' }, { type: 'remove', source: bound }),
    ).toThrow(/mudou/);
  });

  it('repairs or discards a source-bound incomplete orphan without inventing child scopes', () => {
    const state = editCanvas(document('no', sample()), {
      type: 'add',
      raw: 'helper( # continuar',
      fragmentId: 'unfinished',
    });
    const doc: CanvasDocument = {
      ...state,
      roots: { main: parse('no'), saved: parse('ypy'), unfinished: null },
    };
    const bound = bindCanvasAddress(doc, source('root', 'unfinished'));
    expect(bound.expectedRaw).toBe('helper( # continuar');
    const repaired = editCanvas(doc, { type: 'replace', source: bound, raw: 'emi * tym' });
    expect(
      parse(repaired.canvas.fragments.find((fragment) => fragment.id === 'unfinished')!.raw).code,
    ).toBe('emi * tym');
    expect(repaired.raw).toBe('no');
    expect(repaired.canvas.fragments.find((fragment) => fragment.id === 'saved')).toEqual(
      sample().fragments[0],
    );
    const deleted = editCanvas(doc, { type: 'remove', source: bound });
    expect(deleted).toEqual({ raw: 'no', canvas: sample() });
    expect(() => editCanvas(doc, { type: 'remove', source: source('root', 'unfinished') })).toThrow(
      /mudou/,
    );
    expect(() =>
      editCanvas(doc, { type: 'replace', source: { ...bound, nodeId: 'root/arg0' }, raw: 'tym' }),
    ).toThrow(/mudou/);
    const newer = {
      ...doc,
      canvas: {
        ...state.canvas,
        fragments: state.canvas.fragments.map((fragment) =>
          fragment.id === 'unfinished' ? { ...fragment, raw: 'helper(tym, # novo' } : fragment,
        ),
      },
    };
    expect(() => editCanvas(newer, { type: 'remove', source: bound })).toThrow(/mudou/);
  });
});

describe('canvas persistence contract', () => {
  it('rejects ambiguous IDs, unsupported fields, nonfinite coordinates and unknown position containers', () => {
    const good = sample();
    expect(isCanvasState(good)).toBe(true);
    expect(isCanvasState({ ...good, version: 2 })).toBe(false);
    expect(isCanvasState({ ...good, fragments: [...good.fragments, good.fragments[0]] })).toBe(
      false,
    );
    for (const id of ['main', '__proto__', 'constructor', 'bad:id'])
      expect(isCanvasState({ ...good, fragments: [{ ...good.fragments[0], id }] })).toBe(false);
    for (const x of [NaN, Infinity, CANVAS_LIMITS.coordinate + 1, '1'])
      expect(isCanvasState({ ...good, positions: { 'main:root': { x, y: 0 } } })).toBe(false);
    expect(isCanvasState({ ...good, positions: { 'missing:root': { x: 0, y: 0 } } })).toBe(false);
    expect(isCanvasState({ ...good, fragments: [{ ...good.fragments[0], approved: true }] })).toBe(
      false,
    );
  });

  it('bounds fragment count, source length, total text and positions without truncating work', () => {
    expect(
      isCanvasState({
        fragments: Array.from({ length: CANVAS_LIMITS.fragments + 1 }, (_, index) => ({
          id: `f${index}`,
          raw: 'tym',
          x: 0,
          y: 0,
        })),
        positions: {},
      }),
    ).toBe(false);
    expect(
      isCanvasState({
        fragments: [{ id: 'long', raw: 'a'.repeat(CANVAS_LIMITS.raw + 1), x: 0, y: 0 }],
        positions: {},
      }),
    ).toBe(false);
    expect(
      isCanvasState({
        fragments: Array.from({ length: 11 }, (_, index) => ({
          id: `f${index}`,
          raw: 'a'.repeat(CANVAS_LIMITS.raw),
          x: 0,
          y: 0,
        })),
        positions: {},
      }),
    ).toBe(false);
    expect(
      isCanvasState({
        fragments: [],
        positions: Object.fromEntries(
          Array.from({ length: CANVAS_LIMITS.positions + 1 }, (_, index) => [
            `main:root/${index}`,
            { x: 0, y: 0 },
          ]),
        ),
      }),
    ).toBe(false);
    const doc = document('tym');
    expect(() => editCanvas(doc, { type: 'add', raw: 'a'.repeat(CANVAS_LIMITS.raw + 1) })).toThrow(
      /limites/,
    );
    expect(doc.canvas).toEqual(emptyCanvas());
  });
});
