"""Read-only lexical dependencies, with exact declarations and occurrence paths.

This is source provenance, not a second grammar. Conditional helper dependencies
are explicitly candidates; only the evaluated graph can establish runtime roles.
"""
from __future__ import annotations
import ast
import copy
import hashlib
import inspect
import json
from pathlib import Path
from studio_authoring import expression_tree, parse_ast
from lexical_metadata import lexical_status


def digest(value):
    return 'sha256:' + hashlib.sha256(value.encode('utf-8')).hexdigest()


def inventory(raw, corpus, source_path, namespace, source_line=None, runtime_graph=None, evaluation=None):
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
    source_nodes, nodes_by_id = {}, {}
    def source_index(node):
        if not node:
            return
        source_nodes[(node['start'], node['end'])] = node['id']
        nodes_by_id[node['id']] = node
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
        result = {'id': lexical_id, 'name': name, 'lexicalName': name, 'kind': kind,
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
        if lexical_status(value):
            result['lexicalStatus'] = lexical_status(value)
        if hasattr(value, 'eval') and path in (corpus / 'historic/lexicon.tu.py', source_path):
            result['sharedDefinitionTarget'] = {'name': name, 'scope': 'shared' if path == corpus / 'historic/lexicon.tu.py' else 'source'}
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
        if name and name != 'studio_define' and lexical(name):
            item = entry(name)
            occurrence_id = 'occurrence:' + hashlib.sha256((fingerprint + ':' + route + ':' + item['id']).encode()).hexdigest()[:24]
            occurrence = {'id': occurrence_id, 'lexicalId': item['id'], 'name': name,
                          'path': route, 'sourceNodeId': anchor, 'direct': not stack,
                          'certainty': 'candidate' if candidate else 'source',
                          'via': list(stack), 'binding': via, 'runtimeNodeIds': [],
                          'expression': code(node, text), 'editable': False}
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
    # The inventory includes the same source steps the canvas renders, not just
    # the variable references found while expanding declarations. Engine facts
    # are supplied by one ordinary realization, never evaluated by inventory.
    evidence_nodes = {}
    def evidence_index(node):
        if not isinstance(node, dict): return
        evidence_nodes[node.get('id')] = node
        for child in node.get('children', []): evidence_index(child.get('node'))
    evidence_index((evaluation or {}).get('tree'))
    if evidence_nodes and (set(evidence_nodes) != set(nodes_by_id) or any(
            any(evidence_nodes[identifier].get(key) != node.get(key) for key in ('start', 'end', 'code', 'kind'))
            for identifier, node in nodes_by_id.items())):
        diagnostics.append('A realização pertence a outra árvore; formas e significados antigos foram omitidos.')
        evidence_nodes = {}
        evaluation = None
    for item in (evaluation or {}).get('diagnostics', []):
        if isinstance(item, dict) and item.get('message'): diagnostics.append(item['message'])
    semantic = (evaluation or {}).get('definitionContext') or {}
    diagnostics.extend(semantic.get('diagnostics', []))
    graph = (evaluation or {}).get('runtimeTree') or runtime_graph or {}

    def definition_value(syntax):
        if not (isinstance(syntax, ast.Call) and isinstance(syntax.func, ast.Name) and syntax.func.id == 'studio_define'):
            return None
        names = [part.arg for part in syntax.keywords]
        if (len(syntax.args) > 2 or any(name not in ('value', 'definition') for name in names)
                or len(set(names)) != len(names) or syntax.args and 'value' in names
                or len(syntax.args) > 1 and 'definition' in names):
            return None
        keywords = {part.arg: part.value for part in syntax.keywords}
        value = syntax.args[0] if syntax.args else keywords.get('value')
        meaning = syntax.args[1] if len(syntax.args) > 1 else keywords.get('definition')
        if value is not None and isinstance(meaning, ast.Constant) and isinstance(meaning.value, str): return value
        return None

    class MeaningTransparent(ast.NodeTransformer):
        def visit_Call(self, node):
            value = definition_value(node)
            return self.visit(value) if value is not None else self.generic_visit(node)

    def structural_identity(syntax):
        structural = MeaningTransparent().visit(copy.deepcopy(syntax))
        references = sorted({(node.id, entry(node.id)['id']) for node in ast.walk(structural)
                             if isinstance(node, ast.Name) and node.id != 'studio_define' and lexical(node.id)})
        material = json.dumps({'syntax': ast.dump(structural, include_attributes=False), 'lexicalIds': references}, sort_keys=True)
        return digest(material), structural

    def inline_scalar(node):
        syntax = parse_ast(node['code'])
        if isinstance(syntax, ast.Constant): return type(syntax.value) in (str, int, float)
        def numeric(value):
            if isinstance(value, ast.Constant): return type(value.value) in (int, float)
            return isinstance(value, ast.UnaryOp) and isinstance(value.op, (ast.UAdd, ast.USub)) and numeric(value.operand)
        return numeric(syntax)

    direct_by_source = {}
    for occurrence in occurrences:
        if occurrence['direct']: direct_by_source.setdefault(occurrence['sourceNodeId'], []).append(occurrence)
    primary = []
    meaning_observations = {}
    hidden_anchors = {}

    def project(node, depth=0, parent=None, semantic_path='root'):
        if len(primary) >= 4000:
            diagnostics.append('O inventário da árvore atingiu o limite de 4000 nós; os restantes não foram enumerados.')
            return
        syntax = parse_ast(node['code'])
        node_fingerprint, structural = structural_identity(syntax)
        meaning_value = definition_value(syntax)
        # A literal definition annotates the same visible construction. Keep
        # the outer edit span and note identity, but traverse the value's real
        # operation children without introducing a second visible level.
        body = node
        while definition_value(parse_ast(body['code'])) is not None:
            wrapped = next((child['node'] for child in body['children']
                            if child['slot'] in ('arg0', 'kw:value')), None)
            if wrapped is None: break
            hidden_anchors[wrapped['id']] = node['id']
            body = wrapped
        facts = evidence_nodes.get(node['id'], {})
        candidates = direct_by_source.get(node['id'], [])
        occurrence = next((item for item in candidates if item['name'] == node.get('lexicalReference')), None)
        if occurrence:
            item = next(item for item in entries.values() if item['id'] == occurrence['lexicalId'])
        else:
            # A local meaning wrapper remains the same underlying lexical word
            # or construction for reusable notes; each visible scope still has
            # its own occurrence and explicit meaning below.
            if (meaning_value is not None or node['kind'] == 'reference') and isinstance(structural, ast.Name) and lexical(structural.id):
                item = entry(structural.id)
            else:
                identifier = 'construction:' + node_fingerprint.removeprefix('sha256:')[:24]
                item = entries.get(identifier)
                if item is None:
                    item = {'id': identifier, 'name': node['code'][:160],
                            'kind': 'unresolved' if body['kind'] in ('hole', 'unsupported', 'reference') else 'construction',
                            'nodeKind': body['kind'], 'runtimeType': facts.get('runtimeType', ''),
                            'category': facts.get('category', ''), 'headword': facts.get('verbete') or '',
                            'definition': '', 'expression': node['code'], 'elements': [], 'occurrenceIds': [],
                            'provenance': {'sourcePath': str(source_path), 'basis': 'source-construction',
                                           'nodeFingerprint': node_fingerprint}}
                    entries[identifier] = item
            occurrence_id = 'occurrence:' + hashlib.sha256((fingerprint + ':' + node['id'] + ':' + item['id']).encode()).hexdigest()[:24]
            occurrence = {'id': occurrence_id, 'lexicalId': item['id'], 'name': item['name'],
                          'path': node['id'], 'sourceNodeId': node['id'], 'direct': True,
                          'certainty': 'source', 'via': [], 'binding': None, 'runtimeNodeIds': []}
            item['occurrenceIds'].append(occurrence_id)
        occurrence.update(nodeFingerprint=node_fingerprint,
                          noteOccurrenceId='node-occurrence:' + hashlib.sha256((node_fingerprint + ':' + semantic_path).encode()).hexdigest()[:24],
                          start=node['start'], end=node['end'], expression=node['code'], nodeKind=body['kind'],
                          label=body.get('label', body['code']), depth=depth, isRoot=parent is None,
                          parentSourceNodeId=parent,
                          editable=bool(node['capabilities'].get('edit')) and body['kind'] not in ('literal', 'hole', 'unsupported')
                                   and (body['kind'] != 'reference' or hasattr(namespace.get(body['code']), 'eval')),
                          hasDefinitionOverride=meaning_value is not None)
        occurrence['runtimeNodeIds'] = [value['id'] for value in graph.get('nodes', [])
                                        if value.get('sourceNodeId') == node['id'] or any(
                                            source.get('sourceNodeId') == node['id'] for source in value.get('sourceOccurrences', []))]
        for key in ('baseDefinition', 'compositeDefinition', 'lexicalStatus', 'evaluation', 'runtimeType', 'category'):
            if key in facts: occurrence[key] = facts[key]
        if meaning_value is not None:
            wrapped = next((child['node'] for child in node['children'] if child['slot'] in ('arg0', 'kw:value')), None)
            base = evidence_nodes.get(wrapped['id'], {}) if wrapped else {}
            for key in ('compositeDefinition', 'baseDefinition'):
                if isinstance(base.get(key), str):
                    occurrence['inheritedDefinition'] = base[key]
                    break
            else:
                # Semantic projection suppresses a primitive's old meaning
                # below its explicit override. Retain that evidenced original
                # per occurrence, without treating an operation's inherited
                # engine definition as a confirmed composite meaning.
                if isinstance(facts.get('baseDefinition'), str) and isinstance(base.get('definition'), str):
                    occurrence['inheritedDefinition'] = base['definition']
        if facts.get('evaluation', {}).get('status') == 'ok': occurrence['surface'] = facts['evaluation']['surface']
        else: occurrence.setdefault('evaluation', {'status': 'unavailable', 'message': 'Esta etapa não tem realização disponível.'})
        if item['kind'] in ('construction', 'unresolved'):
            observations = meaning_observations.setdefault(item['id'], [])
            observations.append(occurrence)
            if 'surface' in occurrence: item.setdefault('surface', occurrence['surface'])
            if occurrence.get('lexicalStatus'): item['lexicalStatus'] = occurrence['lexicalStatus']
        elif node['kind'] == 'reference':
            for key in ('baseDefinition', 'compositeDefinition', 'surface'):
                if key in occurrence: item[key] = occurrence[key]
        primary.append(occurrence)
        for child in body['children']:
            if body['kind'] in ('call', 'method') and child['slot'] != 'receiver' and inline_scalar(child['node']):
                item['elements'].append({'name': child['slot'], 'code': child['node']['code']})
                continue
            project(child['node'], depth + 1, node['id'], semantic_path + '/' + child['slot'])

    project(parsed['root'])
    for item in entries.values():
        observed = meaning_observations.get(item['id'], [])
        for key in ('baseDefinition', 'compositeDefinition'):
            if observed and all(key in occurrence and occurrence[key] == observed[0].get(key) for occurrence in observed):
                item[key] = observed[0][key]
        if item['kind'] in ('construction', 'unresolved'):
            item['definition'] = item.get('compositeDefinition', item.get('baseDefinition', ''))
        item['elements'] = list({(element['name'], element['code']): element for element in item['elements']}.values())
    primary_ids = {item['id'] for item in primary}
    dependencies = [item for item in occurrences if item['id'] not in primary_ids
                    and not (item['direct'] and item['sourceNodeId'] in hidden_anchors)]
    for occurrence in dependencies:
        occurrence['sourceNodeId'] = hidden_anchors.get(occurrence['sourceNodeId'], occurrence['sourceNodeId'])
        if occurrence['direct']:
            # References inside unsupported source syntax are dependency
            # candidates, not additional visible/editable canvas nodes.
            occurrence.update(direct=False, certainty='candidate', editable=False)
    occurrences = primary + dependencies
    visible_ids = {item['id'] for item in occurrences}
    for item in entries.values():
        item['occurrenceIds'] = [identifier for identifier in item['occurrenceIds'] if identifier in visible_ids]
    return {'version': 1, 'expressionFingerprint': fingerprint,
            'entries': sorted(entries.values(), key=lambda item: item['name']),
            'occurrences': occurrences, 'diagnostics': list(dict.fromkeys(diagnostics)),
            'provenance': {'sourcePath': str(source_path), 'sourceLine': source_line,
                           'basis': 'current-expression-and-source-declarations'}}
