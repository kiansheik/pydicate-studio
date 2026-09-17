"""Plan shared lexical declarations without changing either source file.

Spelling is a naming aid, never lexical identity. Only literal constructor leaves
(and their literal occurrence-definition wrappers) can move into the lexicon.
Every replacement retains its selected-engine predicate state and realization.
"""
from __future__ import annotations

import ast
import builtins
import inspect
import keyword
import re
import unicodedata

from authoring_runtime import CONSTRUCTORS, evaluation_snapshot, interpret, namespace_for, shape, studio_define
from rendered_structures import fingerprint, isolated_namespace
from studio_authoring import parse_ast, position


def _constructor(node):
    return (isinstance(node, ast.Call) and isinstance(node.func, ast.Name)
            and node.func.id in CONSTRUCTORS)


def contains_lexical_candidates(raw):
    return any(_constructor(node) for node in ast.walk(parse_ast(raw)))


def _literal_constructor(node):
    return (_constructor(node)
            and all(isinstance(arg, ast.Constant) and isinstance(arg.value, (str, int, float, bool, type(None)))
                    for arg in [*node.args, *(item.value for item in node.keywords)])
            and all(item.arg and not item.arg.startswith('_') for item in node.keywords))


def _candidate(node):
    if _literal_constructor(node):
        return node, None
    if (isinstance(node, ast.Call) and isinstance(node.func, ast.Name)
            and node.func.id == 'studio_define' and len(node.args) == 2 and not node.keywords
            and _literal_constructor(node.args[0])
            and isinstance(node.args[1], ast.Constant) and isinstance(node.args[1].value, str)):
        return node.args[0], node.args[1].value
    return None


def _candidates(node):
    found = _candidate(node)
    if found:
        yield node, *found
    else:
        for child in ast.iter_child_nodes(node):
            yield from _candidates(child)


def _value(node, namespace):
    return interpret(node, isolated_namespace(namespace, node), {})


def _evidence(value):
    if inspect.isclass(value) or not callable(getattr(value, 'eval', None)):
        raise ValueError('A entrada não resulta em um predicado.')
    structural = fingerprint(shape(value))
    snapshot = evaluation_snapshot(value)
    return {'structure': structural, 'surface': str(snapshot.eval()),
            'annotated': str(snapshot.eval(annotated=True))}


def _headword(constructor, value):
    for argument in constructor.keywords:
        if argument.arg in {'value', 'verbete', 'inflection_or_verbete'} and isinstance(argument.value.value, str) and argument.value.value:
            return argument.value.value
    if constructor.args and isinstance(constructor.args[0].value, str) and constructor.args[0].value:
        return constructor.args[0].value
    return re.sub(r'\[[^\]]*\]', '', str(getattr(value, 'verbete', '') or '')) or constructor.func.id.lower()


def lexical_slug(headword, constructor):
    plain = ''.join(char for char in unicodedata.normalize('NFKD', headword.casefold())
                    if not unicodedata.combining(char))
    plain = plain.translate(str.maketrans({"'": '', '’': '', 'ʼ': ''}))
    slug = re.sub(r'[^a-z0-9]+', '_', plain).strip('_')[:64]
    if not slug:
        slug = constructor.lower()
    if slug[0].isdigit() or keyword.iskeyword(slug) or keyword.issoftkeyword(slug):
        slug = 'lex_' + slug
    return slug


def _occupied(corpus, *namespaces):
    names = set(vars(builtins)) | set(keyword.kwlist) | set(keyword.softkwlist)
    for namespace in namespaces:
        names.update(namespace)
    # Also reserve future declarations and currently unresolved names: adding a
    # shared export must not silently change any existing historical expression.
    for path in sorted((corpus / 'historic').glob('*.py')):
        try:
            syntax = ast.parse(path.read_text(encoding='utf-8'))
        except (OSError, SyntaxError, UnicodeError) as error:
            raise ValueError(f'Não foi possível conferir os nomes de {path.name}; nenhuma entrada foi promovida.') from error
        for node in ast.walk(syntax):
            if isinstance(node, ast.Name):
                names.add(node.id)
            elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
                names.add(node.name)
            elif isinstance(node, ast.arg):
                names.add(node.arg)
            elif isinstance(node, ast.alias):
                names.add(node.asname or node.name.split('.')[0])
    return names


