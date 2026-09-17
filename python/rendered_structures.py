"""Rendered-form reuse index, with source context and checked portable insertion.

Only successful predicate realizations enter the index. Matching text is a search
key, never a claim that two linguistic structures are equivalent.
"""
from __future__ import annotations
import ast
import copy
import hashlib
import inspect
import json
import types
import unicodedata
from pathlib import Path

from studio_authoring import expression_tree, parse_ast, source_entries

VERSION = 1


def valid_index(value):
    """Discard damaged on-disk caches; they are always rebuildable."""
    if not isinstance(value, dict) or not isinstance(value.get('entries'), list) or not isinstance(value.get('diagnostics'), list):
        return False
    for entry in value['entries']:
        if not isinstance(entry, dict) or not all(isinstance(entry.get(key), str) for key in ('id', 'surface', 'expression', '_structure')):
            return False
        if entry.get('kind') not in {'reference', 'expression'} or not isinstance(entry.get('source'), dict) or not isinstance(entry.get('sources'), list):
            return False
        if not all(isinstance(source, dict) and isinstance(source.get('label'), str) for source in [entry['source'], *entry['sources']]):
            return False
        context = entry.get('_context')
        if not isinstance(context, dict) or not isinstance(context.get('sourceId'), str) or type(context.get('line')) is not int:
            return False
        if Path(context['sourceId']).name != context['sourceId'] or context['sourceId'] in {'.', '..'} or '\\' in context['sourceId'] or not 0 < context['line'] <= 10**9:
            return False
        if any(key in entry and not isinstance(entry[key], str) for key in ('name', 'definition')):
            return False
    return all(isinstance(message, str) for message in value['diagnostics'])


def fingerprint(value):
    return 'sha256:' + hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def normalize(value, relaxed=False):
    """Keep linguistic diacritics for exact matches; spaces do not matter."""
    value = unicodedata.normalize('NFC', value).casefold().translate(str.maketrans({'’': "'", 'ʼ': "'", '‘': "'"}))
    value = ''.join(value.split())
    if relaxed:
        value = ''.join(char for char in unicodedata.normalize('NFD', value) if not unicodedata.combining(char))
    return value


def search(entries, query, limit=40):
    key = normalize(query)
    if not key:
        return {'query': query, 'results': [], 'total': 0}
    relaxed = normalize(query, True)
    ranks = {'exact': 0, 'prefix': 1, 'contains': 2, 'segment': 3, 'name': 4, 'definition': 5, 'relaxed': 6}
    matches = []
    for entry in entries:
        rendered = normalize(entry['surface'])
        match = ('exact' if key == rendered else 'prefix' if rendered.startswith(key) else
                 'contains' if key in rendered else 'segment' if len(rendered) >= 3 and rendered in key else
                 'name' if key in normalize(entry.get('name', '')) else
                 'definition' if key in normalize(entry.get('definition', '')) else
                 'relaxed' if relaxed and (relaxed in normalize(entry['surface'], True) or relaxed in normalize(entry.get('name', ''), True) or relaxed in normalize(entry.get('definition', ''), True)) else None)
        if match:
            public = {k: v for k, v in entry.items() if not k.startswith('_')}
            matches.append({**public, 'match': match})
    matches.sort(key=lambda row: (ranks[row['match']], -len(normalize(row['surface'])) if row['match'] == 'segment' else 0,
                                 row['kind'] != 'reference', len(row['surface']), len(row['expression']), row['id']))
    return {'query': query, 'results': matches[:limit], 'total': len(matches)}


def walk(root):
    yield root
    for child in root['children']:
        yield from walk(child['node'])


