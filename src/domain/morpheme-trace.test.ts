import { describe, expect, it } from 'vitest';
import { traceMorphemes } from './morpheme-trace';
import type { RuntimeGraph, RuntimeNode } from './runtime-tree';

const node = (id: string, annotated: string, kind = 'reference'): RuntimeNode => ({
  id,
  label: id,
  runtimeType: 'Noun',
  category: 'noun',
  definition: '',
  tag: '',
  attributes: {},
  morphology: {},
  expression: { kind, code: id },
  evaluation: { status: 'ok', surface: annotated.replace(/\[[^\]]*\]/g, ''), annotated },
});
const graph = (nodes: RuntimeNode[], links: [string, string, string?][]): RuntimeGraph => ({
  version: 1,
  rootId: nodes[0].id,
  nodes,
  edges: links.map(([source, target, field = 'left'], index) => ({
    id: `${source}-${target}-${index}`,
    source,
    target,
    field,
    index,
    label: field,
    kind: 'child',
    evidence: '',
  })),
  diagnostics: [],
});
const marked = (tree: RuntimeGraph, selected: string, result: string) => {
  const surface = tree.nodes.find((value) => value.id === result)!.evaluation;
  if (surface?.status !== 'ok') return [];
  return traceMorphemes(tree, selected).nodes[result].ranges.map((range) =>
    surface.surface.slice(range.start, range.end),
  );
};

// Captured from the selected local engine for Araújo passage 60. Annotation
// intentionally has no whitespace between i[POSSESSIVE_PRONOUN:3p] and îe.
const passage60 = () => {
  const evidence: [string, string, string, string][] = [
    [
      'root',
      'binary',
      "arobîar ybakype i îeupiragûera Tupã tuba 'ekatûaba koty sena bé",
      "a[SUBJECT_PREFIX:1ps]robîar[ROOT] ybak[ROOT][SUBSTANTIVE_SUFFIX:CONSONANT_ENDING][ROOT]y[SUBSTANTIVE_SUFFIX:CONSONANT_ENDING:CLITIC]pe[POSTPOSITION:LOCATIVE] i[POSSESSIVE_PRONOUN:3p]îe[SUBJECT:refl]upir[ROOT]agûer[PRETERITE_SUFFIX]a[SUBSTANTIVE_SUFFIX:CONSONANT_ENDING] Tupã[PROPER_NOUN] t[PLURIFORM_PREFIX:T:ABSOLUTE]ub[ROOT]a[SUBSTANTIVE_SUFFIX:CONSONANT_ENDING][NOUN] 'ekatûab[ROOT]a[SUBSTANTIVE_SUFFIX:CONSONANT_ENDING][NOUN] koty[POSTPOSITION] s[PLURIFORM_PREFIX:S]en[ROOT]a[SUBSTANTIVE_SUFFIX:CONSONANT_ENDING][NOUN] bé[CONJUNCTION:AND][OBJECT:DIRECT]",
    ],
    ['root/left', 'reference', 'xererobîar', 'xe[OBJECT:1ps]r[PLURIFORM_PREFIX:R]erobîar[ROOT]'],
    [
      'root/right',
      'binary',
      "ybakype i îeupiragûera Tupã tuba 'ekatûaba koty sena bé",
      "ybak[ROOT][SUBSTANTIVE_SUFFIX:CONSONANT_ENDING][ROOT]y[SUBSTANTIVE_SUFFIX:CONSONANT_ENDING:CLITIC]pe[POSTPOSITION:LOCATIVE] i[POSSESSIVE_PRONOUN:3p]îe[SUBJECT:refl]upir[ROOT]agûer[PRETERITE_SUFFIX]a[SUBSTANTIVE_SUFFIX:CONSONANT_ENDING] Tupã[PROPER_NOUN] t[PLURIFORM_PREFIX:T:ABSOLUTE]ub[ROOT]a[SUBSTANTIVE_SUFFIX:CONSONANT_ENDING][NOUN] 'ekatûab[ROOT]a[SUBSTANTIVE_SUFFIX:CONSONANT_ENDING][NOUN] koty[POSTPOSITION] s[PLURIFORM_PREFIX:S]en[ROOT]a[SUBSTANTIVE_SUFFIX:CONSONANT_ENDING][NOUN] bé[CONJUNCTION:AND]",
    ],
    [
      'root/right/left',
      'binary',
      'ybakype i îeupiragûera bé',
      'ybak[ROOT][SUBSTANTIVE_SUFFIX:CONSONANT_ENDING][ROOT]y[SUBSTANTIVE_SUFFIX:CONSONANT_ENDING:CLITIC]pe[POSTPOSITION:LOCATIVE] i[POSSESSIVE_PRONOUN:3p]îe[SUBJECT:refl]upir[ROOT]agûer[PRETERITE_SUFFIX]a[SUBSTANTIVE_SUFFIX:CONSONANT_ENDING] bé[CONJUNCTION:AND]',
    ],
    ['root/right/left/left', 'method', 'bé', 'bé[CONJUNCTION:AND]'],
    ['root/right/left/left/receiver', 'reference', 'abé', 'abé[CONJUNCTION:AND]'],
    [
      'root/right/left/right',
      'reference',
      'ybakype i îeupiragûera',
      'ybak[ROOT][SUBSTANTIVE_SUFFIX:CONSONANT_ENDING][ROOT]y[SUBSTANTIVE_SUFFIX:CONSONANT_ENDING:CLITIC]pe[POSTPOSITION:LOCATIVE] i[POSSESSIVE_PRONOUN:3p]îe[SUBJECT:refl]upir[ROOT]agûer[PRETERITE_SUFFIX]a[SUBSTANTIVE_SUFFIX:CONSONANT_ENDING]',
    ],
    [
      'root/right/right',
      'reference',
      "Tupã tuba 'ekatûaba koty sena",
      "Tupã[PROPER_NOUN] t[PLURIFORM_PREFIX:T:ABSOLUTE]ub[ROOT]a[SUBSTANTIVE_SUFFIX:CONSONANT_ENDING][NOUN] 'ekatûab[ROOT]a[SUBSTANTIVE_SUFFIX:CONSONANT_ENDING][NOUN] koty[POSTPOSITION] s[PLURIFORM_PREFIX:S]en[ROOT]a[SUBSTANTIVE_SUFFIX:CONSONANT_ENDING][NOUN]",
    ],
  ];
  const nodes = evidence.map(([id, kind, surface, annotated]) => {
    const value = node(id, annotated, kind);
    value.evaluation = { status: 'ok', surface, annotated };
    return value;
  });
  return graph(nodes, [
    ['root', 'root/left', 'left'],
    ['root', 'root/right', 'right'],
    ['root/right', 'root/right/left', 'left'],
    ['root/right/left', 'root/right/left/left', 'left'],
    ['root/right/left/left', 'root/right/left/left/receiver', 'receiver'],
    ['root/right/left', 'root/right/left/right', 'right'],
    ['root/right', 'root/right/right', 'right'],
  ]);
};

