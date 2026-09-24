"""Sparse approvals with a contiguous legacy projection, never invented gap records.

Legacy tools still read the approved prefix. Reviews beyond its first gap live
in a versioned companion keyed by stable passage ID and are merged by Studio.
"""
import json
from pathlib import Path


def paths(corpus, source):
    base = Path(corpus) / 'ground_truth/records/historic'
    return base / (source + '.jsonl'), base / (source + '.studio.json')


def read(corpus, source):
    legacy, companion = paths(corpus, source)
    records = {}
    for line in (legacy.read_bytes() if legacy.exists() else b'').splitlines():
        if not line.strip(): continue
        row = json.loads(line)
        ordinal = row.get('ordinal')
        if type(ordinal) is not int or ordinal < 1 or ordinal in records:
            raise ValueError('Identidade de referência inválida ou duplicada.')
        records[ordinal] = row
    if companion.exists() and companion.read_bytes().strip():
        payload = json.loads(companion.read_bytes())
        if payload.get('version') != 1 or not isinstance(payload.get('records'), list):
            raise ValueError('Arquivo de referências independentes inválido.')
        for row in payload['records']:
            ordinal = row.get('ordinal')
            if type(ordinal) is not int or ordinal < 1 or ordinal in records or not isinstance(row.get('studio_passage_id'), str):
                raise ValueError('Referência independente sem identidade ou duplicada.')
            records[ordinal] = row
    return records


def encoded(value):
    text = json.dumps(value, ensure_ascii=False, sort_keys=True)
    for char in ('\x85', '\u2028', '\u2029'):
        text = text.replace(char, '\\u%04x' % ord(char))
    return text.encode('utf-8')


def changes(corpus, source, records):
    legacy, companion = paths(corpus, source)
    prefix = 0
    while prefix + 1 in records: prefix += 1
    # Reuse unchanged lines exactly, including editorial whitespace.
    original = legacy.read_bytes() if legacy.exists() else b''
    lines = []
    written = set()
    for line in original.splitlines(keepends=True):
        if not line.strip():
            lines.append(line); continue
        prior = json.loads(line)
        ordinal = prior['ordinal']
        if ordinal > prefix: break
        row = records[ordinal]
        lines.append(line if prior == row else encoded(row) + b'\n')
        written.add(ordinal)
    for ordinal in range(1, prefix + 1):
        if ordinal in written: continue
        if lines and not lines[-1].endswith(b'\n'): lines[-1] += b'\n'
        lines.append(encoded(records[ordinal]) + b'\n')
    outputs = [(legacy, b''.join(lines))]
    extra = [records[key] for key in sorted(records) if key > prefix]
    if extra or companion.exists():
        outputs.append((companion, encoded({'version': 1, 'records': extra}) + b'\n'))
    return [{'path': path, 'before': path.read_bytes() if path.exists() else b'',
             'beforeExists': path.exists(), 'after': after} for path, after in outputs]


def verify(corpus, source):
    """Check every saved review, including those beyond gaps, without filling them."""
    from authoring_runtime import namespace_for, interpret, evaluation_snapshot
    from studio_authoring import source_entries, parse_ast
    from authoring.records import normalize_surface
    path = corpus / 'historic' / (source + '.tu.py')
    entries = source_entries(path)
    records = read(corpus, source)
    failures = []
    for ordinal, record in records.items():
        if ordinal > len(entries):
            failures.append({'ordinal': ordinal, 'error': 'Passagem ausente.'}); continue
        entry = entries[ordinal - 1]
        identity = (entry.get('studio') or {}).get('passageId')
        if identity and record.get('studio_passage_id', identity) != identity:
            failures.append({'ordinal': ordinal, 'error': 'Identidade da referência mudou.'}); continue
        try:
            value = evaluation_snapshot(interpret(parse_ast(entry['expression']), namespace_for(corpus, path, entry['line'])))
            actual = normalize_surface(str(value.eval()))
            expected = normalize_surface(record.get('normalized_target') or record['surface'])
            if actual != expected: failures.append({'ordinal': ordinal, 'expected': expected, 'actual': actual})
        except Exception as error: failures.append({'ordinal': ordinal, 'error': str(error)})
    return {'ok': not failures, 'blocked': int(bool(failures)), 'sources': [{
        'source': source, 'ok': not failures, 'records': len(records),
        'unreviewed': len(entries) - len(records), 'failures': failures,
        **({'mismatch': failures[0]} if failures else {}),
    }]}
