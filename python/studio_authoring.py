"""Concrete source spans and extensible expression cards; never a file pretty-printer."""
from __future__ import annotations
import ast
import hashlib
import io
import json
import re
import tokenize
from pathlib import Path

SLOT_PREFIX = '__studio_slot_'

SOURCE_TEXT_FIELDS = {'diplomatic': 'diplomatic', 'target': 'normalized_target',
                      'translation': 'translation', 'analysis': 'analysis', 'note': 'notes'}


def validate_translations(value):
    if not isinstance(value, dict) or any(key not in {'pt', 'en'} or not isinstance(text, str) or len(text) > 100000 for key, text in value.items()):
        raise ValueError('Traduções precisam de campos pt/en com texto de até 100000 caracteres.')
    return dict(value)


def encode_source_text(directive, value, studio):
    """One safe physical comment line, with an explicit, content-bound codec.

    Unmarked source text is always literal, including quotes and backslashes.
    The supported upstream @note keeps the extension portable as source text;
    only Studio decodes it until the selected corpus parser supports this codec.
    """
    encodings = dict(studio['textEncoding']) if isinstance(studio.get('textEncoding'), dict) else {}
    encodings.pop(directive, None)
    encoded = value
    multiline = any(character in value for character in '\n\r\v\f\x85\u2028\u2029')
    if multiline or directive in SOURCE_TEXT_FIELDS and value != value.strip():
        if directive not in SOURCE_TEXT_FIELDS:
            raise ValueError(f'{directive}: informe um único localizador.')
        encoded = json.dumps(value, ensure_ascii=False)
        for character in ('\x85', '\u2028', '\u2029'):
            encoded = encoded.replace(character, '\\u%04x' % ord(character))
        encodings[directive] = {'format': 'json-string-v1',
                                'sha256': hashlib.sha256(encoded.encode('utf-8')).hexdigest()}
    if encodings: studio['textEncoding'] = encodings
    else: studio.pop('textEncoding', None)
    return encoded


def decode_source_text(annotation):
    """Decode only explicitly marked fields whose exact source bytes match."""
    result = dict(annotation)
    studio = None
    for note in annotation.get('notes', ()):
        if isinstance(note, str) and note.startswith('studio:v1 '):
            try: value = json.loads(note[len('studio:v1 '):])
            except ValueError: continue
            if isinstance(value, dict): studio = value
    encodings = (studio or {}).get('textEncoding')
    if not isinstance(encodings, dict): return result
    def decode(value, marker):
        if not isinstance(value, str) or not isinstance(marker, dict) or marker.get('format') != 'json-string-v1': return value
        if hashlib.sha256(value.encode('utf-8')).hexdigest() != marker.get('sha256'): return value
        try: decoded = json.loads(value)
        except ValueError: return value
        return decoded if isinstance(decoded, str) else value
    for directive, field in SOURCE_TEXT_FIELDS.items():
        marker = encodings.get(directive)
        if field == 'notes':
            result[field] = tuple(decode(value, marker) for value in annotation.get(field, ()))
        elif field in annotation: result[field] = decode(annotation[field], marker)
    return result


def source_directives(entry):
    """Match upstream's adjacent directive block, including explicit clears."""
    directives = []
    for comment in reversed(entry.get('commentBlock', '').splitlines()):
        if not comment.strip():
            if directives: continue
            break
        directive = re.match(r'^\s*#\s*@([a-z][a-z0-9_-]*)\s*(.*?)\s*$', comment, re.IGNORECASE)
        if not directive: break
        directives.append((directive.group(1).lower(), directive.group(2)))
    return list(reversed(directives))


def is_slot(name):
    return bool(re.fullmatch(r'__studio_slot_[0-9a-fA-F]+', name))


def contains_slots(raw):
    return any(isinstance(node, ast.Name) and node.id.startswith(SLOT_PREFIX) for node in ast.walk(parse_ast(raw)))

OPERATORS = {ast.Mult: '*', ast.Add: '+', ast.Div: '/', ast.MatMult: '@', ast.LShift: '<<', ast.RShift: '>>', ast.Eq: '==', ast.NotEq: '!=', ast.USub: '-', ast.UAdd: '+'}
METHODS = frozenset({'imp', 'perm', 'circ', 'voc', 'var', 'base_nominal', 'redup', 'card', 'ord', 'inflection', 'compose', 'copy'})
METHOD_LABELS = {'imp': 'Modo imperativo', 'perm': 'Modo permissivo', 'circ': 'Modo circunstancial', 'voc': 'Vocativo', 'var': 'Variante', 'base_nominal': 'Base nominal', 'redup': 'Reduplicação', 'card': 'Cardinal', 'ord': 'Ordinal'}


def position(text, line, byte_col):
    lines = text.splitlines(keepends=True)
    return sum(map(len, lines[:line-1])) + len(lines[line-1].encode('utf-8')[:byte_col].decode('utf-8'))


def token_position(text, pair):
    return sum(map(len, text.splitlines(keepends=True)[:pair[0]-1])) + pair[1]


