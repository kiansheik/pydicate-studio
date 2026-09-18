"""Separate evaluation suites with explicit denominators and leakage control.

Each suite answers a different question and is reported separately. A high tag
F1 or a valid surface is never reported as exact Pydicate accuracy. Production
retrieval has no artificial holdout, so its success is reported apart from
reconstruction.
"""
from __future__ import annotations

import json
import time
import unicodedata

from parser_lab import projection
from parser_lab.artifacts import read_jsonl
from parser_lab.datasets import split_of
from parser_lab.normalization import normalize, prepare
from parser_lab.search import Budget, analyze

SUITE_VERSION = 1
COMPARATOR = ('Comparador estrutural: projeção do AST de origem sem posições nem identificadores. '
              'Agrupamento, ordem de operadores, omissão e variantes continuam distintos.')


class RestrictedIndex:
    """Index view that hides the answer and anything that reveals it.

    Lexical and grammatical resources stay available; answer-bearing recorded
    expressions do not. Removing them is what makes a reconstruction number
    mean something.
    """

    def __init__(self, index, answer_source, observed, drop_lexemes=(), drop_families=()):
        self.index = index
        self.observed = observed
        self.drop_lexemes = set(drop_lexemes)
        self.drop_families = set(drop_families)
        self.excluded = set()
        try:
            tree = projection.project(answer_source)
            self.excluded = {projection.serialize({'root': node})
                             for node in _nodes(tree['root'])}
        except ValueError:
            self.excluded = set()
        self.excluded.add(answer_source)
        self.removed = 0

    def _keep(self, row):
        if row['normalized'] == self.observed:
            return False
        if row['source'] in self.excluded:
            return False
        try:
            if projection.serialize(projection.project(row['source'])) in self.excluded:
                return False
        except ValueError:
            pass
        return True

    def types(self):
        return self.index.types()

    def phrases(self, phrase_type, key, limit=None):
        rows = self.index.phrases(phrase_type, key, None)
        if self.drop_lexemes or self.drop_families:
            rows = [row for row in rows
                    if row['family'] not in self.drop_families
                    and not (set(row.get('lexemes', ())) & self.drop_lexemes)]
        return rows if limit is None else rows[:limit]

    def retrieve(self, key, limit=None):
        rows = [row for row in self.index.retrieve(key, None) if self._keep(row)]
        self.removed += len(self.index.retrieve(key, None)) - len(rows)
        return rows if limit is None else rows[:limit]

    def known_expression(self, key):
        return self.index.known_expression(key)


def _nodes(node):
    yield node
    for child in node['children']:
        yield from _nodes(child['node'])


def structural_match(left_source, right_projection):
    try:
        return projection.project(left_source) == right_projection
    except ValueError:
        return False


def morpheme_metrics(expected, actual):
    """Sequence agreement and tag micro-F1 over engine annotation units."""
    expected_units = [(row['surface'], tuple(row['tags'])) for row in expected]
    actual_units = [(row['surface'], tuple(row['tags'])) for row in actual]
    exact = expected_units == actual_units
    expected_tags = [tag for row in expected for tag in row['tags']]
    actual_tags = [tag for row in actual for tag in row['tags']]
    overlap = 0
    remaining = list(actual_tags)
    for tag in expected_tags:
        if tag in remaining:
            remaining.remove(tag)
            overlap += 1
    precision = overlap / len(actual_tags) if actual_tags else 0.0
    recall = overlap / len(expected_tags) if expected_tags else 0.0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
    return {'sequenceExact': exact, 'tagPrecision': precision, 'tagRecall': recall, 'tagF1': f1}


def _summary(rows, k_values=(1, 5, 10)):
    total = len(rows)
    if not total:
        return {'total': 0}
    complete = sum(1 for row in rows if row['completeness'] == 'complete')
    result = {
        'total': total,
        'complete': complete,
        'partial': sum(1 for row in rows if row['completeness'] == 'partial'),
        'unknown': sum(1 for row in rows if row['completeness'] == 'unknown'),
        'completeRate': round(complete / total, 4),
        'top1': round(sum(1 for row in rows if row['rank'] == 1) / total, 4),
        'surfaceAgreement': round(sum(1 for row in rows if row['surfaceAgrees']) / total, 4),
        'meanCandidates': round(sum(row['candidates'] for row in rows) / total, 4),
        'meanSeconds': round(sum(row['seconds'] for row in rows) / total, 4),
        'ambiguousRate': round(sum(1 for row in rows if row['candidates'] > 1) / total, 4),
        'lexemeRecovery': round(sum(row['lexemeRecovery'] for row in rows) / total, 4),
    }
    for k in k_values:
        result[f'recall@{k}'] = round(sum(1 for row in rows if row['rank'] and row['rank'] <= k) / total, 4)
    aligned = [row for row in rows if row['morphemes']]
    if aligned:
        result['morphemeSequenceExact'] = round(
            sum(1 for row in aligned if row['morphemes']['sequenceExact']) / len(aligned), 4)
        result['morphemeTagF1'] = round(
            sum(row['morphemes']['tagF1'] for row in aligned) / len(aligned), 4)
        result['morphemeDenominator'] = len(aligned)
    return result


