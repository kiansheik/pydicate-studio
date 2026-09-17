import { describe, expect, it } from 'vitest';
import { operationTerm, treeOperationTerm } from './operation-terms';
import { addTreeOperation, treeOperations } from './tree-operations';

describe('Portuguese operation terminology', () => {
  it('distinguishes lexical composition from copular predication', () => {
    const composition = treeOperationTerm('/');
    const copula = treeOperationTerm('@');
    expect(composition.label).toBe('Composição lexical');
    expect(composition.description).toContain('base à esquerda');
    expect(composition.description).toContain('modificador à direita');
    expect(copula.label).toBe('Predicação com cópula');
    expect(copula.description).toContain('bases nominais');
    expect(treeOperationTerm('compose').label).toBe(composition.label);
  });

  it('never guesses possession or grammatical roles from a result class alone', () => {
    expect(operationTerm({ kind: 'binary', operator: '*', runtimeType: 'Noun' }).label).toBe(
      'Vincular elementos',
    );
    expect(
      operationTerm({
        kind: 'binary',
        operator: '*',
        dispatch: 'pydicate.lang.tupilang.pos.noun.Noun.__mul__',
        operandTypes: ['Pronoun', 'Noun'],
      }).label,
    ).toBe('Vincular elementos');
    const possession = operationTerm({
      kind: 'binary',
      operator: '*',
      dispatch: 'pydicate.lang.tupilang.pos.noun.Noun.__mul__',
      operandTypes: ['Noun', 'Noun'],
    });
    expect(possession.label).toBe('Posse nominal');
    expect(possession.description).toContain('esquerda é o possuidor');
    const verb = operationTerm({
      kind: 'binary',
      operator: '*',
      dispatch: 'pydicate.lang.tupilang.pos.verb.Verb.__mul__',
      operandTypes: ['Verb', 'Noun'],
    });
    expect(verb.label).toBe('Argumento verbal');
    expect(verb.description).toContain('dependem da valência');
  });

  it('narrows overloaded coordination only when the evaluated construction confirms it', () => {
    const operation = {
      kind: 'binary',
      operator: '+',
      dispatch: 'pydicate.lang.tupilang.pos.noun.Noun.__add__',
      operandTypes: ['Noun', 'Noun'],
    };
    expect(operationTerm(operation).label).toBe('Adjuntar ou coordenar');
    expect(operationTerm({ ...operation, runtimeType: 'Conjunction' }).label).toBe(
      'Coordenação nominal',
    );
    expect(operationTerm({ ...operation, runtimeType: 'Noun' }).label).toBe(
      'Adjuntar ou coordenar',
    );
  });

  it('distinguishes unary omission from addition and preserves dependent order', () => {
    expect(treeOperationTerm('hidden')).toMatchObject({ label: 'Omissão na fala', syntax: '+' });
    expect(treeOperationTerm('+').label).toBe('Adjuntar ou coordenar');
    expect(treeOperationTerm('negate')).toMatchObject({ label: 'Negação', syntax: '−' });
    expect(treeOperationTerm('<<').description).toContain('principal à esquerda');
    expect(treeOperationTerm('>>').description).toContain('principal à direita');
    expect(treeOperationTerm('<<').description).toContain('adjunto');
    expect(treeOperationTerm('>>').description).toContain('adjunto');
  });

  it('names mood methods while retaining honest availability and scalar-return descriptions', () => {
    expect(treeOperationTerm('imp')).toMatchObject({ label: 'Imperativo', syntax: '.imp()' });
    expect(treeOperationTerm('circ').description).toContain('False força o indicativo');
    expect(treeOperationTerm('inflection').description).toContain('Consulta a pessoa');
    expect(treeOperationTerm('ord').description).toContain('precisa oferecer este método');
    expect(treeOperationTerm('copy').description).not.toContain('independente');
  });

  it('retains unknown method and reusable construction names without inventing a linguistic role', () => {
    expect(operationTerm({ kind: 'method', method: 'future_extension' })).toEqual({
      label: 'Transformação: future_extension',
      description: 'Aplica o método indicado à base selecionada, com os argumentos informados.',
      syntax: '.future_extension()',
    });
    expect(operationTerm({ kind: 'call', method: 'custom_helper' })).toMatchObject({
      label: 'Construção: custom_helper',
      syntax: 'custom_helper()',
    });
  });

  it('changes menu wording without changing source-operation keys or serialized syntax', () => {
    expect(treeOperations).toContainEqual(['*', 'Vincular elementos · *']);
    expect(treeOperations).toContainEqual(['@', 'Predicação com cópula · @']);
    expect(new Set(treeOperations.map(([key]) => key)).size).toBe(22);
    expect(addTreeOperation('tym', '*', 'emi', 'left')).toBe('(emi) * (tym)');
    expect(addTreeOperation('tym', '@', 'ypy')).toBe('(tym) @ (ypy)');
    expect(addTreeOperation('tym', 'hidden')).toBe('+(tym)');
    expect(addTreeOperation('tym', 'imp')).toBe('(tym).imp()');
    for (const [key, label] of treeOperations) {
      expect(label).toContain(' · ');
      expect(treeOperationTerm(key).description.length).toBeGreaterThan(12);
    }
  });
});
