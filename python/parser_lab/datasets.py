"""Streaming generation, corpus retrieval rows and leakage-controlled splits.

Every generated example keeps the *original source expression and its projected
source AST* before rendering, so nothing depends on inverting a surface later.
Reviewed historical data, engine-generated data and model/agent proposals share
this schema but never share evidential status: `provenance` and `reviewStatus`
say which is which, and only reviewed rows may be treated as evidence.
"""
from __future__ import annotations

import ast
import hashlib
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from studio_authoring import source_entries, parse_ast

from parser_lab import grammar
from parser_lab.normalization import PROFILE, normalize
from parser_lab import projection

DATASET_SCHEMA = 1
CONFIG_DIRECTORY = Path(__file__).resolve().parents[2] / 'configs' / 'parser-lab'
SPLITS = ('train', 'dev', 'test')
SUITES = ('new_combinations', 'held_out_lexemes', 'held_out_families')


class ProfileError(ValueError):
    pass


def load_profile(name):
    """Load a committed recipe by name or path. Recipes are versioned in Git."""
    path = Path(name)
    if not path.is_file():
        path = CONFIG_DIRECTORY / (str(name) + '.json')
    if not path.is_file():
        available = sorted(item.stem for item in CONFIG_DIRECTORY.glob('*.json'))
        raise ProfileError(f'Perfil desconhecido: {name}. Disponíveis: {", ".join(available)}.')
    profile = json.loads(path.read_text(encoding='utf-8'))
    for required in ('profile', 'seed', 'inventory', 'families', 'rootRules', 'limits'):
        if required not in profile:
            raise ProfileError(f'O perfil {path.name} não declara "{required}".')
    unknown = [item for item in profile['families'] if item not in grammar.FAMILIES]
    if unknown:
        raise ProfileError('Família não declarada na gramática: ' + ', '.join(unknown))
    unknown = [item for item in profile['rootRules'] if item not in grammar.ROOT_RULES]
    if unknown:
        raise ProfileError('Regra raiz não declarada: ' + ', '.join(unknown))
    profile['path'] = str(path)
    return profile


def recipe_of(profile):
    """The reproducible part of a profile: no absolute paths, no timestamps."""
    return {key: profile[key] for key in
            ('profile', 'seed', 'inventory', 'families', 'rootRules', 'limits', 'holdout',
             'split', 'includeRetrieval', 'sourceId')
            if key in profile}


def group_key(normalized, parent=None):
    """Duplicates and augmentations of one parent must never straddle a split."""
    return parent or normalized


def _bucket(key, salt):
    value = hashlib.sha256((str(salt) + '\0' + key).encode('utf-8')).digest()
    return int.from_bytes(value[:8], 'big') / float(1 << 64)


# -- fragments -------------------------------------------------------------

def generate_fragments(engine, profile, progress=None, cancelled=None):
    """Realize every declared family instance. Failures are recorded, not hidden."""
    inventory = profile['inventory']
    limit = profile['limits'].get('perFamily')
    total = 0
    skipped = []
    for family in profile['families']:
        for bindings in grammar.slot_combinations(family, inventory, limit):
            if cancelled and cancelled():
                return
            source = grammar.instantiate(family, bindings)
            surface = engine.surface(source)
            total += 1
            if progress and total % 200 == 0:
                progress({'stage': 'fragments', 'processed': total})
            if not surface or not surface.strip():
                skipped.append({'source': source, 'reason': 'EMPTY_OR_FAILED'})
                continue
            key = normalize(surface)
            if not key:
                skipped.append({'source': source, 'reason': 'EMPTY_KEY'})
                continue
            yield {'schemaVersion': DATASET_SCHEMA, 'kind': 'fragment',
                   'family': family, 'type': grammar.FAMILIES[family]['type'],
                   'source': source, 'surface': surface, 'normalized': key,
                   'bindings': bindings, 'lexemes': sorted(set(bindings.values())),
                   'provenance': 'engine-generated', 'reviewStatus': 'unreviewed'}
    if progress:
        progress({'stage': 'fragments', 'processed': total, 'skipped': len(skipped),
                  'skippedExamples': skipped[:10]})


# -- examples --------------------------------------------------------------

