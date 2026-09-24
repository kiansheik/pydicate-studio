"""Full, sense-preserving Navarro inventory for inverse search.

The engine's ``Predicate.iter_db_entries`` already constructs predicates from
Navarro. Its flattened records omit dictionary identities, however, and its
class filter also sees grammatical labels in examples. This adapter uses the
same selected constructors with the exact site rows already used by Studio's
dictionary picker. Verb senses are pinned to matching engine rows. Expressions
are ordinary portable constructor calls, never laboratory-only symbols.

This is a lexical snapshot, not a conjugation table. Root keys only retrieve
candidates; the selected engine still decides whether a complete analysis
realizes the observation.
"""
from __future__ import annotations

import ast
from collections import Counter
import hashlib
import inspect
from pathlib import Path
import re

from parser_lab.normalization import normalize

LEXICON_VERSION = 1
DICTIONARY_FILES = (
    'docs/dict-conjugated.json.gz',
    'pydicate/pydicate/lang/tupilang/data/dict-conjugated.json.gz',
    'pydicate/pydicate/tupi_only.db',
)
CATEGORIES = {
    'Noun': 'noun', 'ProperNoun': 'proper_noun', 'Verb': 'verb', 'Pronoun': 'pronoun',
    'Postposition': 'postposition', 'Adverb': 'adverb', 'Conjunction': 'conjunction',
    'Interjection': 'interjection', 'Particle': 'particle', 'Number': 'number',
    'Demonstrative': 'demonstrative', 'SizeSuffix': 'suffix',
}


def dictionary_fingerprints(engine_path):
    """Content identities include data outside the source-code snapshot roots."""
    result = {}
    for name in DICTIONARY_FILES:
        path = Path(engine_path) / name
        hasher = hashlib.sha256()
        if not path.is_file():
            result[name] = None
            continue
        with path.open('rb') as handle:
            while block := handle.read(1024 * 1024):
                hasher.update(block)
        result[name] = 'sha256:' + hasher.hexdigest()
    return result


def constructor_choices(definition, headword=''):
    from navarro_search import dictionary_constructor_hints, size_suffix_hint
    choices, information = dictionary_constructor_hints(definition)
    # "(v. intr. compl. posp.)" describes a verb's complement, not a second
    # lexical class. Keep genuinely separate "(posp.)" labels.
    if 'Verb' in choices and 'Postposition' in choices:
        if not any(re.match(r'^\(\s*posp\s*\.', item, re.I) for item in information):
            choices.remove('Postposition')
    size = size_suffix_hint(headword, definition)
    if size:
        choices = list(dict.fromkeys([*choices, size])) if headword == 'mirĩ' else [size]
    return choices


def _source(constructor, values):
    node = ast.Call(func=ast.Name(id=constructor, ctx=ast.Load()), args=[],
                    keywords=[ast.keyword(arg=key, value=ast.Constant(value=value))
                              for key, value in values.items()])
    return ast.unparse(ast.fix_missing_locations(node))


def _verb_key(row):
    return tuple(row.get(key, '') for key in ('f', 'o', 'd', 'v'))


def _anchor_forms(phrase):
    from parser_lab.equivalence import units
    annotated = str(phrase.copy().eval(annotated=True))
    # A source engine may emit an initial tag without a surface. Its older
    # parse_annotated_morphs loops indefinitely on that input; Studio's bounded
    # scanner tolerates it. Reading tags does not implement any morphology.
    roots = [surface.strip() for surface, tags in units(annotated) if 'ROOT' in tags]
    return [*roots, re.sub(r'\[[^\[\]]*\]', '', annotated).strip()]


