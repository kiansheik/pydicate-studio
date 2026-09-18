"""Stable training projection of the existing source AST.

It references Studio's own `expression_tree` schema and removes only volatile
positions and node identifiers. The serializer round-trips through the same
parser and editor, so grouping, operator order, omission (`+`/`-`) and variant
calls are preserved. Similar rendered strings never authorize an algebraic
simplification: nothing here rewrites an expression.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from studio_authoring import expression_tree

PROJECTION_VERSION = 1


def project(raw):
    """Positions/ids removed; kind, operator, method, name and order kept."""
    tree = expression_tree(raw)
    if not tree['root'] or not tree['capabilities']['edit']:
        raise ValueError('A expressão não é editável pelo adaptador atual.')

    def visit(node):
        row = {'kind': node['kind']}
        for key in ('operator', 'method', 'value', 'lexicalReference'):
            if key in node:
                row[key] = node[key]
        row['children'] = [{'slot': child['slot'], 'node': visit(child['node'])}
                           for child in node['children']]
        return row

    return {'projectionVersion': PROJECTION_VERSION, 'root': visit(tree['root'])}


def serialize(projection):
    """Rebuild Pydicate source. Always fully parenthesized, never simplified."""
    node = projection['root'] if 'root' in projection else projection

    def emit(item):
        slots = {child['slot']: child['node'] for child in item['children']}
        kind = item['kind']
        if kind == 'reference':
            return item['lexicalReference']
        if kind == 'hole':
            return '__studio_slot_0'
        if kind == 'literal':
            return repr(item['value'])
        if kind in ('binary', 'comparison'):
            return '(' + emit(slots['left']) + ' ' + item['operator'] + ' ' + emit(slots['right']) + ')'
        if kind == 'unary':
            return '(' + item['operator'] + emit(slots['operand']) + ')'
        if kind == 'method':
            arguments = [emit(slots[key]) for key in sorted(slots) if key.startswith('arg')]
            keywords = [key[3:] + '=' + emit(slots[key]) for key in sorted(slots) if key.startswith('kw:')]
            return emit(slots['receiver']) + '.' + item['method'] + '(' + ', '.join(arguments + keywords) + ')'
        if kind == 'call':
            arguments = [emit(slots[key]) for key in sorted(slots) if key.startswith('arg')]
            keywords = [key[3:] + '=' + emit(slots[key]) for key in sorted(slots) if key.startswith('kw:')]
            return item['lexicalReference'] + '(' + ', '.join(arguments + keywords) + ')'
        raise ValueError('Construção sem serialização declarada: ' + kind)

    return emit(node)


def lexemes(projection):
    """Stable lexical references in evaluation order."""
    found = []

    def visit(node):
        if node.get('lexicalReference'):
            found.append(node['lexicalReference'])
        for child in node['children']:
            visit(child['node'])

    visit(projection['root'] if 'root' in projection else projection)
    return found


def size(projection):
    count = 0

    def visit(node):
        nonlocal count
        count += 1
        for child in node['children']:
            visit(child['node'])

    visit(projection['root'] if 'root' in projection else projection)
    return count


def round_trips(raw):
    """True when project → serialize → project is stable for this expression."""
    first = project(raw)
    return project(serialize(first)) == first