describe('experimental adjacent-step morpheme tracing', () => {
  it('traces the actual Araújo60 constituents at each ancestor and contextual arobiar to the sentence', () => {
    const tree = passage60();
    const risen = 'root/right/left/right';
    for (const ancestor of [risen, 'root/right/left', 'root/right', 'root'])
      expect(marked(tree, risen, ancestor)).toEqual(['ybakype', 'i', 'îeupiragûera']);
    for (const ancestor of ['root/right/right', 'root/right', 'root'])
      expect(marked(tree, 'root/right/right', ancestor)).toEqual([
        'Tupã',
        'tuba',
        "'ekatûaba",
        'koty',
        'sena',
      ]);
    expect(marked(tree, 'root/left', 'root')).toEqual(['arobîar']);
    expect(marked(tree, 'root/right/left/left/receiver', 'root')).toEqual(['bé']);
    expect(marked(tree, 'root/right/left/left', 'root')).toEqual([]);
  });

  it('uses validated engine segment offsets against exact display whitespace', () => {
    const parent = node('root', 'i[POSSESSIVE_PRONOUN:3p]îe[SUBJECT:refl]');
    parent.evaluation = {
      status: 'ok',
      surface: 'i îe',
      annotated: 'i[POSSESSIVE_PRONOUN:3p]îe[SUBJECT:refl]',
      morphologySegments: [
        { text: 'i', start: 0, end: 1, tags: ['POSSESSIVE_PRONOUN:3p'] },
        { text: 'îe', start: 2, end: 4, tags: ['SUBJECT:refl'] },
      ],
    };
    const tree = graph([parent, node('reflexive', 'îe[SUBJECT:refl]')], [['root', 'reflexive']]);
    expect(traceMorphemes(tree, 'reflexive').nodes.root.ranges).toEqual([{ start: 2, end: 4 }]);
    parent.evaluation.morphologySegments![1].start = 1;
    expect(traceMorphemes(tree, 'reflexive').nodes.root.status).toBe('unavailable');
  });

  it('carries the selected constituent through every ancestor without highlighting siblings', () => {
    const tree = graph(
      [
        node('root', 'o[PRONOUN:3p]emi[PATIENT_PREFIX]tym[ROOT]'),
        node('patient', 'emi[DEVERBAL:PATIENT:AGENT_EXPLICIT]tym[ROOT]', 'binary'),
        node('prefix', 'emi[DEVERBAL:PATIENT:AGENT_EXPLICIT]'),
        node('stem', 'tym'),
        node('subject', 'o[PRONOUN:3p]'),
      ],
      [
        ['root', 'patient'],
        ['root', 'subject', 'right'],
        ['patient', 'prefix'],
        ['patient', 'stem', 'right'],
      ],
    );
    expect(marked(tree, 'stem', 'stem')).toEqual(['tym']);
    expect(marked(tree, 'stem', 'patient')).toEqual(['tym']);
    expect(marked(tree, 'stem', 'root')).toEqual(['tym']);
    expect(traceMorphemes(tree, 'stem').nodes.prefix).toBeUndefined();
    expect(marked(tree, 'patient', 'root')).toEqual(['emitym']);
    // The exact surface supports the changed DEVERBAL -> PATIENT_PREFIX tag.
    expect(marked(tree, 'prefix', 'root')).toEqual(['emi']);
  });

  it('highlights only unary negation additions, preserving the unchanged stem', () => {
    const tree = graph(
      [
        node(
          'root',
          'n[NEGATION_PREFIX]oro[SUBJECT_PREFIX:1ppe]tym[ROOT]i[NEGATION_SUFFIX]',
          'unary',
        ),
        node('base', 'oro[SUBJECT_PREFIX:1ppe]tym[ROOT]', 'binary'),
      ],
      [['root', 'base', 'operand']],
    );
    expect(traceMorphemes(tree, 'root').mode).toBe('change');
    expect(marked(tree, 'root', 'root')).toEqual(['n', 'i']);
    expect(marked(tree, 'base', 'root')).toEqual(['orotym']);
  });

  it('follows a method allomorph delta and its new suffix through the surrounding composition', () => {
    const tree = graph(
      [
        node('root', 'a[SUBJECT] moro[OBJECT:gen]potar[ROOT]a[SUBSTANTIVE_SUFFIX][NOUN]'),
        node('nominal', 'moro[OBJECT:gen]potar[ROOT]a[SUBSTANTIVE_SUFFIX][NOUN]', 'method'),
        node('base', 'poro[OBJECT:gen]potar[ROOT]', 'binary'),
      ],
      [
        ['root', 'nominal'],
        ['nominal', 'base', 'receiver'],
      ],
    );
    expect(marked(tree, 'nominal', 'nominal')).toEqual(['m', 'a']);
    expect(marked(tree, 'nominal', 'root')).toEqual(['m', 'a']);
    expect(marked(tree, 'base', 'nominal')).toEqual(['moropotar']);
  });

  it('does not highlight both repeated roots or choose one by substring position', () => {
    const tree = graph(
      [node('root', 'tym[ROOT] tym[ROOT]'), node('stem', 'tym[ROOT]')],
      [['root', 'stem']],
    );
    expect(traceMorphemes(tree, 'stem').nodes.root).toMatchObject({
      status: 'ambiguous',
      ranges: [],
    });
  });

  it('uses ordered neighboring morphemes to distinguish repeated surfaces', () => {
    const tree = graph(
      [
        node('root', 'x[ROOT] tym[ROOT] y[ROOT] tym[ROOT]'),
        node('pair', 'y[ROOT] tym[ROOT]', 'binary'),
        node('stem', 'tym[ROOT]'),
      ],
      [
        ['root', 'pair'],
        ['pair', 'stem'],
      ],
    );
    expect(marked(tree, 'stem', 'root')).toEqual(['tym']);
    expect(traceMorphemes(tree, 'stem').nodes.root.ranges).toEqual([{ start: 8, end: 11 }]);
  });

  it('never jumps over an ambiguous intermediate step to a convenient root match', () => {
    const tree = graph(
      [
        node('root', 'tym[ROOT]'),
        node('ambiguous', 'tym[ROOT] tym[ROOT]'),
        node('stem', 'tym[ROOT]'),
      ],
      [
        ['root', 'ambiguous'],
        ['ambiguous', 'stem'],
      ],
    );
    expect(traceMorphemes(tree, 'stem').nodes.root).toMatchObject({
      status: 'ambiguous',
      ranges: [],
    });
  });

  it('can retain confident spans while explicitly omitting an ambiguous repeated part', () => {
    const tree = graph(
      [node('root', 'a[ROOT] a[ROOT] b[SUFFIX]'), node('base', 'a[ROOT] b[SUFFIX]')],
      [['root', 'base']],
    );
    expect(traceMorphemes(tree, 'base').nodes.root).toMatchObject({
      status: 'highlighted',
      ranges: [{ start: 4, end: 5 }],
      reason: expect.stringContaining('ambíguas'),
    });
  });

  it('distinguishes a silent variant and a deletion-only operation from an added morpheme', () => {
    const variant = graph(
      [node('root', 'apiti[ROOT]', 'method'), node('base', 'apiti[ROOT]')],
      [['root', 'base', 'receiver']],
    );
    expect(traceMorphemes(variant, 'root').nodes.root).toMatchObject({
      status: 'none',
      ranges: [],
      reason: expect.stringContaining('não altera'),
    });
    const deleted = graph(
      [node('root', 'apit[ROOT]', 'method'), node('base', 'apiti[ROOT]')],
      [['root', 'base', 'receiver']],
    );
    expect(traceMorphemes(deleted, 'root').nodes.root).toMatchObject({
      status: 'none',
      ranges: [],
      reason: expect.stringContaining('remove superfície'),
    });
  });

  it('preserves untagged words, whitespace and zero-surface annotation offsets exactly', () => {
    const tree = graph(
      [node('root', 'untagged  ypy[ROOT][SUBSTANTIVE_SUFFIX:VOWEL_ENDING][NOUN] final')],
      [],
    );
    expect(marked(tree, 'root', 'root')).toEqual(['untagged', 'ypy', 'final']);
    expect(traceMorphemes(tree, 'root').nodes.root.ranges).toEqual([
      { start: 0, end: 8 },
      { start: 10, end: 13 },
      { start: 14, end: 19 },
    ]);
  });

  it('uses UTF-16 spans and never splits a combined grapheme when identifying a change', () => {
    const tree = graph(
      [node('root', '👩🏽‍💻 q\u0303[ROOT]', 'method'), node('base', '👩🏽‍💻 p\u0303[ROOT]')],
      [['root', 'base', 'receiver']],
    );
    expect(marked(tree, 'root', 'root')).toEqual(['q\u0303']);
    expect(traceMorphemes(tree, 'root').nodes.root.ranges).toEqual([{ start: 8, end: 10 }]);
  });

  it('aligns annotation whitespace to displayed offsets without altering any spelling', () => {
    const spaced = node('root', "nã  e'i[ROOT]");
    spaced.evaluation = { status: 'ok', surface: "nã e'i", annotated: "nã  e'i[ROOT]" };
    expect(marked(graph([spaced], []), 'root', 'root')).toEqual(['nã', "e'i"]);
    spaced.evaluation.annotated = "na e'i[ROOT]";
    expect(traceMorphemes(graph([spaced], []), 'root').nodes.root).toMatchObject({
      status: 'unavailable',
      ranges: [],
    });
  });

  it('follows person identity when a pronoun becomes a role prefix, distinguishing persons', () => {
    const tree = graph(
      [node('root', 'xe[OBJECT:1ps]potar[ROOT]'), node('pronoun', 'ixé[PRONOUN:1ps]')],
      [['root', 'pronoun']],
    );
    expect(marked(tree, 'pronoun', 'root')).toEqual(['xe']);
    tree.nodes[1] = node('pronoun', 'îandé[PRONOUN:1ppi]');
    expect(marked(tree, 'pronoun', 'root')).toEqual([]);
  });

  it('stops at missing evaluation or annotation evidence while preserving a complete child', () => {
    const root = node('root', 'tym');
    root.evaluation = { status: 'blocked', message: 'Missing argument' };
    const tree = graph([root, node('child', 'tym')], [['root', 'child']]);
    expect(marked(tree, 'child', 'child')).toEqual(['tym']);
    expect(traceMorphemes(tree, 'child').nodes.root.status).toBe('unavailable');
    root.evaluation = { status: 'ok', surface: 'tym', morphologyDiagnostic: 'Anotação incoerente' };
    expect(traceMorphemes(tree, 'child').nodes.root).toMatchObject({
      status: 'unavailable',
      reason: 'Anotação incoerente',
    });
  });

  it('distinguishes an operation delta from the cumulative morpheme through an explicit variant', () => {
    const tree = graph(
      [
        node('root', 'mbo[CAUSATIVE_PREFIX:MBO]', 'method'),
        node('base', 'mo[CAUSATIVE_PREFIX:MO]'),
      ],
      [['root', 'base', 'receiver']],
    );
    expect(marked(tree, 'root', 'root')).toEqual(['b']);
    expect(marked(tree, 'base', 'root')).toEqual(['mbo']);
    const untagged = graph(
      [node('root', 'gatu', 'method'), node('base', 'katu')],
      [['root', 'base', 'receiver']],
    );
    expect(marked(untagged, 'root', 'root')).toEqual(['g']);
  });

  it('tracks a partial reflexive variant delta through changed role tags and a nominal ending', () => {
    const tree = graph(
      [
        node('root', 'o[SUBJECT_PREFIX:3p]nhe[OBJECT:REFLEXIVE]tym[ROOT]a[NOUN]', 'method'),
        node('clause', 'o[SUBJECT_PREFIX:3p]nhe[OBJECT:REFLEXIVE]tym[ROOT]', 'binary'),
        node('variant', 'nhe[OBJECT_PREFIX:REFLEXIVE:refl]', 'method'),
        node('base', 'îe[OBJECT_PREFIX:REFLEXIVE:refl]'),
      ],
      [
        ['root', 'clause', 'receiver'],
        ['clause', 'variant', 'right'],
        ['variant', 'base', 'receiver'],
      ],
    );
    expect(marked(tree, 'variant', 'variant')).toEqual(['nh']);
    expect(marked(tree, 'variant', 'clause')).toEqual(['nh']);
    expect(marked(tree, 'variant', 'root')).toEqual(['nh']);
  });

  it('does not identify an unrelated remaining ROOT in a multi-child composition', () => {
    const tree = graph(
      [
        node('root', 'outro[ROOT]', 'binary'),
        node('base', 'tym[ROOT]'),
        node('other', 'outro[ROOT]'),
      ],
      [
        ['root', 'base'],
        ['root', 'other', 'right'],
      ],
    );
    expect(marked(tree, 'base', 'root')).toEqual([]);
  });

  it('uses sibling context to reserve a repeated root before following an allomorph', () => {
    const tree = graph(
      [
        node('root', 'gatu[ROOT] y[ROOT] katu[ROOT]', 'binary'),
        node('base', 'katu[ROOT]'),
        node('sibling', 'y[ROOT] katu[ROOT]', 'binary'),
      ],
      [
        ['root', 'base'],
        ['root', 'sibling', 'right'],
      ],
    );
    expect(marked(tree, 'base', 'root')).toEqual(['gatu']);
    expect(marked(tree, 'sibling', 'root')).toEqual(['y', 'katu']);
  });

  it('does not assign the same occurrence to two identical siblings or invent which changed', () => {
    const tree = graph(
      [
        node('root', 'gatu[ROOT] katu[ROOT]', 'binary'),
        node('a', 'katu[ROOT]'),
        node('b', 'katu[ROOT]'),
      ],
      [
        ['root', 'a'],
        ['root', 'b', 'right'],
      ],
    );
    expect(traceMorphemes(tree, 'a').nodes.root).toMatchObject({ status: 'ambiguous', ranges: [] });
    expect(traceMorphemes(tree, 'b').nodes.root).toMatchObject({ status: 'ambiguous', ranges: [] });
  });

  it('distinguishes homographic morphemes by their annotation and sibling sequence', () => {
    const tree = graph(
      [
        node('root', 'a[SUBJECT_PREFIX:1ps]tym[ROOT]a[NOUN]', 'binary'),
        node('person', 'a[PRONOUN:1ps]'),
        node('sibling', 'tym[ROOT]a[NOUN]', 'binary'),
      ],
      [
        ['root', 'person'],
        ['root', 'sibling', 'right'],
      ],
    );
    expect(traceMorphemes(tree, 'person').nodes.root.ranges).toEqual([{ start: 0, end: 1 }]);
  });

  it('treats a unary helper as a change and leaves constructor calls cumulative', () => {
    const helper = node('root', 'tym[ROOT]agûera[SUFFIX]', 'call');
    helper.expression!.method = 'saguera';
    const tree = graph([helper, node('base', 'tym[ROOT]')], [['root', 'base', 'arg0']]);
    expect(traceMorphemes(tree, 'root').mode).toBe('change');
    expect(marked(tree, 'root', 'root')).toEqual(['agûera']);
    helper.expression!.method = 'Noun';
    expect(traceMorphemes(tree, 'root').mode).toBe('constituent');
    expect(marked(tree, 'root', 'root')).toEqual(['tymagûera']);
  });

  it('bounds expensive alignment and ignores nonstructural runtime edges', () => {
    const tree = graph([node('root', 'a '.repeat(193)), node('child', 'a')], [['root', 'child']]);
    expect(traceMorphemes(tree, 'child').nodes.root.status).toBe('unavailable');
    tree.edges[0].kind = 'internal';
    expect(traceMorphemes(tree, 'child').nodes.root).toBeUndefined();
  });
});