def _keys_and_surface(value, headword, namespace=None):
    """Read stems from engine objects; no handwritten suffix stripping."""
    forms = [headword]
    noun = getattr(value, 'noun', None)
    if noun is not None and callable(getattr(noun, 'verbete', None)):
        forms.append(str(noun.verbete()))
    verb = getattr(value, 'verb', None)
    if isinstance(getattr(verb, 'verbete', None), str):
        forms.append(verb.verbete)
    surface = None
    try:
        # Evaluation can mutate a predicate; this private copy is never kept
        # in the namespace or reused to generate other constructions.
        surface = str(value.copy().eval())
        forms.append(surface)
    except Exception:
        pass  # A lexical root can still become complete inside a construction.
    if namespace and any(base.__name__ == 'Noun' for base in type(value).__mro__):
        # Nominal stem changes can erase the literal headword: angaîpaba →
        # angaîpápe, aíba → aígûera, poasema → xe moasema. Ask the selected
        # engine for retrieval anchors rather than guessing rewritten stems.
        for operator in ('pe', 'pûera', 'ixé'):
            if operator not in namespace:
                continue
            try:
                forms.extend(_anchor_forms(namespace[operator] * value))
            except Exception:
                continue
    if verb is not None and namespace:
        # A few engine realizations expose opaque alternations such as só →
        # kûãî and ur → îori. These anchors are not indexed phrase answers and
        # carry no completeness claim; the full expression is validated later.
        for pronoun, imperative in (('nde', True), ('ixé', False), ('ae', False)):
            subject = namespace.get(pronoun)
            if subject is None:
                continue
            try:
                phrase = +subject * value
                if imperative:
                    phrase = phrase.imp()
                forms.extend(_anchor_forms(phrase))
            except Exception:
                continue
    keys = sorted({normalize(form) for form in forms if form and normalize(form)})
    metadata = {}
    if verb is not None:
        metadata = {'transitive': bool(getattr(verb, 'transitivo', False)),
                    'secondClass': bool(getattr(verb, 'segunda_classe', False))}
    return keys, surface, metadata


def _shared_rows(engine):
    from authoring_runtime import CONSTRUCTORS
    from lexical_metadata import lexical_status
    for name in sorted(engine.lexemes()):
        value = engine.namespace[name]
        category = getattr(value, 'category', '')
        # Keep subclasses (e.g. augmentors) in their actual grammatical role.
        constructor = next((base.__name__ for base in type(value).__mro__
                            if base.__name__ in CONSTRUCTORS), None)
        category = CATEGORIES.get(constructor, category)
        headword = str(getattr(value, 'verbete', '') or '')
        keys, surface, metadata = _keys_and_surface(value, headword, engine.namespace)
        if not keys:
            continue
        yield {'id': 'shared:' + name, 'source': name, 'headword': headword,
               'category': category, 'definition': getattr(value, 'definition', '') or '',
               'keys': keys, 'origin': 'shared', **metadata,
               **({'lexicalStatus': lexical_status(value)} if lexical_status(value) else {}),
               **({'surface': surface, 'normalized': normalize(surface)} if surface else {})}