def _available_name(slug, identity, occupied):
    if slug not in occupied:
        return slug
    digest = identity.removeprefix('sha256:')
    for length in (8, 12, 16, 24, 32, 64):
        candidate = slug + '_' + digest[:length]
        if candidate not in occupied:
            return candidate
    suffix = 2
    while slug + '_' + digest + '_' + str(suffix) in occupied:
        suffix += 1
    return slug + '_' + digest + '_' + str(suffix)


def prepare_lexical_publication(payload, corpus):
    raw = payload['raw']
    syntax = parse_ast(raw)
    candidates = list(_candidates(syntax))
    result = {'raw': raw, 'declarations': [], 'reused': [], 'replacements': [], 'diagnostics': []}
    if not candidates:
        return result
    source_id = payload['sourceId']
    path = corpus / 'historic' / f'{source_id}.tu.py'
    if not isinstance(source_id, str) or path.parent != corpus / 'historic' or not path.is_file():
        raise ValueError('Fonte lexical inválida.')
    namespace = namespace_for(corpus, path, payload.get('line', 10**9))
    from historic.lexicon import load_lexicon
    shared = load_lexicon()
    shared['studio_define'] = studio_define
    occupied = _occupied(corpus, namespace, shared)
    published = dict(namespace)
    planned = {}
    reused_names = set()
    for node, constructor, override in candidates:
        expression = ast.get_source_segment(raw, constructor)
        original_expression = ast.get_source_segment(raw, node)
        try:
            original = _value(node, namespace)
            evidence = _evidence(original)
            # A source-local replacement of a constructor must not be moved to
            # the differently bound shared context under the same spelling.
            copied = _value(constructor, shared)
            if override is not None:
                copied = studio_define(copied, override)
            if _evidence(copied) != evidence:
                raise ValueError('O construtor tem outro significado no léxico compartilhado.')
        except Exception as error:
            result['diagnostics'].append(f'{constructor.func.id}: construção mantida na passagem ({str(error)[:240]}).')
            continue
        identity = fingerprint(evidence)
        headword = _headword(constructor, original)
        slug = lexical_slug(headword, constructor.func.id)
        name = planned.get(identity)
        if name is None:
            # Exact shared identity and exact target binding are both required.
            # Definition/type prefilters avoid evaluating every compound.
            matches = [key for key, value in shared.items()
                       if key.isidentifier() and not key.startswith('_') and not keyword.iskeyword(key)
                       and type(value) is type(original)
                       and getattr(value, 'definition', None) == getattr(original, 'definition', None)]
            matches.sort(key=lambda key: (key != slug, len(key), key))
            for key in matches:
                if key not in namespace:
                    continue
                try:
                    if _evidence(shared[key]) == evidence and _evidence(namespace[key]) == evidence:
                        name = key
                        break
                except Exception:
                    continue
            if name is not None:
                if name not in reused_names:
                    result['reused'].append({'name': name, 'expression': original_expression,
                                             'headword': headword, 'lexicalFingerprint': identity})
                    reused_names.add(name)
            else:
                name = _available_name(slug, identity, occupied)
                occupied.add(name)
                published[name] = copied
                result['declarations'].append({'name': name, 'expression': expression,
                                                'headword': headword, 'lexicalFingerprint': identity,
                                                **({'definitionOverride': override} if override is not None else {})})
            planned[identity] = name
        start = position(raw, node.lineno, node.col_offset)
        end = position(raw, node.end_lineno, node.end_col_offset)
        result['replacements'].append({'start': start, 'end': end, 'name': name})
    for replacement in sorted(result['replacements'], key=lambda item: item['start'], reverse=True):
        raw = raw[:replacement['start']] + replacement['name'] + raw[replacement['end']:]
    result['raw'] = raw
    if result['replacements']:
        # Component proofs remain useful for an already-failed whole analysis.
        # Where the full expression succeeds, its canonical state, plain form
        # and annotations must all survive the promotion.
        try:
            before = _evidence(_value(syntax, namespace))
        except Exception:
            result['diagnostics'].append('A expressão completa ainda não realiza; os predicados promovidos foram conferidos individualmente.')
        else:
            try:
                after = _evidence(_value(parse_ast(raw), published))
            except Exception as error:
                raise ValueError('A promoção lexical alterou a avaliação da passagem; nenhuma alteração foi preparada.') from error
            if before != after:
                raise ValueError('A promoção lexical alterou a estrutura ou a realização da passagem; nenhuma alteração foi preparada.')
    return result
