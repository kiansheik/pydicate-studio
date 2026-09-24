"""Query-directed morphology over dictionary roots, with engine-only realization.

The index stores lexical senses and engine-derived root aliases, not the Cartesian
product of a dictionary and every construction. Aliases select plausible roots;
templates propose structures; only a fresh engine rendering admits a fragment.
User-supplied stems are explicitly provisional, never dictionary discoveries.
"""
from __future__ import annotations

from collections import deque
import time
import unicodedata

from parser_lab.normalization import InputError, normalize
from lexical_metadata import HYPOTHETICAL_TAG

VERSION = 2
HINT_CATEGORIES = {'proper_noun', 'noun', 'intransitive_verb', 'transitive_verb',
                   'second_class_verb'}
PERSONS = ('ixé', 'nde', 'ae', 'oré', 'îandé', 'pee')


def lexical_hints(engine, hints):
    """Turn explicit contributor assumptions into portable, undefined leaves."""
    if hints is None:
        return []
    if not isinstance(hints, list) or len(hints) > 8:
        raise InputError('Informe no máximo oito raízes ou nomes provisórios.')
    rows = []
    for hint in hints:
        if not isinstance(hint, dict) or hint.get('category') not in HINT_CATEGORIES:
            raise InputError('Escolha a classe de cada raiz provisória.')
        root = hint.get('root')
        if not isinstance(root, str) or not root.strip() or len(root) > 80:
            raise InputError('Cada raiz precisa de 1 a 80 caracteres.')
        root = unicodedata.normalize('NFC', root.strip())
        if any(not (char.isalpha() or unicodedata.category(char).startswith('M')
                    or char in " '’ʼ‘-") for char in root) or not normalize(root):
            raise InputError('Use letras na raiz ou no nome, sem código ou pontuação editorial.')
        kind = hint['category']
        if kind.endswith('_verb'):
            # Known headwords may silently override a caller's proposed class.
            # Explicit hints never relabel an existing dictionary sense.
            import sys
            constructor = engine.namespace['Verb']
            module = sys.modules[constructor.__module__]
            if any(normalize(name) == normalize(root)
                   for name in getattr(module, '_DICT_BY_FORM', {})):
                raise InputError(f'A raiz {root!r} já tem acepções verbais no dicionário; '
                                 'remova a hipótese e use o índice para preservá-las.')
            verb_class = {'intransitive_verb': 'v.intr.', 'transitive_verb': 'v.tr.',
                          'second_class_verb': 'adj.'}[kind]
            source = (f'Verb({root!r}, verb_class={verb_class!r}, definition="", '
                      f'tag={"[VERB]" + HYPOTHETICAL_TAG!r})')
        elif kind == 'proper_noun':
            # ProperNoun currently uses the name itself as its definition.
            source = (f'studio_define(ProperNoun({root!r}, '
                      f'tag={"[PROPER_NOUN]" + HYPOTHETICAL_TAG!r}), "")')
        else:
            value = engine.namespace['Noun'](root, definition='')
            if getattr(value, 'functional_gloss', None) is not None:
                raise InputError(f'A raiz {root!r} já consta do dicionário; remova a hipótese '
                                 'para usar suas acepções e classes pelo índice.')
            source = f'Noun({root!r}, definition="", tag={"[NOUN]" + HYPOTHETICAL_TAG!r})'
        rows.append({'id': 'hypothesis:' + kind + ':' + root, 'source': source,
                     'headword': root, 'category': 'verb' if kind.endswith('_verb') else kind,
                     'definition': '', 'keys': [normalize(root)], 'origin': 'user-hypothesis',
                     'lexicalStatus': 'hypothetical',
                     'transitive': kind == 'transitive_verb',
                     'secondClass': kind == 'second_class_verb'})
    return rows


def evidence(row):
    return {key: row[key] for key in ('origin', 'headword', 'definition', 'senseId',
                                      'category', 'entryIndex', 'datasetFingerprint',
                                      'lexicalStatus') if key in row}