def build_lexicon(engine, progress=None, cancelled=None):
    """Return all supported shared/dictionary rows and an explicit coverage report.

    No profile inventory limit applies here. Unclassified references and failed
    constructors stay in diagnostics rather than receiving invented classes.
    """
    from authoring_runtime import callable_allowed
    from navarro_search import _site_data
    from parser_lab.jobs import Cancelled
    progress = progress or (lambda event: None)
    cancelled = cancelled or (lambda: False)
    if cancelled():
        raise Cancelled('Preparação cancelada.')
    rows = list(_shared_rows(engine))
    report = {'version': LEXICON_VERSION, 'sharedEntries': len(rows),
              'dictionaryEntries': 0, 'dictionaryRows': 0, 'indexedSenses': 0,
              'skippedSenses': 0, 'skippedByReason': {}, 'diagnostics': [],
              'sources': dictionary_fingerprints(engine.parent / 'nhe-enga')}
    try:
        fingerprint, (records, entries) = _site_data(engine.parent / 'nhe-enga')
    except (ValueError, OSError) as error:
        report['diagnostics'].append({'reason': 'dictionary-unavailable', 'message': str(error)})
        report['byCategory'] = dict(Counter(row['category'] for row in rows))
        return rows, report
    report['datasetFingerprint'] = fingerprint
    report['dictionaryEntries'] = len(entries)
    verb_module = inspect.getmodule(engine.namespace.get('Verb'))
    verb_rows = {}
    for record in getattr(verb_module, 'dict_conjugated', ()):
        if type(record.get('i')) is int and record['i'] > 0:
            verb_rows.setdefault(_verb_key(record), set()).add(record['i'])
    skipped = Counter()
    for ordinal, entry in enumerate(entries):
        if cancelled():
            raise Cancelled('Preparação cancelada.')
        if ordinal % 100 == 0:
            progress({'stage': 'lexicon', 'status': 'running', 'count': ordinal,
                      'total': len(entries), 'indexed': report['dictionaryRows']})
        descriptor = entry[-1]
        record = records[descriptor['entryIndex']]
        choices = constructor_choices(descriptor['definition'], descriptor['headword'])
        failures = []
        sense_rows = []
        for constructor in choices:
            cls = engine.namespace.get(constructor)
            if cls is None or not callable_allowed(constructor, cls) or cls.__name__ != constructor:
                failures.append('constructor-unavailable')
                continue
            values = {'inflection_or_verbete' if constructor == 'Pronoun' else 'value': descriptor['headword'],
                      'definition': descriptor['definition']}
            extra = {}
            if constructor == 'Verb':
                identities = verb_rows.get(_verb_key(record), set())
                actual = getattr(verb_module, '_DICT_BY_ID', {}).get(next(iter(identities))) if len(identities) == 1 else None
                if actual is None or _verb_key(actual) != _verb_key(record):
                    failures.append('verb-sense-unavailable')
                    continue
                values.update(verb_class=actual.get('v', ''), vid=actual['i'])
                extra.update(verbClass=values['verb_class'], engineDictionaryVid=values['vid'])
            source = _source(constructor, values)
            try:
                value = cls(**values)
                keys, surface, metadata = _keys_and_surface(value, descriptor['headword'], engine.namespace)
                if not keys:
                    raise ValueError('O predicado não expõe uma raiz pesquisável.')
            except Exception as error:
                failures.append('constructor-failed')
                if len(report['diagnostics']) < 30:
                    report['diagnostics'].append({'entryIndex': descriptor['entryIndex'],
                                                  'headword': descriptor['headword'],
                                                  'reason': 'constructor-failed',
                                                  'message': str(error)[:300]})
                continue
            sense = 'navarro:' + str(descriptor['entryIndex']) + ':' + hashlib.sha256(
                (descriptor['headword'] + '\0' + descriptor['definition']).encode()).hexdigest()[:16]
            sense_rows.append({'id': sense + ':' + constructor, 'senseId': sense,
                               'source': source, 'headword': descriptor['headword'],
                               'category': CATEGORIES[constructor], 'constructor': constructor,
                               'definition': descriptor['definition'], 'keys': keys,
                               'origin': 'navarro', 'entryIndex': descriptor['entryIndex'],
                               'optionalNumber': descriptor['optionalNumber'],
                               'datasetFingerprint': fingerprint, **extra, **metadata,
                               **({'surface': surface, 'normalized': normalize(surface)} if surface else {})})
        rows.extend(sense_rows)
        report['dictionaryRows'] += len(sense_rows)
        if sense_rows:
            report['indexedSenses'] += 1
        else:
            report['skippedSenses'] += 1
            skipped.update(set(failures) or {'unclassified-header'})
        if not sense_rows and len(report['diagnostics']) < 30:
            report['diagnostics'].append({'entryIndex': descriptor['entryIndex'],
                                          'headword': descriptor['headword'],
                                          'reason': failures[0] if failures else 'unclassified-header'})
    report['skippedByReason'] = dict(sorted(skipped.items()))
    report['byCategory'] = dict(sorted(Counter(row['category'] for row in rows).items()))
    return rows, report