def generate_examples(engine, profile, fragments, progress=None, cancelled=None):
    """Assemble root-rule instances from realized fragments and record the tree."""
    by_type = {}
    for fragment in fragments:
        by_type.setdefault(fragment['type'], []).append(fragment)
    limit = profile['limits'].get('examples')
    emitted = 0
    for rule_id in profile['rootRules']:
        rule = grammar.ROOT_RULES[rule_id]
        pools = [by_type.get(part, []) for part in rule['parts']]
        if not all(pools):
            continue
        for combination in _product(pools, limit, profile['seed']):
            if cancelled and cancelled():
                return
            if limit is not None and emitted >= limit:
                if progress:
                    progress({'stage': 'examples', 'processed': emitted, 'limitReached': True})
                return
            source = grammar.assemble(rule_id, [item['source'] for item in combination])
            surface = engine.surface(source)
            if not surface or not surface.strip():
                continue
            key = normalize(surface)
            if not key:
                continue
            try:
                tree = projection.project(source)
            except ValueError:
                continue
            emitted += 1
            if progress and emitted % 200 == 0:
                progress({'stage': 'examples', 'processed': emitted})
            yield {
                'schemaVersion': DATASET_SCHEMA, 'kind': 'example',
                'id': 'gen-' + hashlib.sha256(source.encode()).hexdigest()[:16],
                'rootRule': rule_id,
                'families': [item['family'] for item in combination],
                'sourceExpression': source,
                'sourceAst': tree,
                'canonicalSurface': surface,
                'normalized': key,
                'lexemes': sorted({name for item in combination for name in item['lexemes']}),
                'bindings': {f'{index}:{name}': value for index, item in enumerate(combination)
                             for name, value in item['bindings'].items()},
                'lineage': {'rootRule': rule_id,
                            'families': [item['family'] for item in combination],
                            'parts': [item['source'] for item in combination]},
                'provenance': 'engine-generated', 'reviewStatus': 'unreviewed',
                'normalizerProfile': PROFILE,
            }
    if progress:
        progress({'stage': 'examples', 'processed': emitted})