def isolated_namespace(namespace, syntax):
    from authoring_runtime import evaluation_snapshot
    # Copy referenced predicates before operators or eval can initialize caches.
    selected = dict(namespace)
    memo = {}
    def clone(value):
        if id(value) in memo:
            return memo[id(value)]
        if inspect.isfunction(value) and value.__module__.startswith(('historic.', 'pydicate.lang.tupilang')):
            globals_copy = dict(value.__globals__)
            closure = tuple(types.CellType(clone(cell.cell_contents)) for cell in value.__closure__) if value.__closure__ else None
            result = types.FunctionType(value.__code__, globals_copy, value.__name__, value.__defaults__, closure)
            memo[id(value)] = result
            result.__module__ = value.__module__
            result.__qualname__ = value.__qualname__
            result.__kwdefaults__ = copy.deepcopy(value.__kwdefaults__)
            for name in value.__code__.co_names:
                if name in globals_copy:
                    candidate = globals_copy[name]
                    if hasattr(candidate, 'eval') or inspect.isfunction(candidate) or isinstance(candidate, (list, dict, set, tuple)):
                        globals_copy[name] = clone(candidate)
            return result
        return evaluation_snapshot(value, memo)
    for name in {node.id for node in ast.walk(syntax) if isinstance(node, ast.Name)}:
        if name in namespace:
            selected[name] = clone(namespace[name])
    return selected


def evaluated(raw, namespace):
    from authoring_runtime import interpret, shape, evaluation_snapshot
    syntax = parse_ast(raw)
    value = interpret(syntax, isolated_namespace(namespace, syntax), {})
    if inspect.isclass(value) or not callable(getattr(value, 'eval', None)):
        raise ValueError('A estrutura não resulta em um predicado realizável.')
    structural = fingerprint(shape(value))
    return {'surface': str(evaluation_snapshot(value).eval()), 'structure': structural}


def declarations(corpus, path, line):
    """Only declarations in scope; later same-name declarations are unrelated."""
    result = {}
    for current in [corpus / 'historic/lexicon.tu.py', path]:
        text = current.read_text(encoding='utf-8')
        for statement in ast.parse(text).body:
            if current == path and statement.lineno >= line:
                break
            if isinstance(statement, ast.Assign) and not isinstance(statement.value, (ast.List, ast.Tuple, ast.Lambda)):
                for target in statement.targets:
                    if isinstance(target, ast.Name):
                        result[target.id] = {'expression': ast.get_source_segment(text, statement.value), 'line': statement.lineno, 'sourceId': current.name.removesuffix('.tu.py')}
    return result


