"""Read-only source dependency candidates; never execute corpus passages."""
import ast
from pathlib import Path
from studio_authoring import source_entries, parse_ast


def reference_uses(corpus, name, declaration_path, declaration_line):
    target = (str(Path(declaration_path)), declaration_line)
    shared = Path(corpus) / 'historic/lexicon.tu.py'
    results, diagnostics = [], []

    def assignments(path):
        text = path.read_text(encoding='utf-8')
        return [(statement, text) for statement in ast.parse(text).body]

    for path in sorted((Path(corpus) / 'historic').glob('*.tu.py')):
        if path == shared:
            continue
        bindings = {}
        def bind(statement, origin):
            if isinstance(statement, ast.Assign):
                for item in statement.targets:
                    if isinstance(item, ast.Name):
                        dependencies = {node.id: bindings.get(node.id) for node in ast.walk(statement.value) if isinstance(node, ast.Name)}
                        bindings[item.id] = ((str(origin), statement.lineno), dependencies)
            elif isinstance(statement, ast.FunctionDef):
                # Function dependencies are dynamic, so report them as candidates.
                dependencies = {node.id: bindings.get(node.id) for node in ast.walk(statement) if isinstance(node, ast.Name)}
                bindings[statement.name] = ((str(origin), statement.lineno), dependencies)
        try:
            for statement, _ in assignments(shared): bind(statement, shared)
            statements = iter(assignments(path)); following = next(statements, None)
            for entry in source_entries(path):
                while following and following[0].lineno < entry['statementLine']:
                    bind(following[0], path); following = next(statements, None)
                names = {node.id for node in ast.walk(parse_ast(entry['expression'])) if isinstance(node, ast.Name)}
                def depends(binding, active):
                    if not binding or id(binding) in active: return False
                    identity, children = binding
                    return identity == target or any(depends(child, active | {id(binding)}) for child in children.values())
                via = sorted(item for item in names if depends(bindings.get(item), set()))
                if via:
                    results.append({'sourceId':path.name.removesuffix('.tu.py'), 'ordinal':entry['ordinal'], 'line':entry['statementLine'], 'expression':entry['expression'], 'via':via, 'direct':name in via})
        except (SyntaxError, ValueError, OSError) as error:
            diagnostics.append(path.name + ': ' + str(error))
    return {'uses':results, 'diagnostics':diagnostics, 'basis':'source-dependencies'}
