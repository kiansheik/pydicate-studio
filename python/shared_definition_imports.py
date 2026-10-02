"""Resolve shared definitions as a dependency graph, retaining source identity.

Evaluation executes original AST declarations in dependency order in memory.
For compatibility with the saved Python format, publication serializes those
same definitions in dependency order and requires the normal whole-corpus review.
Arbitrary source-local commands, ambiguous bindings and helper side effects are
outside this automatic lexical graph, not silently reinterpreted as definitions.
"""
from __future__ import annotations

import ast

from shared_definition import module_bindings
from studio_authoring import parse_ast


class DefinitionImportError(ValueError):
    code = 'LEXICAL_DEPENDENCY'


def references(node):
    return {item.id for item in ast.walk(node)
            if isinstance(item, ast.Name) and isinstance(item.ctx, ast.Load)}


def plan(text, source_id, line, raw):
    tree = ast.parse(text)
    owner = next((node for node in tree.body if node.lineno == line), None)
    if not (isinstance(owner, ast.Assign) and len(owner.targets) == 1
            and isinstance(owner.targets[0], ast.Name)):
        raise DefinitionImportError('Reabra a declaração que será substituída.')
    owner_name = owner.targets[0].id
    requested = references(parse_ast(raw))
    if owner_name in requested:
        raise DefinitionImportError('Uma definição não pode usar a si mesma como referência.')
    empty = {'text': text, 'line': line, 'imports': []}
    # Source-local contexts already contain the complete shared lexicon. Moving
    # statements around passage collections requires a separate publication plan.
    if source_id != 'lexicon':
        return empty

    counts = module_bindings(tree)
    bindings = {}
    for node in tree.body:
        for name in module_bindings(ast.Module(body=[node], type_ignores=[])):
            bindings.setdefault(name, []).append(node)
    offsets = [0]
    for part in text.splitlines(keepends=True):
        offsets.append(offsets[-1] + len(part))
    positions = {id(node): index for index, node in enumerate(tree.body)}
    moved = {}
    active = set()

    def fail(message):
        raise DefinitionImportError(message)

    def boundary(node):
        index = positions[id(node)]
        previous = tree.body[index - 1] if index else None
        if node.col_offset or previous and previous.end_lineno >= node.lineno:
            fail('Uma declaração na mesma linha que outro comando exige revisão no código.')
        return offsets[previous.end_lineno] if previous else 0

    def metadata(node, name):
        index = positions[id(node)]
        last = node
        for following in tree.body[index + 1:]:
            if not (isinstance(following, ast.Assign) and len(following.targets) == 1
                    and isinstance(following.targets[0], ast.Attribute)
                    and isinstance(following.targets[0].value, ast.Name)
                    and following.targets[0].value.id == name):
                break
            target = following.targets[0]
            if (target.attr != 'definition' or not isinstance(following.value, ast.Constant)
                    or not isinstance(following.value.value, str) or following.col_offset):
                fail('A peça ' + name + ' tem alterações adicionais que exigem revisão no código.')
            last = following
        # A non-adjacent mutation cannot silently become an earlier definition.
        for following in tree.body[index + 1:]:
            if following.lineno <= last.end_lineno:
                continue
            if any(isinstance(item, ast.Attribute) and isinstance(item.ctx, (ast.Store, ast.Del))
                   and isinstance(item.value, ast.Name) and item.value.id == name
                   for item in ast.walk(following)):
                fail('A peça ' + name + ' é alterada em outro ponto; confira suas dependências no código.')
        return last

    def require(name, origin=None):
        if name == owner_name or name in active:
            fail('A referência criaria um ciclo na definição de ' + owner_name + ': ' + name + '.')
        nodes = bindings.get(name, [])
        prior = [node for node in nodes if node.lineno < line]
        if prior:
            # A dependency of a moved declaration must mean the same thing at
            # its original location and at the destination.
            if origin is not None and counts[name] != 1:
                fail('A dependência ' + name + ' é redefinida; sua ordem precisa de revisão no código.')
            return
        if not nodes:
            return  # Engine imports are validated by the bounded interpreter.
        if counts[name] != 1 or len(nodes) != 1:
            fail('Há mais de uma declaração de ' + name + '; selecione uma definição sem ambiguidade.')
        node = nodes[0]
        if name in moved:
            return
        if len(moved) + len(active) >= 100:
            fail('A referência requer muitas declarações; divida a revisão.')
        if not (isinstance(node, ast.Assign) and len(node.targets) == 1
                and isinstance(node.targets[0], ast.Name) and not isinstance(node.value, ast.Lambda)):
            fail('A dependência ' + name + ' usa um helper ou comando que não pode ser reordenado automaticamente.')
        active.add(name)
        dependencies = references(node.value)
        for call in (item for item in ast.walk(node.value)
                     if isinstance(item, ast.Call) and isinstance(item.func, ast.Name)):
            functions = bindings.get(call.func.id, [])
            if any(isinstance(value, (ast.FunctionDef, ast.AsyncFunctionDef))
                   or isinstance(value, ast.Assign) and isinstance(value.value, ast.Lambda)
                   for value in functions):
                fail('A dependência ' + name + ' usa um helper com contexto próprio; revise-a no código.')
        for dependency in sorted(dependencies):
            require(dependency, node.lineno)
        active.remove(name)
        last = metadata(node, name)
        moved[name] = {'name': name, 'sourceId': source_id, 'line': node.lineno,
                       'endLine': last.end_lineno, 'start': boundary(node),
                       'end': offsets[last.end_lineno], 'dependencies': dependencies,
                       'expression': ast.get_source_segment(text, node.value)}

    for name in sorted(requested):
        require(name)
    if not moved:
        return empty

    # DFS insertion order is dependency order even when saved declarations are
    # not chronological. Source order is only a serialization compatibility need.
    imports = list(moved.values())
    names = requested | set().union(*(item['dependencies'] for item in imports))
    end_line = max(item['endLine'] for item in imports)
    included = {(item['line'], item['endLine']) for item in imports}
    for node in tree.body:
        if node.lineno < line or node.lineno > end_line:
            continue
        if any(start <= node.lineno <= end for start, end in included):
            continue
        # Contextual object mutation and executable module side effects cannot
        # be moved past safely, even when ordinary surfaces happen to match.
        if isinstance(node, (ast.Expr, ast.AugAssign, ast.Delete, ast.If, ast.For, ast.While,
                             ast.With, ast.Try, ast.Import, ast.ImportFrom)):
            fail('Há comandos entre as definições que impedem reordenar suas dependências automaticamente.')
        if any(isinstance(item, ast.Attribute) and isinstance(item.ctx, (ast.Store, ast.Del))
               and isinstance(item.value, ast.Name) and item.value.id in names
               for item in ast.walk(node)):
            fail('Uma dependência é modificada entre as definições; revise a ordem no código.')

    insertion = boundary(owner)
    chunks = ''.join(text[item['start']:item['end']] for item in imports)
    if chunks and not chunks.endswith('\n'):
        chunks += '\n'
    after = text
    for item in sorted(imports, key=lambda item: item['start'], reverse=True):
        after = after[:item['start']] + after[item['end']:]
    after = after[:insertion] + chunks + after[insertion:]
    public = [{key: item[key] for key in ('name', 'sourceId', 'line', 'endLine', 'expression')}
              for item in imports]
    statements=[node for node in tree.body if node.lineno < line]
    for item in imports:
        statements.extend(node for node in tree.body
                          if item['line'] <= node.lineno <= item['endLine'])
    return {'text': after, 'line': line + chunks.count('\n'), 'imports': public,
            'statements': statements}