def u16(text):
    return len(text.encode('utf-16-le')) // 2


def parse_ast(raw):
    # Collection elements rely on their enclosing list for implicit continuation.
    # A synthetic pair supplies that context without entering concrete spans.
    if not any(line.strip() and not line.lstrip().startswith('#') for line in raw.splitlines()): raise SyntaxError('Escreva uma expressão Pydicate.')
    parsed = ast.parse('(' + raw + '\n)', mode='eval').body
    for node in ast.walk(parsed):
        if getattr(node, 'lineno', None) == 1: node.col_offset -= 1
        if getattr(node, 'end_lineno', None) == 1: node.end_col_offset -= 1
    return parsed


def expression_tree(raw, revision_id=''):
    diagnostics = []
    try:
        parsed = parse_ast(raw)
    except SyntaxError as error:
        return {'revisionId': revision_id, 'raw': raw, 'root': None, 'diagnostics': [{'severity': 'error', 'message': error.msg, 'line': error.lineno, 'column': error.offset}], 'capabilities': {'parse': False, 'visual': False, 'edit': False, 'serialize': True}}

    def visit(node, identifier):
        start = position(raw, node.lineno, node.col_offset)
        end = position(raw, node.end_lineno, node.end_col_offset)
        result = {'id': identifier, 'kind': type(node).__name__, 'label': type(node).__name__, 'code': raw[start:end], 'start': u16(raw[:start]), 'end': u16(raw[:end]), 'children': [], 'capabilities': {'edit': True}, 'explicit': True}
        def child(slot, value):
            result['children'].append({'slot': slot, 'node': visit(value, identifier + '/' + slot)})
        if isinstance(node, ast.Name):
            if is_slot(node.id):
                result.update(kind='hole', label='Conectar aqui')
            else:
                result.update(kind='reference', label=node.id, lexicalReference=node.id)
        elif isinstance(node, ast.Constant) and isinstance(node.value, (str, int, float, bool, type(None))):
            result.update(kind='literal', label=repr(node.value), value=node.value)
        elif isinstance(node, ast.BinOp) and type(node.op) in OPERATORS:
            symbol = OPERATORS[type(node.op)]
            result.update(kind='binary', label='Construção ' + symbol, operator=symbol)
            child('left', node.left); child('right', node.right)
        elif isinstance(node, ast.UnaryOp) and type(node.op) in OPERATORS:
            symbol = OPERATORS[type(node.op)]
            result.update(kind='unary', label='Escopo ' + symbol, operator=symbol)
            child('operand', node.operand)
        elif isinstance(node, ast.Compare) and len(node.ops) == 1 and type(node.ops[0]) in OPERATORS:
            symbol = OPERATORS[type(node.ops[0])]
            result.update(kind='comparison', label='Relação ' + symbol, operator=symbol)
            child('left', node.left); child('right', node.comparators[0])
        elif isinstance(node, ast.Call) and isinstance(node.func, (ast.Name, ast.Attribute)):
            name = node.func.id if isinstance(node.func, ast.Name) else node.func.attr
            result.update(kind='call' if isinstance(node.func, ast.Name) else 'method', label=METHOD_LABELS.get(name, name), method=name)
            if isinstance(node.func, ast.Attribute):
                child('receiver', node.func.value)
                if name not in METHODS:
                    result['capabilities']['edit'] = False
                    diagnostics.append({'severity': 'warning', 'message': f'Método {name} preservado; adaptador de execução indisponível.', 'nodeId': identifier})
            else:
                result['lexicalReference'] = name
            for index, arg in enumerate(node.args): child('arg' + str(index), arg)
            for keyword in node.keywords:
                if keyword.arg is None:
                    result['capabilities']['edit'] = False
                    diagnostics.append({'severity': 'warning', 'message': 'Expansão de argumentos preservada sem execução.', 'nodeId': identifier})
                else: child('kw:' + keyword.arg, keyword.value)
        else:
            result.update(kind='unsupported', label='Construção Python preservada')
            result['capabilities']['edit'] = False
            diagnostics.append({'severity': 'warning', 'message': f'{type(node).__name__}: extensão de adaptador necessária.', 'nodeId': identifier})
        return result
    root = visit(parsed, 'root')
    return {'revisionId': revision_id, 'raw': raw, 'root': root, 'diagnostics': diagnostics, 'capabilities': {'parse': True, 'visual': not diagnostics, 'edit': not diagnostics, 'serialize': True}}


def replace_node(raw, node, replacement):
    """Same span operation used by the renderer; wrap to preserve parent scope."""
    if replacement == node["code"]: return raw
    encoded = raw.encode('utf-16-le')
    return (encoded[:node['start']*2] + ('(' + replacement + ')').encode('utf-16-le') + encoded[node['end']*2:]).decode('utf-16-le')