def merge_evidence(parts):
    rows = []
    for part in parts:
        for item in part.get('lexicalEvidence', []):
            if item not in rows:
                rows.append(item)
    return rows


def _lexical_surface(text):
    """A conservative lexical link, stricter than the search input key.

    Dictionary meanings cannot be transferred across an accent collision.
    Typography and casing may vary; phonological accents remain significant.
    """
    text = unicodedata.normalize('NFC', text).casefold()
    for apostrophe in ('’', 'ʼ', '‘'):
        text = text.replace(apostrophe, "'")
    return ' '.join(text.split())


class AugmentedIndex:
    """A request-local overlay; no inferred forms are written into the index."""
    def __init__(self, index, fragments):
        self.index = index
        self.extra = {}
        for row in fragments:
            self.extra.setdefault(row['type'], {}).setdefault(row['normalized'], []).append(row)

    def types(self):
        return sorted(set(self.index.types()) | set(self.extra))

    def phrases(self, phrase_type, key, limit=None):
        rows = self.index.phrases(phrase_type, key)
        sources = {row['source'] for row in rows}
        rows += [row for row in self.extra.get(phrase_type, {}).get(key, [])
                 if row['source'] not in sources]
        return rows if limit is None else rows[:limit]

    def retrieve(self, key, limit=None):
        return self.index.retrieve(key, limit)

    def known_expression(self, key):
        return self.index.known_expression(key)


