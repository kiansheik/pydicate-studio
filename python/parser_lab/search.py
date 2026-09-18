"""Bounded inverse search: retrieve, compose, rank, validate.

Soundness is decided by the engine: an assembled expression is only complete
when the selected engine realizes it and its realization normalizes to exactly
the whole observed input. The fragment-key chart is a *candidate generator*, so
its concatenation assumption can only cost recall, never validity.

Nothing here passes arbitrary input through a literal or a catch-all wrapper and
calls the result a parse. When no candidate qualifies, the answer is `partial`
or `unknown`, with the reasons that were actually observed.
"""
from __future__ import annotations

import json
import time

from parser_lab import grammar
from parser_lab.contracts import REJECTIONS, candidate as make_candidate
from parser_lab.normalization import normalize
from parser_lab import projection

LIMITS = {
    'maxNormalized': 120,      # characters of the observation the chart accepts
    'maxSpanCandidates': 12,   # fragments kept per (type, span)
    'maxAssemblies': 4000,     # engine renders attempted per request
    'maxCandidates': 25,       # distinct analyses returned
    'maxSeconds': 6.0,
    'maxAstNodes': 40,
}


class Budget:
    """Finite bounds on every request; exhaustion is reported, never hidden."""

    def __init__(self, limits=None, cancelled=None):
        self.limits = {**LIMITS, **(limits or {})}
        self.started = time.perf_counter()
        self.assemblies = 0
        self.exhausted = None
        self.cancelled = cancelled

    def elapsed(self):
        return time.perf_counter() - self.started

    def spend_assembly(self):
        self.assemblies += 1
        if self.assemblies > self.limits['maxAssemblies']:
            self.exhausted = 'ASSEMBLIES'
            return False
        if self.elapsed() > self.limits['maxSeconds']:
            self.exhausted = 'TIME'
            return False
        if self.cancelled and self.cancelled():
            self.exhausted = 'CANCELLED'
            return False
        return True


def deterministic_score(*, route, family_count, ast_nodes, parts, ambiguity):
    """Explicit ordering score in [0, 1]. Not a probability; not calibrated.

    Prefers recorded analyses over composed ones, fewer nodes over more, and
    penalizes keys with many competing readings.
    """
    prior = {'retrieval': 0.9, 'composition': 0.6, 'neural': 0.5, 'agent': 0.5}.get(route, 0.4)
    simplicity = 1.0 / (1.0 + max(ast_nodes - 1, 0) / 12.0)
    shape = 1.0 / (1.0 + max(parts - 1, 0) * 0.15 + max(family_count - 1, 0) * 0.05)
    spread = 1.0 / (1.0 + max(ambiguity - 1, 0) * 0.08)
    return max(0.0, min(1.0, 0.45 * prior + 0.30 * simplicity + 0.15 * shape + 0.10 * spread))


def features_of(*, route, source, parts, families, bindings, observed, surface, ast_nodes):
    """Features shared by the deterministic scorer and the trainable ranker."""
    key = normalize(surface)
    return {
        'route_retrieval': 1.0 if route == 'retrieval' else 0.0,
        'route_composition': 1.0 if route == 'composition' else 0.0,
        'parts': float(parts),
        'ast_nodes': float(ast_nodes),
        'source_length': float(len(source)),
        'families': float(len(set(families))),
        'bindings': float(len(bindings)),
        'surface_exact': 1.0 if key == observed else 0.0,
        'length_ratio': float(len(key)) / max(len(observed), 1),
        'distinct_lexemes': float(len(set(bindings.values()))) if bindings else 0.0,
    }


def validate(engine, source, observed):
    """Full validation: editable syntax, resolvable lexemes, complete evaluation."""
    try:
        tree = engine.tree(source)
    except Exception as error:
        return None, ('UNSUPPORTED_SYNTAX', f'{type(error).__name__}: {error}')
    if not tree['root'] or not tree['capabilities']['edit']:
        return None, ('UNSUPPORTED_SYNTAX', REJECTIONS['UNSUPPORTED_SYNTAX'])
    try:
        realized = engine.realize(source)
    except Exception as error:
        return None, ('ENGINE_ERROR', f'{type(error).__name__}: {error}')
    if realized.get('evaluationStatus') != 'complete':
        return None, ('EVALUATION_INCOMPLETE', REJECTIONS['EVALUATION_INCOMPLETE'])
    if normalize(realized['surface']) != observed:
        return None, ('SURFACE_MISMATCH', REJECTIONS['SURFACE_MISMATCH'])
    return realized, None


def chart(engine, index, observed, budget):
    """Typed spans of the observation that a declared phrase realizes exactly."""
    spans = {}
    length = len(observed)
    limit = budget.limits['maxSpanCandidates']
    for start in range(length):
        for end in range(start + 1, length + 1):
            key = observed[start:end]
            for phrase_type in index.types():
                rows = index.phrases(phrase_type, key, limit)
                if rows:
                    spans.setdefault((start, end), {})[phrase_type] = rows
    return spans