def _trim_span(text, start, end):
    segment = text[start:end]
    significant = [tok for tok in tokenize.generate_tokens(io.StringIO(segment).readline) if tok.type not in {tokenize.NL, tokenize.NEWLINE, tokenize.INDENT, tokenize.DEDENT, tokenize.ENDMARKER, tokenize.COMMENT}]
    if not significant: return None
    return start + token_position(segment, significant[0].start), start + token_position(segment, significant[-1].end)


def source_entries(path):
    """Return precise writable expression spans, retaining parentheses/comments inside."""
    text = path.read_bytes().decode('utf-8')
    tree = ast.parse(text, filename=str(path))
    source = path.name.removesuffix('.tu.py')
    candidates = [(s.targets[0].id, s) for s in tree.body if isinstance(s, ast.Assign) and len(s.targets) == 1 and isinstance(s.targets[0], ast.Name) and isinstance(s.value, (ast.List, ast.Tuple))]
    selected = next((x for x in candidates if x[0] == source), None) or next((x for x in candidates if x[0] == 'l'), None) or (candidates[0] if len(candidates) == 1 else None)
    if not selected: raise ValueError('Lista de expressões não reconhecida.')
    name, initial = selected
    result = []
    for statement in tree.body:
        value = initial.value if statement is initial else statement.value if isinstance(statement, ast.AugAssign) and isinstance(statement.target, ast.Name) and statement.target.id == name and isinstance(statement.op, ast.Add) else None
        if value is None: continue
        if isinstance(value, (ast.List, ast.Tuple)):
            base = position(text, value.lineno, value.col_offset)
            segment = ast.get_source_segment(text, value)
            tokens = list(tokenize.generate_tokens(io.StringIO(segment).readline))
            depth, beginning, spans = 0, None, []
            for tok in tokens:
                if tok.type != tokenize.OP: continue
                if tok.string in '([{':
                    depth += 1
                    if depth == 1: beginning = token_position(segment, tok.end)
                elif tok.string in ')]}':
                    depth -= 1
                    if depth == 0 and beginning is not None: spans.append((base + beginning, base + token_position(segment, tok.start)))
                elif tok.string == ',' and depth == 1:
                    spans.append((base + beginning, base + token_position(segment, tok.start)))
                    beginning = token_position(segment, tok.end)
            elements = iter(value.elts)
            for beginning, ending in spans:
                span = _trim_span(text, beginning, ending)
                if span:
                    element = next(elements)
                    result.append({'start': span[0], 'end': span[1], 'line': element.lineno, 'endLine': element.end_lineno, 'statementLine': element.lineno, 'expression': text[span[0]:span[1]], 'collection': name})
        else:
            beginning = position(text, statement.lineno, statement.col_offset)
            ending = position(text, statement.end_lineno, statement.end_col_offset)
            segment = text[beginning:ending]
            tok = next(tok for tok in tokenize.generate_tokens(io.StringIO(segment).readline) if tok.type == tokenize.OP and tok.string == '+=')
            span = _trim_span(text, beginning + token_position(segment, tok.end), ending)
            result.append({'start': span[0], 'end': span[1], 'line': value.lineno, 'endLine': value.end_lineno, 'statementLine': statement.lineno, 'expression': text[span[0]:span[1]], 'collection': name})
    lines = text.splitlines()
    for ordinal, entry in enumerate(result, 1):
        entry['ordinal'] = ordinal
        entry['openingLine'] = text.count('\n', 0, entry['start']) + 1
        block = []
        index = entry['statementLine'] - 2
        while index >= 0 and (not lines[index].strip() or lines[index].lstrip().startswith('#')):
            block.insert(0, lines[index]); index -= 1
        entry['commentBlock'] = '\n'.join(block)
        entry['studio'] = None
        for line in block:
            match = re.match(r'\s*#\s*@note\s+studio:v1\s+(\{.*\})\s*$', line)
            if match:
                try: entry['studio'] = json.loads(match.group(1))
                except ValueError: pass
    return result


def authoritative_metadata(corpus, path):
    """Reuse upstream waterfall/metadata behavior without executing the source."""
    import dataclasses
    import importlib.util
    import sys
    # Package imports have no grammar evaluation and use selected project's code.
    previous = list(sys.path)
    try:
        sys.path.insert(0, str(corpus))
        # Avoid cross-project module reuse in the long-lived worker.
        for name in list(sys.modules):
            if name == 'authoring' or name.startswith('authoring.'): del sys.modules[name]
        spec = importlib.util.spec_from_file_location('studio_upstream_source_annotations', corpus / 'authoring/source_annotations.py')
        if spec is None or spec.loader is None: return {}
        module = importlib.util.module_from_spec(spec); sys.modules[spec.name] = module; spec.loader.exec_module(module)
        entries = module.source_entries(path, source_name=path.name.removesuffix('.tu.py'))
        annotations = module.waterfall_locator_annotations(entries, module.annotations_by_source_line(path, entries))
        return {ordinal: decode_source_text(dataclasses.asdict(annotations[entry.source_line])) for ordinal, entry in enumerate(entries, 1) if entry.source_line in annotations}
    finally:
        sys.path[:] = previous