def reconstruct(engine, index, example, ranker, *, restrict=True, budget=None,
                drop_lexemes=(), drop_families=()):
    """One reconstruction trial with the answer removed from the context."""
    observed = example['normalized']
    view = (RestrictedIndex(index, example['sourceExpression'], observed,
                            drop_lexemes, drop_families) if restrict else index)
    started = time.perf_counter()
    candidates, rejections, _timings, diagnostics = analyze(
        engine, view, observed, budget=budget or Budget({'maxSeconds': 5.0}), ranker=ranker)
    seconds = time.perf_counter() - started
    gold = example['sourceAst']
    rank = None
    for position, row in enumerate(candidates, 1):
        if structural_match(row['source'], gold):
            rank = position
            break
    best = candidates[0] if candidates else None
    morphemes = None
    if best and example.get('morphemes'):
        morphemes = morpheme_metrics(example['morphemes'], best['morphemes'])
    expected_lexemes = set(projection.lexemes(gold))
    actual_lexemes = set(projection.lexemes(projection.project(best['source']))) if best else set()
    recovery = (len(expected_lexemes & actual_lexemes) / len(expected_lexemes)) if expected_lexemes else 0.0
    return {
        'id': example.get('id'), 'observed': observed,
        'goldSource': example['sourceExpression'],
        'bestSource': best['source'] if best else None,
        'rank': rank, 'candidates': len(candidates),
        'completeness': 'complete' if candidates else 'unknown',
        'surfaceAgrees': bool(best and normalize(best['surface']) == observed),
        'lexemeRecovery': recovery, 'morphemes': morphemes, 'seconds': seconds,
        'route': best['provenance'].get('route') if best else None,
        'rejections': [row['code'] for row in rejections],
        'knownExpression': diagnostics.get('knownExpression'),
        'excludedRows': getattr(view, 'removed', 0),
    }


def normalization_suite(engine, index, examples, ranker):
    """Equivalent inputs must give one observation and the same baseline set."""
    rows = []
    for example in examples:
        surface = example['canonicalSurface']
        variants = [surface, surface.upper(), ' '.join(surface), unicodedata.normalize('NFD', surface)]
        keys = {prepare(variant)['normalized'] for variant in variants}
        signature = None
        agrees = True
        for variant in variants:
            observed = prepare(variant)['normalized']
            candidates, _rejections, _timings, _diagnostics = analyze(
                engine, index, observed, budget=Budget({'maxSeconds': 4.0}), ranker=ranker)
            current = [row['source'] for row in candidates]
            if signature is None:
                signature = current
            elif current != signature:
                agrees = False
        rows.append({'surface': surface, 'distinctKeys': len(keys), 'stable': agrees,
                     'candidates': len(signature or [])})
    total = len(rows)
    return {'total': total,
            'singleObservation': sum(1 for row in rows if row['distinctKeys'] == 1),
            'stableCandidates': sum(1 for row in rows if row['stable']),
            'cases': rows[:20]}


def retrieval_suite(engine, index, examples, ranker):
    """Known-expression retrieval, reported apart from reconstruction."""
    rows = []
    for example in examples:
        observed = example['normalized']
        candidates, _rejections, _timings, diagnostics = analyze(
            engine, index, observed, budget=Budget({'maxSeconds': 4.0}), ranker=ranker,
            include_composition=False)
        found = any(structural_match(row['source'], example['sourceAst']) for row in candidates)
        rows.append({'observed': observed, 'found': found, 'candidates': len(candidates),
                     'knownExpression': diagnostics.get('knownExpression')})
    total = len(rows)
    return {'total': total, 'retrieved': sum(1 for row in rows if row['found']),
            'rate': round(sum(1 for row in rows if row['found']) / total, 4) if total else None,
            'note': 'Recuperação de análises já registradas. Não mede generalização.',
            'cases': rows[:20]}


