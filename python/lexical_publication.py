"""Plan shared lexical declarations without changing either source file.

Spelling is a naming aid, never lexical identity. Literal leaves and explicitly defined compositions can move into the lexicon.
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
    return any(_constructor(node) or _defined(node) for node in ast.walk(parse_ast(raw)))


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
    # Source execution references lexical objects directly. Passing a cards
    # collector would invoke the UI-only occurrence copy, whose internal noun
    # self-links need not match a fresh constructor despite identical grammar.
    return interpret(node, isolated_namespace(namespace, node))


def _evidence(value):
    if inspect.isclass(value) or not callable(getattr(value, 'eval', None)):
        raise ValueError('A entrada não resulta em um predicado.')
    structural = fingerprint(shape(value))
    snapshot = evaluation_snapshot(value)
    result = {'structure': structural}
    stage = 'surface'
    try:
        result['surface'] = str(snapshot.eval())
        stage = 'annotated'
        result['annotated'] = str(snapshot.eval(annotated=True))
        result['evaluationStatus'] = 'complete'
    except Exception as error:
        # Some lexical types only realize when attached. Their exact state and
        # matching isolated failure are still stronger evidence than spelling.
        result.update(evaluationStatus='partial', error={
            'type': type(error).__module__ + '.' + type(error).__qualname__,
            'stage': stage, 'message': str(error)})
    return result


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



def _defined(node):
    return (isinstance(node, ast.Call) and isinstance(node.func, ast.Name)
            and node.func.id == 'studio_define' and len(node.args) == 2 and not node.keywords
            and isinstance(node.args[1], ast.Constant) and isinstance(node.args[1].value, str))


def _grammar(value):
    def clean(item):
        if isinstance(item, dict): return {k: clean(v) for k, v in item.items() if k not in {'definition','functional_definition','raw_definition'}}
        if isinstance(item, list): return [clean(v) for v in item]
        return item
    evidence = _evidence(value)
    return {**evidence, 'structure': fingerprint(clean(shape(value)))}


def define_composition(payload, corpus):
    """Explicit human action: attach meaning to this whole copied structure.

    Optional base restoration requires identical grammar and unambiguous shared
    meaning. It never rewrites a shared entry or infers equivalence from spelling.
    """
    raw = payload['raw']; syntax = parse_ast(raw)
    if _defined(syntax):
        raw = ast.get_source_segment(raw, syntax.args[0]); syntax = parse_ast(raw)
    definition = payload['definition']
    if not isinstance(definition, str) or not definition.strip(): raise ValueError('Informe o significado da composição.')
    namespace = namespace_for(corpus, corpus/'historic'/f"{payload['sourceId']}.tu.py", payload.get('line', 10**9))
    from historic.lexicon import load_lexicon
    shared = load_lexicon(); restored = []; replacements = []
    if payload.get('reuseBaseDefinitions', False):
        for node, constructor, override in _candidates(syntax):
            original = _value(node, namespace)
            matches = []
            for name, value in shared.items():
                if name.startswith('_') or not name.isidentifier() or name not in namespace or type(value) is not type(original): continue
                if getattr(value, 'verbete', None) != getattr(original, 'verbete', None): continue
                if _grammar(value) == _grammar(original) and _evidence(value) == _evidence(namespace[name]): matches.append(name)
            if not matches:
                from navarro_search import dictionary_lookup, dictionary_entry
                from authoring_runtime import dictionary_predicate
                headword = _headword(constructor, original)
                entries = dictionary_lookup(corpus.parent/'nhe-enga', {'query':headword,'limit':40})
                choices = []
                for entry in entries['results']:
                    if entry['headword'] != headword or entry.get('suggestedConstructor') != type(original).__name__: continue
                    descriptor, record = dictionary_entry(corpus.parent/'nhe-enga',entry)
                    candidate = dictionary_predicate({'entry':descriptor,'entryRecord':record,'constructor':type(original).__name__}, namespace)
                    if candidate.get('status') == 'ready' and _grammar(_value(parse_ast(candidate['expression']),namespace)) == _grammar(original):
                        choices.append((candidate['expression'],descriptor))
                if len(choices)>1: raise ValueError('Há mais de uma acepção no dicionário. Escolha a peça pela busca antes de definir o conjunto.')
                if not choices: continue
                replacement, entry = choices[0]
                replacements.append((position(raw,node.lineno,node.col_offset),position(raw,node.end_lineno,node.end_col_offset),replacement))
                restored.append({'name':headword,'before':getattr(original,'definition',''),'after':entry['definition'],'dictionary':entry})
                continue
            exact = [name for name in matches if _evidence(shared[name]) == _evidence(original)]
            if exact: matches = exact
            if len({getattr(shared[name], 'definition', '') for name in matches}) > 1:
                raise ValueError('Há mais de uma acepção para esta peça. Selecione a entrada no léxico antes de definir o conjunto.')
            name = min(matches, key=lambda name: (len(name), name))
            replacements.append((position(raw,node.lineno,node.col_offset),position(raw,node.end_lineno,node.end_col_offset),name))
            restored.append({'name':name,'before':getattr(original,'definition',''),'after':getattr(shared[name],'definition','')})
    for start,end,name in sorted(replacements,reverse=True): raw = raw[:start]+name+raw[end:]
    return {'raw':f'studio_define(({raw}), {definition!r})', 'restored':restored}


def _repair_misplaced_compound_definition(payload, corpus, namespace):
    """Repair only an evidenced old compound gloss attached to a literal base.

    The whole expression must realize an exact dictionary headword; the leaf's
    gloss must be that entry's complete definition (optionally followed by the
    old explicit compound note). This is a reviewable semantic correction, not
    lexical equivalence inferred from a similar spelling or an inherited gloss.
    """
    raw = payload['raw']; syntax = parse_ast(raw)
    if _defined(syntax) or _candidate(syntax): return raw, []
    candidates = list(_candidates(syntax))
    if not candidates: return raw, []
    try:
        original = _value(syntax, namespace); evidence = _evidence(original)
    except Exception: return raw, []
    if evidence['evaluationStatus'] != 'complete' or not evidence.get('surface'): return raw, []
    from navarro_search import dictionary_lookup
    # Short-circuit unknown data without changing ordinary custom definitions.
    try: entries = dictionary_lookup(corpus.parent/'nhe-enga', {'query':evidence['surface'],'limit':40})['results']
    except ValueError: return raw, []
    normalized = lambda text: ' '.join(unicodedata.normalize('NFC', text).split())
    replacements = []; repairs = []; definitions = set()
    for node, constructor, override in candidates:
        if override is not None: continue  # Explicitly scoped meanings are not legacy corruption.
        leaf = _value(node, namespace)
        definition = getattr(leaf, 'definition', '')
        if not isinstance(definition, str): continue
        headword = _headword(constructor, leaf)
        if headword == evidence['surface']: continue
        matches = [entry for entry in entries if entry['headword'] == evidence['surface'] and
                   (normalized(definition) == normalized(entry['definition']) or
                    normalized(definition).startswith(normalized(entry['definition']) + '; definição do composto '))]
        if not matches: continue
        if len({entry['definition'] for entry in matches}) != 1:
            raise ValueError('O significado parece pertencer ao conjunto, mas há mais de uma acepção. Defina o significado do conjunto na árvore antes de publicar.')
        # Restore just the affected literal, never unrelated draft definitions.
        leaf_raw = ast.get_source_segment(raw, node)
        restored = define_composition({**payload, 'raw':leaf_raw, 'definition':definition,
                                       'reuseBaseDefinitions':True}, corpus)
        if len(restored['restored']) != 1 or restored['restored'][0]['after'] == definition:
            raise ValueError('O significado do conjunto está em uma peça, mas seu sentido individual não pôde ser restaurado. Escolha essa peça no léxico antes de publicar.')
        restored_ast = parse_ast(restored['raw'])
        replacement = ast.get_source_segment(restored['raw'], restored_ast.args[0])
        replacements.append((position(raw,node.lineno,node.col_offset),position(raw,node.end_lineno,node.end_col_offset),replacement))
        definitions.add(definition)
        repairs.append({'base':headword,'compound':evidence['surface'],'before':definition,
                        'baseDefinition':restored['restored'][0]['after'],
                        'compoundDefinition':definition,
                        'dictionary':matches[0], 'baseEvidence':restored['restored'][0]})
    if not repairs: return raw, []
    if len(definitions) != 1:
        raise ValueError('As peças contêm definições diferentes do conjunto. Escolha o significado do conjunto na árvore antes de publicar.')
    for start,end,replacement in sorted(replacements,reverse=True): raw=raw[:start]+replacement+raw[end:]
    if _grammar(original) != _grammar(_value(parse_ast(raw), namespace)):
        raise ValueError('A correção do significado alteraria a gramática ou a realização. O rascunho foi preservado.')
    raw=f'studio_define(({raw}), {next(iter(definitions))!r})'
    # The explicit copy changes engine-internal noun self-links. Prove the base
    # correction above before copying; then require identical realized evidence.
    copied = _evidence(_value(parse_ast(raw), namespace))
    if any(copied.get(key) != evidence.get(key) for key in ('evaluationStatus','surface','annotated')):
        raise ValueError('A definição do conjunto alteraria sua realização. O rascunho foi preservado.')
    return raw, repairs


def _promote_composites(result, namespace, shared, published, occupied):
    # Innermost first: a larger composition may reference a smaller new entry.
    while True:
        raw = result['raw']
        wrappers = [node for node in ast.walk(parse_ast(raw)) if _defined(node)]
        if not wrappers: return
        node = wrappers[-1]
        expression = ast.get_source_segment(raw, node.args[0])
        definition = node.args[1].value
        original = _value(node, published); evidence = _evidence(original)
        if evidence['evaluationStatus'] != 'complete': raise ValueError('Avalie a composição completa antes de registrá-la no léxico.')
        try: copied = studio_define(_value(node.args[0], shared), definition)
        except Exception as error: raise ValueError('A composição usa uma peça local indisponível no léxico compartilhado. Registre essa peça primeiro.') from error
        if _evidence(copied) != evidence: raise ValueError('A composição tem outro significado no léxico compartilhado.')
        identity = fingerprint(evidence); headword = evidence['surface']; slug = lexical_slug(headword, 'composicao')
        matches = [name for name,value in shared.items() if name.isidentifier() and not name.startswith('_')
                   and name in published and type(value) is type(original)
                   and getattr(value,'definition',None)==definition
                   and _evidence(value)==evidence and _evidence(published[name])==evidence]
        if matches:
            name = min(matches,key=lambda name:(name!=slug,len(name),name))
            if not any(item['name']==name for item in result['reused']):
                result['reused'].append({'name':name,'headword':headword,'definition':definition,'lexicalFingerprint':identity,'kind':'composition'})
        else:
            name = _available_name(slug,identity,occupied); occupied.add(name)
            result['declarations'].append({'name':name,'expression':f'({expression}).copy()',
                'definitionOverride':definition,'definition':definition,'headword':headword,
                'lexicalFingerprint':identity,'kind':'composition'})
            published[name] = copied; shared[name] = copied
        start=position(raw,node.lineno,node.col_offset); end=position(raw,node.end_lineno,node.end_col_offset)
        result['raw']=raw[:start]+name+raw[end:]
        result['replacements'].append({'start':start,'end':end,'name':name})


def prepare_lexical_publication(payload, corpus):
    raw = payload['raw']
    syntax = parse_ast(raw)
    candidates = list(_candidates(syntax))
    result = {'raw': raw, 'declarations': [], 'reused': [], 'replacements': [], 'diagnostics': [], 'unpromoted': []}
    if not candidates and not contains_lexical_candidates(raw):
        return result
    source_id = payload['sourceId']
    path = corpus / 'historic' / f'{source_id}.tu.py'
    if not isinstance(source_id, str) or path.parent != corpus / 'historic' or not path.is_file():
        raise ValueError('Fonte lexical inválida.')
    namespace = namespace_for(corpus, path, payload.get('line', 10**9))
    raw, repairs = _repair_misplaced_compound_definition(payload, corpus, namespace)
    if repairs:
        syntax = parse_ast(raw); candidates = list(_candidates(syntax)); result['raw'] = raw
        result['definitionRepairs'] = repairs
        result['diagnostics'].append('O significado do conjunto foi separado do significado de suas peças nesta revisão.')
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
            reason = f'{constructor.func.id}: construção mantida na passagem ({str(error)[:240]}).'
            result['diagnostics'].append(reason)
            result['unpromoted'].append({'expression': original_expression, 'reason': reason})
            continue
        identity = fingerprint(evidence)
        headword = _headword(constructor, original)
        definition = getattr(original, 'definition', '')
        if not isinstance(definition, str):
            definition = ''
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
                                             'headword': headword, 'definition': definition,
                                             'lexicalFingerprint': identity})
                    reused_names.add(name)
            else:
                name = _available_name(slug, identity, occupied)
                occupied.add(name)
                published[name] = copied
                shared[name] = copied
                result['declarations'].append({'name': name, 'expression': expression,
                                                'headword': headword, 'definition': definition,
                                                'lexicalFingerprint': identity,
                                                **({'definitionOverride': override} if override is not None else {})})
            planned[identity] = name
        start = position(raw, node.lineno, node.col_offset)
        end = position(raw, node.end_lineno, node.end_col_offset)
        result['replacements'].append({'start': start, 'end': end, 'name': name})
    for replacement in sorted(result['replacements'], key=lambda item: item['start'], reverse=True):
        raw = raw[:replacement['start']] + replacement['name'] + raw[replacement['end']:]
    result['raw'] = raw
    _promote_composites(result, namespace, shared, published, occupied)
    raw = result['raw']
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
            if before['evaluationStatus'] == 'partial':
                result['diagnostics'].append('A expressão completa ainda não realiza; sua estrutura e a falha de avaliação foram preservadas.')
    return result