def build(payload, corpus):
    from authoring_runtime import namespace_for, interpret, shape, capture_evaluation, evaluation_snapshot
    rows = {}
    diagnostics = []
    known = {(p['sourceId'], p['ordinal']): p for p in payload.get('passages', [])}
    declaration_seen = set()
    named_seen = set()

    def problem(source, error):
        message = f"{source}: {str(error)[:160]}"
        if message not in diagnostics and len(diagnostics) < 30:
            diagnostics.append(message)

    def add(raw, value, source, context, name=None, definition=None):
        if inspect.isclass(value) or not callable(getattr(value, 'eval', None)):
            return
        try:
            structure = fingerprint(shape(value))
            surface = str(evaluation_snapshot(value).eval())
            if not surface.strip():
                return
            syntax_key = ast.dump(parse_ast(raw), include_attributes=False)
            kind = 'reference' if isinstance(parse_ast(raw), ast.Name) else 'expression'
            identifier = fingerprint({'syntax': syntax_key, 'structure': structure, 'surface': surface})
            if identifier in rows:
                old = rows[identifier]
                if source not in old['sources']:
                    old['sources'].append(source)
                    old['occurrenceCount'] = len(old['sources'])
                # A lexicon entry is the most useful primary provenance.
                if name and not old.get('name'):
                    old.update({'name': name, 'definition': definition or '', 'source': source, '_context': context})
                return
            rows[identifier] = {'id': identifier, 'surface': surface, 'expression': raw,
                'kind': kind, 'source': source, 'sources': [source], 'occurrenceCount': 1,
                '_context': context, '_structure': structure}
            if name:
                rows[identifier]['name'] = name
            if definition:
                rows[identifier]['definition'] = definition
        except Exception as error:
            problem(source['label'], error)

    def collect(raw, namespace, source, context):
        parsed = expression_tree(raw)
        if not parsed['root'] or not parsed['capabilities']['edit']:
            problem(source['label'], 'Análise incompleta ou ainda não suportada; preservada fora do índice.')
            return
        try:
            syntax = parse_ast(raw)
            captures = {}
            value = interpret(syntax, isolated_namespace(namespace, syntax), {}, evaluations=captures)
            captures['root'] = capture_evaluation(value)
            for node in walk(parsed['root']):
                snapshot = captures.get(node['id'], {}).get('snapshot')
                if snapshot is not None:
                    add(node['code'], snapshot, {**source, 'nodeId': node['id']}, context,
                        node['code'] if node['kind'] == 'reference' else None,
                        getattr(snapshot, 'definition', None))
        except Exception as error:
            problem(source['label'], error)
            # A broken outer operation must not hide reusable working subtrees.
            for node in walk(parsed['root']):
                try:
                    syntax = parse_ast(node['code'])
                    value = interpret(syntax, isolated_namespace(namespace, syntax), {})
                    add(node['code'], value, {**source, 'nodeId': node['id']}, context,
                        node['code'] if node['kind'] == 'reference' else None,
                        getattr(value, 'definition', None))
                except Exception:
                    continue

    paths = sorted((corpus / 'historic').glob('*.tu.py')) if payload.get('includeSources', True) else []
    for path in paths:
        if path.name == 'lexicon.tu.py':
            continue
        source_id = path.name.removesuffix('.tu.py')
        try:
            entries = source_entries(path)
        except Exception as error:
            problem(source_id, error)
            continue
        # Namespace behavior only changes at assignments/helpers. Build each
        # context once; all occurrence interpretation isolates its lexical state.
        boundaries = [statement.lineno for statement in ast.parse(path.read_text(encoding='utf-8')).body
                      if isinstance(statement, (ast.Assign, ast.FunctionDef)) and not
                      (isinstance(statement, ast.Assign) and isinstance(statement.value, (ast.List, ast.Tuple)))]
        contexts = {}
        # Definitions added after the last passage are available to a new one.
        entries = [*entries, {'statementLine': 10**9, 'ordinal': None, 'expression': None}]
        for entry in entries:
            line = entry['statementLine']
            boundary = max((n for n in boundaries if n < line), default=0)
            try:
                new_context = boundary not in contexts
                if new_context:
                    contexts[boundary] = namespace_for(corpus, path, line)
                namespace = contexts[boundary]
                context = {'sourceId': source_id, 'line': line}
                passage = known.get((source_id, entry['ordinal']), {})
                source = {'sourceId': source_id, 'ordinal': entry['ordinal'], 'label': f"{source_id} · {entry['ordinal']}"}
                if passage.get('id'):
                    source['passageId'] = passage['id']
                if entry['expression'] is not None:
                    collect(entry['expression'], namespace, source, context)
                if not new_context:
                    continue
                # Every currently defined predicate and every concrete declaration
                # interior is reusable, including definitions not used in a line.
                for name, value in namespace.items():
                    if name.startswith('_') or inspect.isclass(value) or not callable(getattr(value, 'eval', None)):
                        continue
                    signature = (name, fingerprint(shape(value)))
                    if signature in named_seen:
                        continue
                    named_seen.add(signature)
                    lexical_source = {'sourceId': source_id, 'label': f'Léxico · {name}', 'name': name}
                    syntax = parse_ast(name)
                    lexical_value = interpret(syntax, isolated_namespace(namespace, syntax), {})
                    add(name, lexical_value, lexical_source, context, name, getattr(value, 'definition', None))
                for name, declaration in declarations(corpus, path, line).items():
                    if name not in namespace or not callable(getattr(namespace[name], 'eval', None)):
                        continue
                    key = (name, declaration['expression'], fingerprint(shape(namespace[name])))
                    if key in declaration_seen:
                        continue
                    declaration_seen.add(key)
                    try:
                        syntax = parse_ast(declaration['expression'])
                        actual = fingerprint(shape(interpret(syntax, isolated_namespace(namespace, syntax))))
                        expected = fingerprint(shape(namespace[name]))
                        if actual != expected:
                            continue
                        lexical_source = {'sourceId': declaration['sourceId'], 'label': f'Definição · {name}', 'name': name, 'line': declaration['line']}
                        collect(declaration['expression'], namespace, lexical_source, context)
                    except Exception:
                        continue
            except Exception as error:
                problem(source['label'] if 'source' in locals() else source_id, error)
    for draft in payload.get('drafts', []):
        source_id = draft['sourceId']
        path = corpus / 'historic' / (source_id + '.tu.py')
        line = draft.get('line', 10**9)
        try:
            namespace = namespace_for(corpus, path, line)
            context = {'sourceId': source_id, 'line': line}
            source = {'sourceId': source_id, 'passageId': draft['passageId'], 'draft': True,
                      'label': f"Rascunho · {draft.get('ordinal') or 'nova passagem'}"}
            if draft.get('fragmentId'):
                source.update(fragmentId=draft['fragmentId'], label=f"Peça solta · rascunho {draft.get('ordinal') or 'novo'}")
            if draft.get('ordinal'):
                source['ordinal'] = draft['ordinal']
            collect(draft['raw'], namespace, source, context)
        except Exception as error:
            problem('Rascunho ' + draft['passageId'], error)
    return {'entries': list(rows.values()), 'diagnostics': diagnostics}


