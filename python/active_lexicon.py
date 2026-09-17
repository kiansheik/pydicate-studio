"""Read-only lexical dependencies, with exact declarations and occurrence paths.

This is source provenance, not a second grammar. Conditional helper dependencies
are explicitly candidates; only the evaluated graph can establish runtime roles.
"""
from __future__ import annotations
import ast
import hashlib
import inspect
import json
from pathlib import Path
from studio_authoring import expression_tree, parse_ast


def digest(value):
    return 'sha256:' + hashlib.sha256(value.encode('utf-8')).hexdigest()


def inventory(raw, corpus, source_path, namespace, source_line=None, runtime_graph=None):
    corpus, source_path = Path(corpus), Path(source_path)
    declarations, entries, occurrences, diagnostics = {}, {}, [], []
    fingerprint = digest(raw)
    for path in (corpus / 'historic/lexicon.tu.py', source_path):
        if not path.exists():
            continue
        text = path.read_text(encoding='utf-8')
        for statement in ast.parse(text).body:
            if path == source_path and source_line and statement.lineno >= source_line:
                break
            if isinstance(statement, ast.Assign):
                for target in statement.targets:
                    if isinstance(target, ast.Name) and target.id in namespace:
                        declarations[target.id] = (statement.value, text, path, statement.lineno)
            elif isinstance(statement, ast.FunctionDef) and statement.name in namespace:
                declarations[statement.name] = (statement, text, path, statement.lineno)

    # Match explicit Studio identities when they belong to this declaration's file.
    identities = {}
    for name, (_, text, path, _) in declarations.items():
        for line in text.splitlines():
            marker = '# @note studio-lexical:v1 '
            if marker not in line:
                continue
            try:
                note = json.loads(line.split(marker, 1)[1])
                if note.get('name') == name and isinstance(note.get('id'), str):
                    identities[(str(path), name)] = note['id']
            except (ValueError, TypeError):
                pass

    parsed = expression_tree(raw)
    source_nodes = {}
    def source_index(node):
        if not node:
            return
        source_nodes[(node['start'], node['end'])] = node['id']
        for child in node['children']:
            source_index(child['node'])
    source_index(parsed['root'])
    if parsed['root'] is None:
        return {'version': 1, 'expressionFingerprint': fingerprint, 'entries': [],
                'occurrences': [], 'diagnostics': [item['message'] for item in parsed['diagnostics']]}

    def code(node, text):
        return ast.get_source_segment(text, node) or ast.unparse(node)

    def source_anchor(node, text, fallback):
        if text != raw or not hasattr(node, 'lineno'):
            return fallback
        from studio_authoring import position, u16
        start = u16(text[:position(text, node.lineno, node.col_offset)])
        end = u16(text[:position(text, node.end_lineno, node.end_col_offset)])
        return source_nodes.get((start, end), fallback)

    def lexical(name):
        value = namespace.get(name)
        return name in namespace and not name.startswith('_') and (
            hasattr(value, 'eval') and not inspect.isclass(value)
            or inspect.isfunction(value) and not name.startswith('_'))

    def entry(name):
        if name in entries:
            return entries[name]
        value = namespace[name]
        declaration = declarations.get(name)
        if declaration is None and hasattr(value, 'eval'):
            module = inspect.getmodule(type(value))
            # An engine export is attributable only by actual object identity,
            # never by a matching rendered label or constructor class name.
            if module is not None and getattr(module, name, None) is value:
                try:
                    path = Path(inspect.getsourcefile(module))
                    text = path.read_text(encoding='utf-8')
                    matches = [statement for statement in ast.parse(text).body
                               if isinstance(statement, ast.Assign) and any(isinstance(target, ast.Name) and target.id == name for target in statement.targets)]
                    if matches:
                        statement = matches[-1]
                        declaration = (statement.value, text, path, statement.lineno)
                        declarations[name] = declaration
                except (OSError, TypeError, SyntaxError):
                    pass
        if declaration is None and inspect.isfunction(value):
            try:
                text = inspect.getsource(value)
                node = ast.parse(text).body[0]
                declaration = (node, text, Path(inspect.getsourcefile(value)), inspect.getsourcelines(value)[1])
                declarations[name] = declaration
            except (OSError, TypeError, SyntaxError, IndentationError):
                pass
        node, text, path, line = declaration or (None, '', None, None)
        constructor = (isinstance(node, ast.Call) and isinstance(node.func, ast.Name)
                       and (inspect.isclass(namespace.get(node.func.id)) or node.func.id == type(value).__name__))
        kind = ('helper' if callable(value) else 'alias' if isinstance(node, ast.Name)
                else 'compound' if node is not None and not constructor
                else 'predicate')
        origin = str(path) if path else type(value).__module__
        lexical_id = identities.get((str(path), name)) or 'lexical:' + hashlib.sha256((origin + ':' + name).encode()).hexdigest()[:24]
        elements = []
        if constructor:
            for index, argument in enumerate(node.args):
                elements.append({'name': 'argumento ' + str(index + 1), 'code': code(argument, text)})
            for argument in node.keywords:
                elements.append({'name': argument.arg or '**', 'code': code(argument.value, text)})
        result = {'id': lexical_id, 'name': name, 'kind': kind,
                  'runtimeType': type(value).__name__, 'category': str(getattr(value, 'category', 'helper')),
                  'headword': str(getattr(value, 'verbete', '')),
                  'definition': str(getattr(value, 'definition', '') or ''),
                  'runtimeAttributes': {key: item for key, item in vars(value).items()
                                        if key not in {'nid', '_var_name', 'fname', 'ped_label', 'functional_gloss', '_trackable_id'}
                                        and not key.startswith('_studio') and isinstance(item, (str, int, float, bool))} if hasattr(value, '__dict__') else {},
                  'expression': code(node, text) if node is not None else name,
                  'provenance': {'sourcePath': str(path) if path else None, 'line': line,
                                 'runtimeModule': type(value).__module__, 'declarationFingerprint': digest(code(node, text)) if node is not None else None},
                  'elements': elements, 'occurrenceIds': []}
        entries[name] = result
        return result

    def walk(node, text, route, anchor, stack=(), bound=None, candidate=False, via=None):
        if len(occurrences) >= 4000 or len(stack) > 40:
            diagnostics.append('A expansão atingiu o limite; dependências restantes não foram enumeradas.')
            return
        bound = {} if bound is None else bound
        if isinstance(node, ast.Name) and node.id in bound:
            actual, actual_text, actual_route, actual_anchor, actual_bound = bound[node.id]
            walk(actual, actual_text, route + '/parameter:' + node.id, actual_anchor,
                 stack, actual_bound, candidate, {'parameter': node.id, 'argument': code(actual, actual_text)})
            return
        name = node.id if isinstance(node, ast.Name) else node.func.id if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) else None
        if name and lexical(name):
            item = entry(name)
            occurrence_id = 'occurrence:' + hashlib.sha256((fingerprint + ':' + route + ':' + item['id']).encode()).hexdigest()[:24]
            occurrence = {'id': occurrence_id, 'lexicalId': item['id'], 'name': name,
                          'path': route, 'sourceNodeId': anchor, 'direct': not stack,
                          'certainty': 'candidate' if candidate else 'source',
                          'via': list(stack), 'binding': via, 'runtimeNodeIds': []}
            occurrences.append(occurrence)
            item['occurrenceIds'].append(occurrence_id)
            if runtime_graph:
                occurrence['runtimeNodeIds'] = [n['id'] for n in runtime_graph.get('nodes', []) if name in n.get('lexicalOrigins', [])]
            if name in stack:
                diagnostics.append('Dependência cíclica preservada: ' + ' → '.join((*stack, name)))
                return
            declaration = declarations.get(name)
            if declaration:
                definition, definition_text, _, _ = declaration
                if isinstance(definition, (ast.Lambda, ast.FunctionDef)):
                    if isinstance(node, ast.Call):
                        args = definition.args
                        parameters = args.posonlyargs + args.args
                        bindings = {parameter.arg: (argument, text, route + '/arg' + str(index), source_anchor(argument, text, anchor), bound)
                                    for index, (parameter, argument) in enumerate(zip(parameters, node.args))}
                        bindings.update({argument.arg: (argument.value, text, route + '/kw:' + str(argument.arg), source_anchor(argument.value, text, anchor), bound) for argument in node.keywords if argument.arg})
                        defaults = dict(zip([parameter.arg for parameter in parameters[-len(args.defaults):]] if args.defaults else [], args.defaults))
                        defaults.update({parameter.arg: default for parameter, default in zip(args.kwonlyargs, args.kw_defaults) if default is not None})
                        for parameter, default in defaults.items():
                            bindings.setdefault(parameter, (default, definition_text, route + '/default:' + parameter, anchor, {}))
                        if args.vararg or args.kwarg or any(isinstance(argument, ast.Starred) for argument in node.args):
                            diagnostics.append('Helper ' + name + ': argumentos variáveis exigem inspeção do corpo.')
                        bodies = [definition.body] if isinstance(definition, ast.Lambda) else definition.body
                        complex_body = isinstance(definition, ast.FunctionDef) and not (len(bodies) == 1 and isinstance(bodies[0], ast.Return))
                        if complex_body:
                            diagnostics.append('Helper ' + name + ': corpo com fluxo de controle; dependências internas são candidatas, não papéis confirmados.')
                            for local in ast.walk(definition):
                                if isinstance(local, ast.Name) and isinstance(local.ctx, ast.Store):
                                    bindings.setdefault(local.id, (ast.Constant(None), 'None', route + '/local:' + local.id, anchor, {}))
                        for index, body in enumerate(bodies):
                            walk(body, definition_text, route + '/expand:' + name + '/' + str(index), anchor,
                                 (*stack, name), bindings, candidate or complex_body)
                        consumed = {part.id for body in bodies for part in ast.walk(body) if isinstance(part, ast.Name) and isinstance(part.ctx, ast.Load)}
                        for parameter, (argument, argument_text, argument_route, argument_anchor, argument_bound) in bindings.items():
                            if parameter not in consumed and argument_text == raw:
                                walk(argument, argument_text, argument_route + '/unused', argument_anchor, (*stack, name), argument_bound, candidate,
                                     {'parameter': parameter, 'argument': code(argument, argument_text)})
                        return
                else:
                    walk(definition, definition_text, route + '/expand:' + name, anchor, (*stack, name), {}, candidate)
            elif item['kind'] in ('compound', 'helper'):
                diagnostics.append('Definição de ' + name + ' indisponível; a entrada do namespace foi preservada.')
            if isinstance(node, ast.Name):
                return
        # Only expression nodes are references; formal parameters and assignment
        # targets are never promoted to lexical identities.
        for field, value in ast.iter_fields(node):
            if field in {'ctx', 'args'} and not isinstance(node, ast.Call):
                continue
            if isinstance(node, ast.Call) and field == 'func' and isinstance(value, ast.Name):
                continue
            children = value if isinstance(value, list) else [value]
            for index, child in enumerate(children):
                if not isinstance(child, ast.AST) or isinstance(child, (ast.Store, ast.Load, ast.arg)):
                    continue
                child_route = route + '/' + field + (str(index) if isinstance(value, list) else '')
                child_anchor = anchor
                if not stack:
                    child_anchor = source_anchor(child, text, anchor)
                walk(child, text, child_route, child_anchor, stack, bound, candidate)

    walk(parse_ast(raw), raw, 'root', 'root')
    return {'version': 1, 'expressionFingerprint': fingerprint,
            'entries': sorted(entries.values(), key=lambda item: item['name']),
            'occurrences': occurrences, 'diagnostics': list(dict.fromkeys(diagnostics)),
            'provenance': {'sourcePath': str(source_path), 'sourceLine': source_line,
                           'basis': 'current-expression-and-source-declarations'}}