def run_suites(engine, store, index, index_id, ranker_id=None, progress=None, cancelled=None,
               options=None):
    """Run every suite on the same frozen split and compare configurations."""
    options = options or {}
    progress = progress or (lambda _event: None)
    directory = store.directory(index_id)
    splits = json.loads((directory / 'splits.json').read_text(encoding='utf-8'))
    examples = list(read_jsonl(directory / 'examples.jsonl'))
    sample = options.get('sample', 40)
    ranker = None
    if ranker_id:
        from parser_lab.ranker import Ranker
        ranker = Ranker.load(store.directory(ranker_id) / 'ranker.json')

    by_split = {}
    for row in examples:
        by_split.setdefault(split_of(splits, row), []).append(row)

    suites = {}
    configurations = {}
    started = time.time()

    def take(name, count=None):
        rows = by_split.get(name, [])
        return rows[:count or sample]

    progress({'stage': 'evaluate', 'suite': 'normalization', 'status': 'running'})
    suites['normalization_invariance'] = normalization_suite(
        engine, index, take('test', min(sample, 8)), ranker)

    progress({'stage': 'evaluate', 'suite': 'retrieval', 'status': 'running'})
    corpus_rows = [row for row in read_jsonl(directory / 'retrieval.jsonl')
                   if row.get('role') == 'expression'][:sample] if (directory / 'retrieval.jsonl').is_file() else []
    retrieval_examples = [{'normalized': row['normalized'],
                           'sourceAst': projection.project(row['source']),
                           'sourceExpression': row['source']}
                          for row in corpus_rows if _projectable(row['source'])]
    suites['known_expression_retrieval'] = retrieval_suite(engine, index, retrieval_examples, ranker)

    holdout = (json.loads((directory / 'profile.json').read_text(encoding='utf-8'))
               .get('holdout', {}) if (directory / 'profile.json').is_file() else {})
    for suite, split in (('new_combinations', 'test'),
                         ('held_out_lexemes', 'held_out_lexemes'),
                         ('held_out_families', 'held_out_families')):
        rows = take(split)
        progress({'stage': 'evaluate', 'suite': suite, 'status': 'running', 'total': len(rows)})
        trials = []
        for example in rows:
            if cancelled and cancelled():
                break
            trials.append(reconstruct(engine, index, example, ranker))
        body = {**_summary(trials), 'cases': trials[:10], 'split': split, 'denominator': len(rows)}
        if suite in ('held_out_lexemes', 'held_out_families'):
            # The declared inventory is a *resource*, not something the searcher
            # can learn. Repeat the suite with the held-out resource removed to
            # show exactly where the declared grammar stops generalizing.
            dropped_lexemes = holdout.get('lexemes', ()) if suite == 'held_out_lexemes' else ()
            dropped_families = holdout.get('families', ()) if suite == 'held_out_families' else ()
            restricted = []
            for example in rows:
                if cancelled and cancelled():
                    break
                restricted.append(reconstruct(engine, index, example, ranker,
                                              drop_lexemes=dropped_lexemes,
                                              drop_families=dropped_families))
            body['withResource'] = {'note': 'O recurso reservado continua declarado no índice: '
                                            'isto mede a reserva do classificador, não a do buscador.'}
            body['withoutResource'] = {
                **_summary(restricted),
                'droppedLexemes': list(dropped_lexemes), 'droppedFamilies': list(dropped_families),
                'note': 'O recurso reservado foi removido do índice. A busca declarada não '
                        'inventa léxico nem famílias novas; esta linha mostra esse limite.'}
        suites[suite] = body

    progress({'stage': 'evaluate', 'suite': 'configurations', 'status': 'running'})
    frozen = take('test', min(sample, 20))
    for name, keywords in (('retrieval_only', {'include_composition': False}),
                           ('retrieval_composition', {}),
                           ('ranker', {'ranker': ranker} if ranker else None)):
        if keywords is None:
            configurations[name] = {'available': False,
                                    'reason': 'Nenhum classificador treinado está ativo.'}
            continue
        trials = []
        for example in frozen:
            if cancelled and cancelled():
                break
            view = RestrictedIndex(index, example['sourceExpression'], example['normalized'])
            budget = Budget({'maxSeconds': 5.0})
            candidates, _rejections, _timings, _diagnostics = analyze(
                engine, view, example['normalized'], budget=budget,
                ranker=keywords.get('ranker'),
                include_composition=keywords.get('include_composition', True))
            rank = next((position for position, row in enumerate(candidates, 1)
                         if structural_match(row['source'], example['sourceAst'])), None)
            trials.append({'rank': rank, 'candidates': len(candidates),
                           'completeness': 'complete' if candidates else 'unknown',
                           'surfaceAgrees': bool(candidates and
                                                 normalize(candidates[0]['surface']) == example['normalized']),
                           'seconds': 0.0, 'lexemeRecovery': 0.0, 'morphemes': None})
        configurations[name] = {**_summary(trials), 'available': True, 'denominator': len(frozen)}

    corrections = options.get('corrections') or []
    suites['user_corrections'] = {'total': len(corrections),
                                  'note': 'Correções registradas pelo contribuidor; nenhuma publica '
                                          'ou aprova registro de corpus.'}
    suites['frozen_reviewed_historical'] = {
        'total': 0,
        'note': 'Requer exemplos históricos revisados marcados como tal no laboratório. '
                'Nenhum estava disponível nesta execução; a rota de recuperação do corpus '
                'é relatada separadamente e não substitui este conjunto.'}

    metrics = {suite: {key: value for key, value in body.items() if key != 'cases'}
               for suite, body in suites.items()}
    metrics['configurations'] = configurations
    metrics['elapsedSeconds'] = round(time.time() - started, 3)
    counts = {'examples': len(examples), 'sample': sample,
              **{f'split.{key}': len(value) for key, value in by_split.items()}}
    return {'suiteVersion': SUITE_VERSION, 'comparator': COMPARATOR, 'index': index_id,
            'ranker': ranker_id, 'suites': suites, 'configurations': configurations,
            'metrics': metrics, 'counts': counts}


def _projectable(source):
    try:
        projection.project(source)
        return True
    except ValueError:
        return False
