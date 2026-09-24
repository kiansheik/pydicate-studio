"""Scoped meanings from source operations, independent of eager morphology.

The engine may turn a verb into a fresh noun and discard its construction
history. This projection preserves that source history without changing any
predicate, realization, gloss, or morphological annotation. Declared lexical
expansions are source provenance; helper bodies are deliberately not executed.
"""
from __future__ import annotations

import ast
import hashlib
import inspect
import json

from studio_authoring import expression_tree, parse_ast


REGISTRY = '_studio_semantic_declarations'
MAX_NODES = 600
MAX_DEPTH = 40


def _version(declaration):
    material = {key: value for key, value in declaration.items() if key != '_version'}
    return hashlib.sha256(json.dumps(material, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


def declaration_current(name, declarations, active=()):
    """Whether a declaration still resolves its original dependency versions.

An engine copy may erase an intermediate definition, so equal realized object
state cannot prove that a later lexical redefinition preserved those scopes.
    """
    declaration = declarations.get(name)
    if declaration is None or name in active or len(active) >= MAX_DEPTH:
        return False
    for dependency, expected in declaration.get('_dependencies', {}).items():
        current = declarations.get(dependency)
        if (current is None or current.get('_version') != expected
                or not declaration_current(dependency, declarations, (*active, name))):
            return False
    return True


def register_declarations(namespace, statements, source_path):
    """Remember only public declarations and explicit literal meaning scopes."""
    declarations = dict(namespace.get(REGISTRY, {}))
    for statement in statements:
        if isinstance(statement, (ast.FunctionDef, ast.AsyncFunctionDef)):
            if not statement.name.startswith('_'):
                declarations[statement.name] = {
                    'kind': 'helper', 'sourcePath': str(source_path),
                    'line': statement.lineno,
                }
                declarations[statement.name]['_version'] = _version(declarations[statement.name])
        elif isinstance(statement, ast.Assign):
            for target in statement.targets:
                if isinstance(target, ast.Name) and not target.id.startswith('_'):
                    if isinstance(statement.value, (ast.List, ast.Tuple)):
                        continue
                    declaration = {
                        'kind': 'helper' if isinstance(statement.value, ast.Lambda) else 'expression',
                        'expression': ast.unparse(statement.value),
                        'sourcePath': str(source_path), 'line': statement.lineno,
                        '_dependencies': {name: declarations[name].get('_version')
                                          for name in {node.id for node in ast.walk(statement.value)
                                                       if isinstance(node, ast.Name)}
                                          if name in declarations},
                    }
                    declaration['_version'] = _version(declaration)
                    declarations[target.id] = declaration
                elif (isinstance(target, ast.Attribute) and target.attr == 'definition'
                      and isinstance(target.value, ast.Name)
                      and isinstance(statement.value, ast.Constant)
                      and isinstance(statement.value.value, str)
                      and target.value.id in declarations):
                    declarations[target.value.id] = {
                        **declarations[target.value.id],
                        'definitionOverride': statement.value.value,
                        'definitionLine': statement.lineno,
                    }
                    declarations[target.value.id]['_version'] = _version(declarations[target.value.id])
    namespace[REGISTRY] = declarations


def _definition_call(syntax):
    if not (isinstance(syntax, ast.Call) and isinstance(syntax.func, ast.Name)
            and syntax.func.id == 'studio_define'):
        return None
    keywords = {item.arg: item.value for item in syntax.keywords}
    value = syntax.args[0] if syntax.args else keywords.get('value')
    definition = syntax.args[1] if len(syntax.args) > 1 else keywords.get('definition')
    if value is not None and isinstance(definition, ast.Constant) and isinstance(definition.value, str):
        return value, definition.value
    return None


def _scoped_definition(syntax, declarations, active=(), max_depth=MAX_DEPTH):
    """Read an explicit definition through transparent copies and aliases."""
    defined = _definition_call(syntax)
    if defined:
        return defined[1]
    if isinstance(syntax, ast.Call) and isinstance(syntax.func, ast.Attribute) and syntax.func.attr == 'copy':
        return _scoped_definition(syntax.func.value, declarations, active, max_depth)
    if isinstance(syntax, ast.Name):
        name = syntax.id
        declaration = declarations.get(name)
        if not declaration or declaration['kind'] == 'helper' or name in active or len(active) >= max_depth:
            return None
        if 'definitionOverride' in declaration:
            return declaration['definitionOverride']
        if not declaration_current(name, declarations):
            return None
        return _scoped_definition(parse_ast(declaration['expression']), declarations, (*active, name), max_depth)
    return None


def declaration_meaning(name, declarations):
    """Expected explicit literal meaning, or None; never execute source helpers.

Callers can compare this with the actual predicate's definition to detect a
mutation through an alias that the target's own source record cannot represent.
    """
    return _scoped_definition(ast.Name(id=name, ctx=ast.Load()), declarations)


def attach_definition_context(tree, namespace, runtime_graph=None, *, max_nodes=MAX_NODES,
                              max_depth=MAX_DEPTH):
    """Annotate source cards and return a bounded, JSON-safe semantic hierarchy.

``definition`` remains the engine's compatibility field. ``baseDefinition`` is
the effective meaning of a lexical leaf; ``compositeDefinition`` appears only
at an explicit whole-construction definition. Inherited engine definitions on
operations never masquerade as newly defined composite meanings.
    """
    from authoring_runtime import CONSTRUCTORS, interpret, shape
    from rendered_structures import isolated_namespace

    declarations = namespace.get(REGISTRY, {})
    diagnostics = []
    count = 0
    truncated = False
    expansions = {}

    def problem(message, limit=False):
        nonlocal truncated
        if message not in diagnostics:
            diagnostics.append(message)
        truncated = truncated or limit

    def primitive(syntax, active=()):
        if isinstance(syntax, ast.Name):
            name = syntax.id
            declaration = declarations.get(name)
            if not declaration:
                value = namespace.get(name)
                return hasattr(value, 'eval') and not inspect.isclass(value)
            if name in active or len(active) >= max_depth or declaration['kind'] == 'helper':
                return False
            if not declaration_current(name, declarations):
                return False
            return primitive(parse_ast(declaration['expression']), (*active, name))
        if isinstance(syntax, ast.Call):
            if isinstance(syntax.func, ast.Name) and syntax.func.id in CONSTRUCTORS:
                return True
            defined = _definition_call(syntax)
            if defined:
                return primitive(defined[0], active)
            if isinstance(syntax.func, ast.Attribute) and syntax.func.attr == 'copy':
                return primitive(syntax.func.value, active)
        return False

    def evaluated_declaration(name, declaration):
        if name in expansions:
            return expansions[name]
        if not declaration_current(name, declarations):
            problem(f'{name}: dependências redefinidas após a declaração; expansão semântica omitida.')
            expansions[name] = None
            return None
        expression = declaration['expression']
        syntax = parse_ast(expression)
        # Calling an arbitrary trusted helper here would repeat its side effects
        # and imply its source branches all executed. Preserve the declared scope
        # without that expansion instead.
        unsupported = [node.func.id for node in ast.walk(syntax)
                       if isinstance(node, ast.Call) and isinstance(node.func, ast.Name)
                       and node.func.id not in CONSTRUCTORS | {'studio_define'}]
        if unsupported:
            problem(f'{name}: construção por helper não expandida ({", ".join(sorted(set(unsupported)))}).')
            expansions[name] = None
            return None
        parsed = expression_tree(expression)
        root = parsed.get('root')
        if not root or not parsed['capabilities']['edit']:
            problem(f'{name}: declaração preservada sem expansão semântica executável.')
            expansions[name] = None
            return None
        cards = {}
        try:
            reconstructed = interpret(syntax, isolated_namespace(namespace, syntax), cards)
            actual_shape = shape(namespace.get(name))
            reconstructed_shape = shape(reconstructed)
            # A later rebinding can make the old declaration mean something
            # different in today's namespace. Root definition assignments are
            # explicit scopes; all remaining state must still agree.
            if isinstance(actual_shape, dict):
                actual_shape.pop('definition', None)
            if isinstance(reconstructed_shape, dict):
                reconstructed_shape.pop('definition', None)
            if actual_shape != reconstructed_shape:
                problem(f'{name}: a declaração tem outro estado no contexto atual; expansão semântica omitida.')
                expansions[name] = None
                return None
        except Exception as error:
            problem(f'{name}: significado da declaração não pôde ser conferido ({type(error).__name__}).')
            expansions[name] = None
            return None

        def annotate(node):
            node.update(cards.get(node['id'], {}))
            for child in node['children']:
                annotate(child['node'])
        annotate(root)
        expansions[name] = root
        return root

    def visit(node, depth=0, active=(), source=True, suppress_base=False):
        nonlocal count
        if count >= max_nodes or depth >= max_depth:
            problem('O contexto de significados atingiu o limite de expansão; partes restantes não foram enumeradas.', True)
            return None
        count += 1
        result = {'kind': node['kind'], 'label': node.get('label', node.get('code', '')),
                  'children': []}
        if source:
            result['sourceNodeId'] = node['id']
            for key in ('start', 'end'):
                if key in node:
                    result[key] = node[key]
        for field in ('lexicalStatus',):
            if node.get(field):
                result[field] = node[field]
        syntax = parse_ast(node['code'])
        defined = _definition_call(syntax)
        leaf = primitive(syntax)
        explicit = defined[1] if defined else None
        if explicit is not None:
            key = 'baseDefinition' if leaf else 'compositeDefinition'
            result[key] = explicit
            if source:
                node[key] = explicit
        elif leaf and not suppress_base and isinstance(node.get('definition'), str):
            result['baseDefinition'] = node['definition']
            if source:
                node['baseDefinition'] = node['definition']

        if isinstance(syntax, ast.Name):
            name = syntax.id
            declaration = declarations.get(name)
            if declaration:
                result['provenance'] = {key: declaration[key] for key in
                                        ('sourcePath', 'line', 'definitionLine') if key in declaration}
                result['provenance'].update(name=name, certainty='source')
                if declaration['kind'] == 'helper':
                    problem(f'{name}: corpo do helper não expandido no contexto de significados.')
                elif name in active:
                    problem('Dependência semântica cíclica preservada: ' + ' → '.join((*active, name)), True)
                elif not leaf:
                    override = declaration_meaning(name, declarations)
                    if override is not None and node.get('definition') != override:
                        problem(f'{name}: o significado atual diverge da definição declarada; expansão semântica omitida.')
                        return result
                    if override is not None:
                        result['compositeDefinition'] = override
                        if source:
                            node['compositeDefinition'] = override
                    expanded = evaluated_declaration(name, declaration)
                    if expanded:
                        child = visit(expanded, depth + 1, (*active, name), False)
                        if child:
                            result['children'].append({'role': 'declaration', 'node': child})
            return result

        # Scalar constructor properties are already represented by its effective
        # lexical meaning; they are not additional semantic constituents.
        if isinstance(syntax, ast.Call) and isinstance(syntax.func, ast.Name) and syntax.func.id in CONSTRUCTORS:
            return result
        for child in node['children']:
            if defined and child['slot'] in ('arg1', 'kw:definition'):
                continue
            projected = visit(child['node'], depth + 1, active, source,
                              suppress_base or bool(defined and leaf))
            if projected:
                result['children'].append({'role': child['slot'], 'node': projected})
        return result

    # Caller-owned source nodes are annotated only in the new explicit fields.
    root = visit(tree) if tree else None
    if runtime_graph:
        source_nodes = {}
        def collect(node):
            source_nodes[node['id']] = node
            for child in node.get('children', []):
                collect(child['node'])
        collect(tree)
        for node in runtime_graph.get('nodes', []):
            scope = source_nodes.get(node.get('sourceNodeId'))
            if scope:
                for key in ('baseDefinition', 'compositeDefinition'):
                    if key in scope:
                        node[key] = scope[key]
    return {'version': 1, 'root': root, 'diagnostics': diagnostics, 'truncated': truncated}