def _product(pools, limit, seed=0):
    """Walk the combination space so a limit still spreads over the inventory.

    A nested loop with a cap would only ever use the first few members of the
    first pool. An affine permutation of the index space is deterministic,
    needs no materialized list, and keeps construction and lexeme coverage
    balanced when the configured limit is far below the full product.
    """
    if len(pools) == 1:
        for item in pools[0]:
            yield (item,)
        return
    left_pool, right_pool = pools[0], pools[1]
    total = len(left_pool) * len(right_pool)
    if not total:
        return
    count = total if limit is None else min(limit, total)
    step = _coprime(total, seed)
    offset = seed % total
    for index in range(count):
        position = (offset + index * step) % total
        yield (left_pool[position // len(right_pool)], right_pool[position % len(right_pool)])


def _coprime(total, seed):
    """A stride that visits every index once and spreads a truncated walk.

    Starting near the golden-ratio fraction of the space keeps consecutive
    samples far apart, so a limit well below the product still touches the whole
    inventory instead of marching through neighbours.
    """
    from math import gcd
    start = max(1, int(total * 0.6180339887) + (seed % max(1, total // 8)))
    for attempt in range(total):
        candidate = (start + attempt) % total or 1
        if gcd(candidate, total) == 1:
            return candidate
    return 1


def annotate_example(engine, example):
    """Attach engine annotation and morpheme bundles to one example."""
    try:
        annotated = engine._evaluate(example['sourceExpression'], annotated=True)
    except Exception as error:
        return {**example, 'annotated': '', 'morphemes': [],
                'annotationError': f'{type(error).__name__}: {error}'}
    return {**example, 'annotated': annotated, 'morphemes': engine.morphemes(annotated)}


# -- corpus retrieval ------------------------------------------------------

def build_retrieval(engine, progress=None, cancelled=None, node_limit=40):
    """Index verified corpus expressions and their subexpressions.

    This route answers "has this exact analysis been recorded before". It is
    useful and it is labelled: it does not measure generalization, and
    reconstruction evaluation excludes the answer-bearing rows.
    """
    from authoring_runtime import namespace_for, interpret, evaluation_snapshot
    from rendered_structures import isolated_namespace
    corpus = engine.corpus
    processed = 0
    for path in sorted((corpus / 'historic').glob('*.tu.py')):
        if path.name == 'lexicon.tu.py':
            continue
        source_id = path.name.removesuffix('.tu.py')
        try:
            entries = source_entries(path)
            text = path.read_text(encoding='utf-8')
            boundaries = [statement.lineno for statement in ast.parse(text).body
                          if isinstance(statement, (ast.Assign, ast.FunctionDef))
                          and not (isinstance(statement, ast.Assign)
                                   and isinstance(statement.value, (ast.List, ast.Tuple)))]
        except Exception:
            continue
        contexts = {}
        for entry in entries:
            if cancelled and cancelled():
                return
            boundary = max((n for n in boundaries if n < entry['statementLine']), default=0)
            try:
                if boundary not in contexts:
                    contexts[boundary] = namespace_for(corpus, path, entry['statementLine'])
                namespace = contexts[boundary]
            except Exception:
                continue
            raw = entry['expression']
            try:
                tree = engine.tree(raw)
                nodes = list(_walk(tree['root'])) if tree['root'] else []
            except Exception:
                continue
            for index, node in enumerate(nodes[:node_limit]):
                code = node['code']
                try:
                    syntax = parse_ast(code)
                    value = interpret(syntax, isolated_namespace(namespace, syntax), {})
                    if not callable(getattr(value, 'eval', None)):
                        continue
                    surface = str(evaluation_snapshot(value).eval())
                except Exception:
                    continue
                key = normalize(surface)
                if not key:
                    continue
                yield {'schemaVersion': DATASET_SCHEMA, 'kind': 'retrieval',
                       'source': code, 'surface': surface, 'normalized': key,
                       'role': 'expression' if index == 0 else 'subexpression',
                       'context': {'sourceId': source_id, 'line': entry['statementLine'],
                                   'ordinal': entry['ordinal']},
                       'provenance': 'corpus-source', 'reviewStatus': 'source-recorded'}
            processed += 1
            if progress and processed % 20 == 0:
                progress({'stage': 'retrieval', 'processed': processed})
    if progress:
        progress({'stage': 'retrieval', 'processed': processed})


def _walk(node):
    yield node
    for child in node['children']:
        yield from _walk(child['node'])


# -- splits ----------------------------------------------------------------

def assign_splits(rows, profile):
    """Group first, then split. Holdouts are separate suites, never training.

    Grouping uses the normalized surface (so normalization collisions stay
    together) and any declared parent (so augmentations follow their parent).
    """
    holdout = profile.get('holdout', {}) or {}
    held_lexemes = set(holdout.get('lexemes', ()))
    held_families = set(holdout.get('families', ()))
    ratios = profile.get('split', {'train': 0.7, 'dev': 0.15, 'test': 0.15})
    seed = profile['seed']
    assignment = {}
    groups = {}
    for row in rows:
        key = group_key(row['normalized'], row.get('parentId'))
        groups.setdefault(key, []).append(row)
    for key, members in groups.items():
        lexemes = {name for member in members for name in member.get('lexemes', ())}
        families = {name for member in members for name in member.get('families', ())}
        if families & held_families:
            assignment[key] = 'held_out_families'
        elif lexemes & held_lexemes:
            assignment[key] = 'held_out_lexemes'
        else:
            position = _bucket(key, seed)
            train = ratios.get('train', 0.7)
            dev = ratios.get('dev', 0.15)
            assignment[key] = 'train' if position < train else 'dev' if position < train + dev else 'test'
    counts = {}
    for key, split in assignment.items():
        counts[split] = counts.get(split, 0) + len(groups[key])
    return {'schemaVersion': DATASET_SCHEMA, 'policy': {
        'groupBy': 'normalized-surface-or-parent', 'seed': seed, 'ratios': ratios,
        'holdout': {'lexemes': sorted(held_lexemes), 'families': sorted(held_families)},
        'note': 'Vocabulários, características e modelos são ajustados apenas no conjunto de treino.'},
        'assignment': assignment, 'counts': counts, 'groups': len(groups)}


def split_of(splits, row):
    return splits['assignment'].get(group_key(row['normalized'], row.get('parentId')), 'train')