def compose(engine, index, observed, budget, rules=None):
    """Assemble root rules over the chart and validate each assembly."""
    spans = chart(engine, index, observed, budget)
    length = len(observed)
    rejections = {}
    accepted = {}
    rule_ids = rules or grammar.root_rule_ids()

    def note(code, detail=None):
        entry = rejections.setdefault(code, {'code': code, 'count': 0,
                                             'message': REJECTIONS.get(code, code)})
        entry['count'] += 1
        if detail and 'detail' not in entry:
            entry['detail'] = detail[:200]

    def attempt(rule_id, parts, used_spans):
        source = grammar.assemble(rule_id, [item['source'] for item in parts])
        if source in accepted:
            return
        if not budget.spend_assembly():
            note('BUDGET_EXHAUSTED', budget.exhausted)
            return
        realized, failure = validate(engine, source, observed)
        if failure:
            note(failure[0], failure[1])
            return
        try:
            tree = projection.project(source)
        except ValueError:
            note('UNSUPPORTED_SYNTAX', REJECTIONS['UNSUPPORTED_SYNTAX'])
            return
        nodes = projection.size(tree)
        if nodes > budget.limits['maxAstNodes']:
            note('UNSUPPORTED_SYNTAX', 'Árvore maior que o limite do laboratório.')
            return
        bindings = {}
        for index_of, item in enumerate(parts):
            for name, value in item.get('bindings', {}).items():
                bindings[f'{index_of}:{name}'] = value
        accepted[source] = {
            'source': source, 'realized': realized, 'rule': rule_id,
            'families': [item.get('family', 'retrieval') for item in parts],
            'bindings': bindings, 'spans': list(used_spans), 'parts': len(parts),
            'ast': tree, 'ast_nodes': nodes,
        }

    for rule_id in rule_ids:
        rule = grammar.ROOT_RULES[rule_id]
        parts_types = rule['parts']
        if len(parts_types) == 1:
            for row in spans.get((0, length), {}).get(parts_types[0], ()):
                attempt(rule_id, [row], [{'type': parts_types[0], 'start': 0, 'end': length}])
        elif len(parts_types) == 2:
            left_type, right_type = parts_types
            for split in range(1, length):
                head = spans.get((0, split), {})
                tail = spans.get((split, length), {})
                if not head or not tail:
                    continue
                # Both surface orders are tried: the engine, not the search,
                # decides whether a constituent is realized before or after.
                for first, second, order in ((left_type, right_type, 'declared'),
                                             (right_type, left_type, 'reversed')):
                    for a in head.get(first, ()):
                        for b in tail.get(second, ()):
                            parts = [a, b] if order == 'declared' else [b, a]
                            attempt(rule_id, parts,
                                    [{'type': first, 'start': 0, 'end': split},
                                     {'type': second, 'start': split, 'end': length}])
    return accepted, list(rejections.values()), spans


