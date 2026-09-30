"""Guarded edits of a named declaration; candidates never execute as source code."""
from __future__ import annotations

import ast
from collections import Counter
import hashlib
import io
from pathlib import Path
import tokenize

from studio_authoring import METHODS, parse_ast, position


def fingerprint(data):
    return 'sha256:' + hashlib.sha256(data).hexdigest()


def module_bindings(tree):
    """Count explicit module bindings without treating function locals as aliases."""
    found = Counter()
    class Bindings(ast.NodeVisitor):
        def visit_Name(self, node):
            if isinstance(node.ctx, (ast.Store, ast.Del)):
                found[node.id] += 1

        def visit_FunctionDef(self, node):
            found[node.name] += 1
            # Defaults and decorators execute in the outer scope; the function
            # body and argument names do not declare module variables.
            for value in (*node.decorator_list, *node.args.defaults,
                          *(value for value in node.args.kw_defaults if value is not None)):
                self.visit(value)

        visit_AsyncFunctionDef = visit_FunctionDef

        def visit_ClassDef(self, node):
            found[node.name] += 1
            for value in (*node.decorator_list, *node.bases,
                          *(keyword.value for keyword in node.keywords)):
                self.visit(value)

        def visit_Lambda(self, node):
            for value in (*node.args.defaults,
                          *(value for value in node.args.kw_defaults if value is not None)):
                self.visit(value)

        def visit_Import(self, node):
            for alias in node.names:
                found[alias.asname or alias.name.split('.')[0]] += 1

        def visit_ImportFrom(self, node):
            for alias in node.names:
                # A star import supplies the initial namespace, not a concrete
                # authored declaration address for any particular lexical name.
                if alias.name != '*':
                    found[alias.asname or alias.name] += 1

        def visit_ExceptHandler(self, node):
            if node.name:
                found[node.name] += 1
            self.generic_visit(node)

    Bindings().visit(tree)
    return found


def edit_target(corpus, entry):
    """Expose only the exact declaration resolved by the selected passage."""
    unsupported = {'editable': False, 'reason': 'Esta peça é definida pelo motor; sua árvore não tem uma atribuição editável no corpus.'}
    if entry.get('kind') == 'helper':
        return {'editable': False, 'reason': 'Este helper tem parâmetros ou código próprio; não é uma árvore lexical editável.'}
    origin = entry.get('sourcePath')
    if not origin or not entry.get('line'):
        return unsupported
    path = Path(origin).resolve()
    historic = (Path(corpus) / 'historic').resolve()
    if path.parent != historic or not path.name.endswith('.tu.py'):
        return unsupported
    before = path.read_bytes()
    tree = ast.parse(before.decode('utf-8'))
    target = next((node for node in tree.body
                   if node.lineno == entry['line']), None)
    if not (isinstance(target, ast.Assign) and len(target.targets) == 1
            and isinstance(target.targets[0], ast.Name)
            and target.targets[0].id == entry['name']
            and not isinstance(target.value, ast.Lambda)):
        return {'editable': False, 'reason': 'A declaração usa uma atribuição múltipla ou outro formato que precisa de revisão no código.'}
    text = before.decode('utf-8')
    expression = ast.get_source_segment(text, target.value)
    scope = 'shared' if path.name == 'lexicon.tu.py' else 'source'
    identity = fingerprint((path.name + ':' + str(target.lineno) + ':' + entry['name']).encode())
    storage = (fingerprint(('definition-draft:' + path.name + ':' + entry['name']).encode())
               if module_bindings(tree)[entry['name']] == 1 else identity)
    return {'editable': True, 'name': entry['name'], 'expression': expression,
            'sourceFingerprint': fingerprint(before),
            'declarationId': identity, 'storageId': storage,
            'scope': scope, 'sourceId': path.name.removesuffix('.tu.py'), 'line': target.lineno}


def declaration_namespace(corpus, source_id, line):
    from authoring_runtime import namespace_for, studio_define
    from lexical_metadata import restore_namespace_lexical_status
    from semantic_context import register_declarations
    path = corpus / 'historic' / (source_id + '.tu.py')
    if source_id != 'lexicon':
        return namespace_for(corpus, path, line)
    # Loading the full lexicon here would admit later definitions, making an
    # apparently valid replacement fail when Python imports the actual file.
    # Only original, trusted statements preceding this declaration execute.
    statements = [node for node in ast.parse(path.read_text(encoding='utf-8')).body
                  if node.lineno < line]
    namespace = {'__name__': 'historic._studio_definition_context',
                 '__package__': 'historic', '__file__': str(path)}
    exec(compile(ast.Module(body=statements, type_ignores=[]), str(path), 'exec'), namespace)
    namespace['studio_define'] = studio_define
    restore_namespace_lexical_status(namespace, statements)
    register_declarations(namespace, statements, path)
    return namespace


def validate_candidate(raw, namespace):
    """Validate every branch before a candidate can ever enter a staged file."""
    from authoring_runtime import BINARY, callable_allowed
    def visit(node):
        if isinstance(node, ast.Name):
            # Slots remain useful in a private edit; publication rejects them.
            if node.id.startswith('_') and not node.id.startswith('__studio_slot_'):
                raise ValueError('Referências privadas não são permitidas.')
        elif isinstance(node, ast.Constant) and isinstance(node.value, (str, int, float, bool, type(None))):
            pass
        elif isinstance(node, ast.BinOp) and type(node.op) in BINARY:
            visit(node.left); visit(node.right)
        elif isinstance(node, ast.UnaryOp) and isinstance(node.op, (ast.UAdd, ast.USub)):
            visit(node.operand)
        elif isinstance(node, ast.Compare) and len(node.ops) == 1 and type(node.ops[0]) in BINARY:
            visit(node.left); visit(node.comparators[0])
        elif isinstance(node, ast.Call) and isinstance(node.func, (ast.Name, ast.Attribute)):
            if isinstance(node.func, ast.Name):
                if not callable_allowed(node.func.id, namespace.get(node.func.id)):
                    raise ValueError('Chamada não permitida neste ponto da definição: ' + node.func.id)
            else:
                if node.func.attr not in METHODS:
                    raise ValueError('Método não permitido na árvore: ' + node.func.attr)
                visit(node.func.value)
            for argument in node.args:
                visit(argument)
            for keyword in node.keywords:
                if keyword.arg is None or keyword.arg.startswith('_'):
                    raise ValueError('Expansão ou argumento privado não permitido.')
                visit(keyword.value)
        else:
            raise ValueError('Esta construção não é uma expressão Pydicate editável: ' + type(node).__name__)
    visit(parse_ast(raw))


def evaluate(payload, corpus):
    from authoring_runtime import realize
    namespace = declaration_namespace(corpus, payload['declarationSourceId'], payload['declarationLine'])
    validate_candidate(payload['raw'], namespace)
    return realize(payload['raw'], namespace, payload.get('includeMorphology', False))


def replace_expression(text, target, raw):
    start = position(text, target.value.lineno, target.value.col_offset)
    end = position(text, target.value.end_lineno, target.value.end_col_offset)
    if text[start:end] == raw:
        return text
    def comments(value):
        return [token.string for token in tokenize.generate_tokens(io.StringIO(value).readline)
                if token.type == tokenize.COMMENT]
    existing = Counter(comments(raw))
    preserved = []
    for comment in comments(text[start:end]):
        if existing[comment]:
            existing[comment] -= 1
        else:
            preserved.append(comment)
    replacement = '(\n' + raw + '\n' + ''.join(comment + '\n' for comment in preserved) + ')'
    return text[:start] + replacement + text[end:]