def expand(engine, index, observed, budget, hints=()):
    """Find roots, realize productive templates fairly, return matching spans."""
    started = time.perf_counter()
    initial_assemblies = budget.assemblies
    matches = []
    for row in [*getattr(index, 'lexical_rows', ()), *hints]:
        lengths = [len(key) for key in row['keys'] if key and key in observed]
        if lengths:
            matches.append((row, max(lengths)))
    matches.sort(key=lambda pair: (pair[0].get('normalized') != observed,
                                   pair[0].get('origin') != 'user-hypothesis',
                                   -pair[1], pair[0].get('origin') != 'shared', pair[0]['id']))
    limit = budget.limits['maxLexicalRoots']
    selected = [row for row, _length in matches[:limit]]
    if len(matches) > limit:
        budget.truncated.add('LEXICAL_ROOTS')
    persons = [name for name in PERSONS if name in engine.namespace]
    # Dictionary-only postpositions are productive operators too. Preserve
    # their portable sources and exact senses instead of limiting operators to
    # names already declared in the contributor's shared lexicon.
    postpositions = [row for row in getattr(index, 'lexical_rows', ())
                     if row['category'] == 'postposition'
                     and normalize(row['headword'])
                     and normalize(row['headword']) in observed]
    post_sources = {row['source'] for row in postpositions}
    for name, value in engine.namespace.items():
        if getattr(value, 'category', '') == 'postposition':
            key = normalize(getattr(value, 'verbete', ''))
            # The engine's locative can fuse into a surface that no longer
            # contains its citation form. Always propose that bounded operator;
            # only the engine's complete output can accept the construction.
            if key and (key in observed or name == 'pe') and name not in post_sources:
                postpositions.append({'source': name, 'headword': value.verbete,
                                      'category': 'postposition', 'origin': 'shared',
                                      'definition': getattr(value, 'definition', '') or ''})
    nominal = [row for row in selected if row['category'] in ('noun', 'proper_noun')
               and row.get('normalized', normalize(row['headword'])) in observed]
    if len(nominal) > 8:
        budget.truncated.add('NOMINAL_ARGUMENT_ROOTS')
        nominal = nominal[:8]
    fragments, seen = [], set()
    drop_families = getattr(index, 'drop_families', set())
    nominal_meanings = {}
    for row in getattr(index, 'lexical_rows', ()):
        if (row.get('origin') == 'navarro' and row.get('category') == 'noun'
                and row.get('surface') and row.get('definition')):
            nominal_meanings.setdefault(_lexical_surface(row['surface']), []).append(row)

    def spend():
        if budget.assemblies - initial_assemblies >= budget.limits['maxMorphologyAssemblies']:
            budget.truncated.add('MORPHOLOGY_ASSEMBLIES')
            return False
        return budget.spend_assembly()

    def emit(row, source, phrase_type, family, extra=()):
        if source in seen or family in drop_families:
            return
        seen.add(source)
        if not spend():
            return
        surface = engine.surface(source)
        key = normalize(surface) if surface else ''
        if key and key in observed:
            fragment = {'source': source, 'surface': surface, 'normalized': key,
                        'type': phrase_type, 'family': family,
                        'bindings': {'root': row['source']},
                        'lexicalEvidence': [evidence(row), *extra], 'route': 'morphology'}
            # A matching dictionary form supplies a possible meaning for the
            # whole construction, never proof of its historical derivation.
            # Keep each exact noun sense and the independently defined leaves.
            meanings = (nominal_meanings.get(_lexical_surface(surface), ())
                        if phrase_type == 'np' and family != 'lexical' else ())
            if not meanings:
                fragments.append(fragment)
                return
            for meaning in meanings:
                linked = f'studio_define(({source}), {meaning["definition"]!r})'
                if linked in seen:
                    continue
                seen.add(linked)
                if not spend():
                    break
                linked_surface = engine.surface(linked)
                if not linked_surface or _lexical_surface(linked_surface) != _lexical_surface(surface):
                    continue
                fragments.append({**fragment, 'source': linked, 'surface': linked_surface,
                                  'lexicalEvidence': [
                                      *[{**item, 'scope': 'component'} for item in fragment['lexicalEvidence']],
                                      {**evidence(meaning), 'scope': 'whole'}],
                                  'decomposition': {'relation': 'surface-linked', 'source': source,
                                                    'dictionaryHeadword': meaning['headword'],
                                                    'senseId': meaning.get('senseId'),
                                                    'definition': meaning['definition']}})

    # First try every bare entry. A long expansion of an earlier root must not
    # prevent an exact dictionary sense from being considered at all.
    for row in selected:
        if budget.assemblies - initial_assemblies >= budget.limits['maxMorphologyAssemblies']:
            budget.truncated.add('MORPHOLOGY_ASSEMBLIES')
            break
        emit(row, row['source'], _phrase_type(row), 'lexical')
        if budget.exhausted:
            break
    pending = deque((row, iter(_templates(row, persons, postpositions, nominal, engine.namespace)))
                    for row in selected)
    while pending and not budget.exhausted:
        if budget.assemblies - initial_assemblies >= budget.limits['maxMorphologyAssemblies']:
            budget.truncated.add('MORPHOLOGY_ASSEMBLIES')
            break
        if time.perf_counter() - started > budget.limits['maxSeconds'] * 0.6:
            budget.truncated.add('MORPHOLOGY_TIME')
            break
        row, proposals = pending.popleft()
        proposal = next(proposals, None)
        if proposal is not None:
            emit(row, *proposal)
            pending.append((row, proposals))
    return fragments, {'lexicalRootsMatched': len(matches), 'lexicalRootsSearched': len(selected),
                       'morphologyFragments': len(fragments),
                       'provisionalRoots': [evidence(row) for row in hints]}


def _phrase_type(row):
    if row['category'] == 'verb':
        return 'clause'
    if row['category'] in ('noun', 'proper_noun', 'pronoun', 'adjective'):
        return 'np'
    return 'word'


def _operator_evidence(name, namespace):
    """Retain the lexical meaning of each independently declared operator."""
    value = namespace[name]
    return evidence({'origin': 'shared', 'headword': getattr(value, 'verbete', name),
                     'category': getattr(value, 'category', ''),
                     'definition': getattr(value, 'definition', '') or ''})


