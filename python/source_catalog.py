"""Portable source descriptions and safe empty corpus scaffolds."""
import ast
import json
import keyword
import re

MARKER = '# studio-source:v1 '


def creation_metadata(source_id, title, year=''):
    if (not isinstance(source_id, str) or not re.fullmatch(r'[a-z][a-z0-9_]{0,79}', source_id)
            or keyword.iskeyword(source_id) or source_id in {'l', 'lexicon'}):
        raise ValueError('Use um identificador de fonte com letras minúsculas, números e sublinhados, começando por uma letra.')
    for label, value, limit in [('Título', title, 500), ('Ano', year, 40)]:
        if not isinstance(value, str) or len(value) > limit or any(ord(c) < 32 or c in '\x85\u2028\u2029' for c in value):
            raise ValueError(label + ': informe texto em uma única linha.')
    if not title.strip():
        raise ValueError('Informe o título da fonte.')
    return {'id': source_id, 'title': title.strip(), 'year': year.strip()}


def descriptor(path):
    source_id = path.name.removesuffix('.tu.py')
    result = {'id': source_id, 'title': 'Araújo · Catecismo' if source_id == 'araujo_catecismo_1686' else source_id.replace('_', ' '),
              'year': '1686' if source_id == 'araujo_catecismo_1686' else '', 'fileName': path.name}
    for line in path.read_text(encoding='utf-8').splitlines()[:20]:
        if not line.startswith(MARKER): continue
        try:
            data = json.loads(line[len(MARKER):])
            if data.get('id') != source_id: continue
            result.update(creation_metadata(source_id, data.get('title'), data.get('year', '')))
        except (ValueError, TypeError, AttributeError):
            continue
        break
    return result


def scaffold(metadata):
    return (MARKER + json.dumps(metadata, ensure_ascii=True) + '\n'
            'from historic.lexicon import load_lexicon\n\n'
            'globals().update(load_lexicon())\n\n'
            'l = []\n\n' + metadata['id'] + ' = l\n')


def collection_context(text, source_id):
    """Use the same collection selection as the concrete source reader."""
    statements = ast.parse(text).body
    candidates = [(s.targets[0].id, s) for s in statements if isinstance(s, ast.Assign)
                  and len(s.targets) == 1 and isinstance(s.targets[0], ast.Name)
                  and isinstance(s.value, (ast.List, ast.Tuple))]
    selected = (next((p for p in candidates if p[0] == source_id), None)
                or next((p for p in candidates if p[0] == 'l'), None)
                or (candidates[0] if len(candidates) == 1 else None))
    if selected is None: raise ValueError('Lista de expressões não reconhecida.')
    name, initial = selected
    anchor = next((s for s in statements if isinstance(s, ast.Assign) and s.lineno > initial.lineno
                   and isinstance(s.value, ast.Name) and s.value.id == name
                   and any(isinstance(t, ast.Name) and t.id == source_id for t in s.targets)), None)
    return name, anchor
