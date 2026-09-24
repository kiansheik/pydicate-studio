"""Meaning-only edits at an exact source occurrence, returned as draft code."""
from __future__ import annotations

import ast
import io
import tokenize

from studio_authoring import expression_tree, parse_ast, replace_node, position, token_position


def _defined(node):
    if not (isinstance(node, ast.Call) and isinstance(node.func, ast.Name)
            and node.func.id == 'studio_define'):
        return None
    keywords = {part.arg: part.value for part in node.keywords}
    if (len(node.args) > 2 or len(keywords) != len(node.keywords)
            or any(name not in ('value', 'definition') for name in keywords)
            or node.args and 'value' in keywords or len(node.args) > 1 and 'definition' in keywords):
        return None
    value = node.args[0] if node.args else keywords.get('value')
    definition = node.args[1] if len(node.args) > 1 else keywords.get('definition')
    if value is not None and isinstance(definition, ast.Constant) and isinstance(definition.value, str):
        return value, definition
    return None


def _tokens(raw):
    return [(token, token_position(raw, token.start), token_position(raw, token.end))
            for token in tokenize.generate_tokens(io.StringIO(raw).readline)
            if token.type != tokenize.ENDMARKER]


def _replace_definition(raw, definition, value):
    """Replace the meaning literal, preserving every other source byte."""
    if isinstance(definition, ast.Constant) and definition.value == value:
        return raw
    start = position(raw, definition.lineno, definition.col_offset)
    end = position(raw, definition.end_lineno, definition.end_col_offset)
    comments = [token.string for token, beginning, ending in _tokens(raw)
                if token.type == tokenize.COMMENT and start <= beginning and ending <= end]
    replacement = repr(value)
    if comments:
        # Adjacent string literals can contain comments inside their AST span.
        replacement = '(' + replacement + '\n' + '\n'.join(comments) + '\n)'
    return raw[:start] + replacement + raw[end:]


def _inherit_source(raw, value):
    """Unwrap the concrete value argument, retaining grouping and comments."""
    start = position(raw, value.lineno, value.col_offset)
    end = position(raw, value.end_lineno, value.end_col_offset)
    tokens = _tokens(raw)
    depth, beginning, segments = 0, None, []
    for token, first, last in tokens:
        if token.type != tokenize.OP:
            continue
        if token.string in '([{':
            depth += 1
            if depth == 1:
                beginning = last
        elif token.string in ')]}':
            if depth == 1:
                segments.append((beginning, first))
            depth -= 1
        elif token.string == ',' and depth == 1:
            segments.append((beginning, first))
            beginning = last
    bounds = next(((first, last) for first, last in segments if first <= start and end <= last), None)
    if bounds is None:
        raise ValueError('O argumento da definição precisa de revisão manual; nenhum comentário foi removido.')
    first, last = bounds
    concrete = raw[first:last]
    meaningful = [(token, left, right) for token, left, right in tokens if first <= left and right <= start
                  and token.type not in {tokenize.NL, tokenize.NEWLINE, tokenize.INDENT, tokenize.DEDENT, tokenize.COMMENT}]
    removals = []
    if len(meaningful) >= 2 and meaningful[0][0].string == 'value' and meaningful[1][0].string == '=':
        removals.extend((left, right) for _, left, right in meaningful[:2])
    leading = [(token, left, right) for token, left, right in tokens
               if token.type == tokenize.COMMENT and first <= left < start]
    removals.extend((left, right) for _, left, right in leading)
    for left, right in sorted(removals, reverse=True):
        concrete = concrete[:left-first] + concrete[right-first:]
    moved = [token.string for token, left, _ in tokens
             if token.type == tokenize.COMMENT and (left < start or left >= last)]
    if moved or any(token.type == tokenize.COMMENT for token, left, _ in tokens if start <= left < last):
        # Keep the first expression token ahead of relocated wrapper comments.
        # The corpus parser anchors initial-list metadata at that token, and
        # publication cannot safely join a leading comment into its prefix.
        return '(\n' + concrete + '\n' + ''.join(comment + '\n' for comment in moved) + ')'
    return concrete.strip()


def define_node(payload, corpus):
    from authoring_runtime import interpret, namespace_for, realize
    from rendered_structures import isolated_namespace
    from lexical_publication import _evidence

    raw = payload['raw']
    parsed = expression_tree(raw)
    def find(node):
        if not node:
            return None
        if node['id'] == payload['sourceNodeId']:
            return node
        return next((found for child in node['children']
                     if (found := find(child['node'])) is not None), None)
    selected = find(parsed['root'])
    if not selected or selected['kind'] in {'literal', 'hole', 'raw'}:
        raise ValueError('Selecione um predicado ou uma construção da árvore atual.')
    namespace = namespace_for(corpus, corpus/'historic'/f"{payload['sourceId']}.tu.py",
                              payload.get('line', 10**9))
    syntax = parse_ast(selected['code'])
    original = interpret(syntax, isolated_namespace(namespace, syntax))
    if not callable(getattr(original, 'eval', None)) or not callable(getattr(original, 'copy', None)):
        raise ValueError('Esta parte não admite uma definição própria.')
    defined = _defined(syntax)
    if payload.get('action') == 'inherit':
        if not defined:
            raise ValueError('Esta parte não tem uma definição local para remover.')
        replacement = _inherit_source(selected['code'], defined[0])
    elif defined:
        replacement = _replace_definition(selected['code'], defined[1], payload['definition'])
    else:
        replacement = f"studio_define(({selected['code']}), {payload['definition']!r})"
    changed_syntax = parse_ast(replacement)
    revised = interpret(changed_syntax, isolated_namespace(namespace, changed_syntax))
    # Definitions can affect semantics; changing morphology requires a separate
    # structural edit. Compare real isolated engine evidence, not just labels.
    def morphology(value):
        return {key: item for key, item in _evidence(value).items() if key != 'structure'}
    if morphology(original) != morphology(revised):
        raise ValueError('A alteração do significado mudou a forma ou a morfologia desta parte.')
    if defined and payload.get('action') != 'inherit':
        # Only the verified call's meaning literal changed. Its precedence is
        # unchanged, so preserve all surrounding bytes instead of accumulating
        # a new grouping layer for every revision of the same definition.
        encoded = raw.encode('utf-16-le')
        updated = (encoded[:selected['start'] * 2] + replacement.encode('utf-16-le')
                   + encoded[selected['end'] * 2:]).decode('utf-16-le')
    else:
        updated = replace_node(raw, selected, replacement)
    before = realize(raw, isolated_namespace(namespace, parse_ast(raw)))
    after = realize(updated, isolated_namespace(namespace, parse_ast(updated)))
    for key in ('surface', 'annotated', 'evaluationStatus'):
        if before.get(key) != after.get(key):
            raise ValueError('A alteração do significado mudou a realização da passagem.')
    return {'raw': updated, 'sourceNodeId': selected['id'],
            'definition': getattr(revised, 'definition', ''),
            'surface': after.get('surface'), 'annotated': after.get('annotated'),
            'definitionContext': after.get('definitionContext')}
