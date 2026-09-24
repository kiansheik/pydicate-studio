"""Verified source copies of shared predicates, preserving intermediate meanings."""
import ast
from studio_authoring import parse_ast


def occurrence_copy(name, entries, namespace):
    from authoring_runtime import interpret, shape
    from rendered_structures import isolated_namespace
    definitions = {entry['name']:entry for entry in entries}
    budget = [0]

    def verified(entry):
        raw = entry['expression']
        syntax = parse_ast(raw)
        candidate = interpret(syntax, isolated_namespace(namespace, syntax))
        original = namespace[entry['name']]
        if shape(candidate) == shape(original): return raw
        # An explicitly changed gloss need not make grammatical copying impossible.
        if hasattr(candidate, 'copy') and isinstance(getattr(original, 'definition', None), str):
            candidate = candidate.copy()
            candidate.definition = original.definition
            if shape(candidate) == shape(original):
                return f'studio_define(({raw}), {original.definition!r})'
        return None

    def expand(node, active):
        budget[0] += 1
        if budget[0] > 3000 or len(active) > 24:
            raise ValueError('A expansão ultrapassa o limite de inspeção.')
        if isinstance(node, ast.Name) and node.id not in active:
            entry = definitions.get(node.id)
            if entry and entry['kind'] in ('compound', 'alias'):
                raw = verified(entry)
                if raw and raw != node.id:
                    return expand(parse_ast(raw), (*active,node.id))
        # Never expand function identifiers or keyword names as value references.
        for field, value in ast.iter_fields(node):
            if isinstance(node, ast.Call) and field == 'func': continue
            if isinstance(value, ast.AST): setattr(node,field,expand(value,active))
            elif isinstance(value,list): setattr(node,field,[expand(item,active) if isinstance(item,ast.AST) else item for item in value])
        return node

    raw = verified(definitions[name])
    if not raw or raw.strip() == name: return None
    try:
        expanded = ast.unparse(ast.fix_missing_locations(expand(parse_ast(raw), (name,))))
        syntax = parse_ast(expanded)
        if len(expanded) <= 100000 and shape(interpret(syntax,isolated_namespace(namespace,syntax))) == shape(namespace[name]):
            # Keep exact original spelling/comments if no nested composition changed.
            return raw if ast.dump(parse_ast(raw)) == ast.dump(syntax) else expanded
    except (SyntaxError, ValueError, TypeError, AttributeError, RecursionError):
        pass
    return raw
