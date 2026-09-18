"""In-memory lookup over a built lab artifact.

Keys collide on purpose: the normalizer discards accents, so distinct lexical
identities can share a key. Every colliding candidate is preserved; nothing here
picks a winner, and the caller must report ambiguity rather than hide it.
"""
from __future__ import annotations

from pathlib import Path

from parser_lab.artifacts import read_jsonl
from parser_lab.grammar import FAMILIES


class LabIndex:
    def __init__(self, directory, manifest=None):
        self.directory = Path(directory)
        self.manifest = manifest or {}
        self.by_type = {}
        self.fragments = []
        self.retrieval = {}
        self.full_expressions = set()
        self.load()

    def load(self):
        fragments = self.directory / 'fragments.jsonl'
        if fragments.is_file():
            for row in read_jsonl(fragments):
                self.fragments.append(row)
                self.by_type.setdefault(row['type'], {}).setdefault(row['normalized'], []).append(row)
        retrieval = self.directory / 'retrieval.jsonl'
        if retrieval.is_file():
            for row in read_jsonl(retrieval):
                self.retrieval.setdefault(row['normalized'], []).append(row)
                if row.get('role') == 'expression':
                    self.full_expressions.add(row['normalized'])

    # -- lookups -----------------------------------------------------------
    def phrases(self, phrase_type, key, limit=None):
        rows = self.by_type.get(phrase_type, {}).get(key, ())
        return list(rows if limit is None else rows[:limit])

    def known_expression(self, key):
        """True when a complete corpus expression already renders to this key."""
        return key in self.full_expressions

    def retrieve(self, key, limit=None):
        rows = self.retrieval.get(key, ())
        return list(rows if limit is None else rows[:limit])

    def collisions(self, minimum=2):
        """Keys whose distinct sources exceed `minimum`; kept as alternatives."""
        rows = []
        for phrase_type, table in self.by_type.items():
            for key, members in table.items():
                distinct = {item['source'] for item in members}
                if len(distinct) >= minimum:
                    rows.append({'type': phrase_type, 'key': key,
                                 'candidates': [{'source': item['source'], 'surface': item['surface'],
                                                 'bindings': item['bindings']} for item in members]})
        return rows

    def counts(self):
        return {'fragments': len(self.fragments),
                'fragmentKeys': sum(len(table) for table in self.by_type.values()),
                'retrieval': sum(len(rows) for rows in self.retrieval.values()),
                'fullExpressions': len(self.full_expressions),
                'byType': {key: len(table) for key, table in self.by_type.items()},
                'byFamily': _by_family(self.fragments)}

    def types(self):
        return sorted(self.by_type)


def _by_family(fragments):
    counts = {}
    for row in fragments:
        counts[row['family']] = counts.get(row['family'], 0) + 1
    return {key: counts.get(key, 0) for key in sorted(counts)} or {key: 0 for key in FAMILIES}