def _derived_bases(row, namespace):
    """A finite, reusable derivation inventory, never an inferred etymology.

    A transitive verb may take a generic/reflexive/reciprocal object before it
    becomes a noun. A causative can apply to a noun or a nontransitive verb;
    its resulting verb can in turn take a reflexive or reciprocal argument.
    Every proposed combination still passes through the selected engine.
    """
    source, category = row['source'], row['category']
    if category == 'verb' and row.get('transitive'):
        for name in ('moro', 'nhe', 'nho'):
            if name in namespace:
                yield f'(({source}) * {name})', 'object_bound', [_operator_evidence(name, namespace)]
    elif category in ('noun', 'proper_noun', 'adjective', 'verb') and 'mo' in namespace:
        causative = f'(mo * ({source}))'
        extra = [_operator_evidence('mo', namespace)]
        yield causative, 'causative', extra
        for name in ('nhe', 'nho'):
            if name in namespace:
                yield f'({causative} * {name})', 'causative_object_bound', [*extra, _operator_evidence(name, namespace)]


def _derived_templates(row, namespace):
    """Try short nested analyses early enough that finite paradigms cannot starve them.

    Variation 1 is meaningful for some reflexive/reciprocal nominal bases. It
    is only a proposal: for generic moro it is often morphology-neutral, and
    the normal equivalence step records that alternative source spelling.
    """
    for base, family, extra in _derived_bases(row, namespace):
        yield f'{base}.base_nominal()', 'np', family + '_nominal', extra
        yield f'{base}.var(1).base_nominal()', 'np', family + '_nominal', extra
        yield base, 'clause', family, extra


def _templates(row, persons, postpositions, nominal, namespace):
    source, category = row['source'], row['category']
    yield from _derived_templates(row, namespace)
    if category in ('noun', 'proper_noun', 'adjective'):
        bases = [(source, 'lexical'), (f'-({source})', 'negative_np')]
        for base, family in bases:
            if base != source:
                yield base, 'np', family
            for post in postpositions:
                yield f'(({post["source"]}) * ({base}))', 'pp', 'bare_pp', [evidence(post)]
            for person in persons:
                possessed = f'({person} * ({base}))'
                yield possessed, 'np', 'possessive_np'
                for post in postpositions:
                    yield f'(({post["source"]}) * {possessed})', 'pp', 'possessive_pp', [evidence(post)]
        for affix in ('rama', 'pûera'):
            if affix in namespace:
                yield f'({affix} * ({source}))', 'np', 'nominal_tense'
    elif category == 'verb':
        # The single argument of a transitive verb is an object, not a subject.
        # Keep both structures; the engine annotations explain the distinction.
        for person in persons:
            clause = f'(+{person} * ({source}))'
            yield clause, 'clause', 'verb_clause'
            if row.get('transitive'):
                yield f'({clause} * +ae)', 'clause', 'transitive_clause'
            yield f'-({clause})', 'clause', 'negated_clause'
            if person in ('nde', 'pee'):
                yield f'{clause}.imp()', 'clause', 'imperative'
        yield f'({source}).base_nominal()', 'np', 'verbal_nominal'
        for affix in ('sara', 'saba'):
            if affix in namespace:
                yield f'({affix} * ({source}))', 'np', 'deverbal'
        for noun in nominal:
            extra = [evidence(noun)]
            for clause in (f'(({noun["source"]}) * ({source}))',
                           f'(({source}) * ({noun["source"]}))'):
                yield clause, 'clause', 'nominal_argument', extra
                if row.get('transitive'):
                    yield f'({clause} * +ae)', 'clause', 'nominal_argument', extra
        for person in persons:
            if row.get('transitive'):
                for obj in [*persons, *[name for name in ('nhe', 'nho', 'moro') if name in namespace]]:
                    clause = f'(+{person} * ({source}) * +{obj})'
                    yield clause, 'clause', 'transitive_clause'
                    yield f'-({clause})', 'clause', 'negated_clause'
                if 'nhe' in namespace:
                    yield f'(+{person} * ({source}) * nhe)', 'clause', 'reflexive_clause'
            elif 'mo' in namespace:
                yield f'(+{person} * (mo * ({source})) * +ae)', 'clause', 'causative_clause'
            clause = f'(+{person} * ({source}))'
            yield f'{clause}.perm()', 'clause', 'permissive'
            yield f'{clause}.circ()', 'clause', 'circumstantial'