def analyze(engine, index, observed, *, budget=None, ranker=None, rules=None,
            include_retrieval=True, include_composition=True, acceptance=None):
    """The bounded cascade. Returns candidates ordered by score and rejections."""
    budget = budget or Budget()
    timings = {}
    rejections = []
    rows = []
    if len(observed) > budget.limits['maxNormalized']:
        return [], [{'code': 'BUDGET_EXHAUSTED', 'count': 1,
                     'message': 'Entrada maior que o limite da busca do laboratório.'}], \
               {'total': 0.0}, {'spans': 0}

    started = time.perf_counter()
    if include_retrieval:
        # Distinct recorded occurrences of one expression are one analysis with
        # several provenances, not several competing analyses.
        seen = {}
        for row in index.retrieve(observed):
            if row['source'] in seen:
                occurrences = seen[row['source']]['provenance']['occurrences']
                if row.get('context') and row['context'] not in occurrences:
                    occurrences.append(row['context'])
                continue
            realized, failure = validate(engine, row['source'], observed)
            if failure:
                continue
            entry = {'source': row['source'], 'realized': realized, 'rule': 'retrieval',
                     'families': ['retrieval'], 'bindings': {}, 'spans': [],
                     'parts': 1, 'ast': None, 'ast_nodes': 0, 'route': 'retrieval',
                     'provenance': {'route': 'retrieval', 'role': row.get('role'),
                                    'occurrences': [row['context']] if row.get('context') else [],
                                    'label': 'Expressão registrada no corpus',
                                    'measuresGeneralization': False}}
            seen[row['source']] = entry
            rows.append(entry)
    timings['retrieval'] = round(time.perf_counter() - started, 4)

    spans = {}
    started = time.perf_counter()
    if include_composition:
        accepted, composition_rejections, spans = compose(engine, index, observed, budget, rules)
        rejections.extend(composition_rejections)
        for item in accepted.values():
            if any(row['source'] == item['source'] for row in rows):
                continue
            rows.append({**item, 'route': 'composition',
                         'provenance': {'route': 'composition', 'rootRule': item['rule'],
                                        'families': item['families'],
                                        'label': 'Composição de fragmentos indexados',
                                        'measuresGeneralization': True}})
    timings['composition'] = round(time.perf_counter() - started, 4)

    # Two spellings of one analysis are one analysis. Deduplicate by the
    # documented structural comparator, never by the rendered string.
    started = time.perf_counter()
    distinct = []
    by_structure = {}
    for item in rows:
        try:
            key = json.dumps(projection.project(item['source']), sort_keys=True, ensure_ascii=False)
        except ValueError:
            key = 'raw:' + item['source']
        existing = by_structure.get(key)
        if existing is None:
            by_structure[key] = item
            item['provenance'].setdefault('equivalentSources', [])
            distinct.append(item)
        elif item['source'] not in existing['provenance']['equivalentSources'] \
                and item['source'] != existing['source']:
            existing['provenance']['equivalentSources'].append(item['source'])
    # Annotation-identical sources are one answer written two ways; the engine,
    # not this module, decides that. Co-generating readings stay separate and
    # are reported as a choice, with the exact tag difference attached.
    from parser_lab.equivalence import annotation_difference, group as group_equivalent
    for item in distinct:
        item['annotated'] = item['realized'].get('annotated', '')
    rows = group_equivalent(distinct)
    for item in rows[1:]:
        item['provenance']['annotationDifferenceFromBest'] = annotation_difference(
            rows[0]['annotated'], item['annotated'])
    if len(rows) > 1:
        for item in rows:
            item['provenance']['coGenerating'] = True
            item['provenance']['acceptance'] = 'presumed'
    candidates = []
    ambiguity = len(rows)
    for item in rows:
        realized = item['realized']
        ast_nodes = item['ast_nodes'] or projection.size(projection.project(item['source']))
        features = features_of(route=item['route'], source=item['source'], parts=item['parts'],
                               families=item['families'], bindings=item['bindings'],
                               observed=observed, surface=realized['surface'], ast_nodes=ast_nodes)
        base = deterministic_score(route=item['route'], family_count=len(set(item['families'])),
                                   ast_nodes=ast_nodes, parts=item['parts'], ambiguity=ambiguity)
        score = base
        provenance = dict(item['provenance'])
        provenance['deterministicScore'] = round(base, 6)
        if ranker is not None:
            from parser_lab.ranker import symbols_of
            score = ranker.score(features, symbols_of(
                rule=item['rule'], families=item['families'],
                bindings=item['bindings'], source=item['source']))
            provenance['ranker'] = ranker.identity()
        candidates.append(make_candidate(
            source=item['source'], surface=realized['surface'], normalized=observed,
            route='ranker' if ranker is not None else item['route'],
            family=item['rule'], bindings=item['bindings'], spans=item['spans'],
            score=score, features=features, completeness='complete',
            annotated=realized.get('annotated', ''),
            morphemes=engine.morphemes(realized['annotated']) if realized.get('annotated') else [],
            provenance=provenance, editable=True))
    if acceptance is not None:
        # A decision the contributor already made applies immediately, without
        # waiting for a training run: confirmed readings first, rejected ones
        # last and labelled. Nothing is hidden — a rejected reading still
        # validates, and showing it is what makes the decision reviewable.
        for candidate in candidates:
            candidate['provenance']['acceptance'] = acceptance.verdict(candidate['source'])
        order = {'confirmed': 0, 'presumed': 1, 'not-preferred': 2, 'rejected': 3}
        candidates.sort(key=lambda row: (order[row['provenance']['acceptance']], -row['score'],
                                         len(row['source']), row['source']))
    else:
        candidates.sort(key=lambda row: (-row['score'], len(row['source']), row['source']))
    timings['ranking'] = round(time.perf_counter() - started, 4)
    timings['total'] = round(sum(timings.values()), 4)
    recognized = sorted(
        ({'start': start, 'end': end, 'text': observed[start:end],
          'types': sorted(types)} for (start, end), types in spans.items()),
        key=lambda row: (row['start'] - row['end'], row['start']))[:50]
    diagnostics = {'spans': len(spans), 'assemblies': budget.assemblies,
                   'budgetExhausted': budget.exhausted,
                   'knownExpression': index.known_expression(observed),
                   # What the declared inventory did recognize. When nothing
                   # qualified, this is the actionable part of the failure.
                   'recognizedSpans': recognized}
    return candidates[:budget.limits['maxCandidates']], rejections, timings, diagnostics