def resolve(payload, corpus):
    from authoring_runtime import namespace_for, shape
    candidate = payload['candidate']
    context = candidate['_context']
    origin_path = corpus / 'historic' / (context['sourceId'] + '.tu.py')
    origin = namespace_for(corpus, origin_path, context['line'])
    destination = namespace_for(corpus, corpus / 'historic' / (payload['sourceId'] + '.tu.py'), payload['line'])
    expected = {'surface': candidate['surface'], 'structure': candidate['_structure']}
    raw = candidate['expression']
    if evaluated(raw, origin) != expected:
        raise ValueError('A estrutura de origem mudou. Pesquise novamente antes de inserir.')
    try:
        if evaluated(raw, destination) == expected:
            return {'expression': raw, 'surface': expected['surface'], 'kind': candidate['kind'], 'source': candidate['source'], 'copied': False}
    except Exception:
        pass
    definitions = declarations(corpus, origin_path, context['line'])

    def expand(node, active=()):
        if isinstance(node, ast.Name) and node.id in origin and callable(getattr(origin[node.id], 'eval', None)) and not inspect.isclass(origin[node.id]):
            name = node.id
            if name in destination and fingerprint(shape(origin[name])) == fingerprint(shape(destination[name])):
                return node
            if name in active or len(active) > 32 or name not in definitions:
                raise ValueError(f'A referência {name} não tem uma cópia equivalente disponível neste contexto.')
            replacement = parse_ast(definitions[name]['expression'])
            expected_reference = evaluated(name, origin)
            if evaluated(ast.unparse(replacement), origin) != expected_reference:
                # Source-local definition changes are explicit occurrence glosses.
                replacement = ast.Call(func=ast.Name(id='studio_define', ctx=ast.Load()), args=[replacement, ast.Constant(value=str(getattr(origin[name], 'definition', '')))], keywords=[])
                if evaluated(ast.unparse(replacement), origin) != expected_reference:
                    raise ValueError(f'A referência {name} mudou após sua definição; a cópia exige revisão.')
            return expand(replacement, (*active, name))
        node = copy.deepcopy(node)
        for field, value in ast.iter_fields(node):
            if isinstance(value, ast.AST):
                setattr(node, field, expand(value, active))
            elif isinstance(value, list):
                setattr(node, field, [expand(item, active) if isinstance(item, ast.AST) else item for item in value])
        return node

    expanded = ast.unparse(ast.fix_missing_locations(expand(parse_ast(raw))))
    if len(expanded) > 100000 or evaluated(expanded, origin) != expected or evaluated(expanded, destination) != expected:
        raise ValueError('Os nomes desta estrutura têm outro significado aqui. Não foi possível verificar uma cópia fiel; revise a origem antes de inserir.')
    return {'expression': expanded, 'surface': expected['surface'], 'kind': 'expression', 'source': candidate['source'], 'copied': True}
