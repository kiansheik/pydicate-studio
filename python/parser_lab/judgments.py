"""Append-only contributor judgments about lab candidates.

A judgment is bound to the exact input, candidate, context and artifact versions
that produced it. It is laboratory evidence only: it never publishes corpus
source, never approves a reference and never grants editorial status. Opting a
judgment into training is a separate, explicit decision.

Unchanged tree gestures are not judgments. Only an explicit verdict is recorded,
and an identical repeated verdict is not appended twice.
"""
from __future__ import annotations

import json
import os
import time
import uuid
from pathlib import Path

JUDGMENT_SCHEMA = 1
VERDICTS = ('accepted', 'rejected', 'corrected', 'uncertain')
MAX_FILE = 32 * 1024 * 1024


class JudgmentLog:
    def __init__(self, path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)

    def append(self, payload):
        verdict = payload.get('verdict')
        if verdict not in VERDICTS:
            raise ValueError('Veredito inválido: ' + str(verdict))
        if not isinstance(payload.get('normalized'), str) or not payload['normalized']:
            raise ValueError('O julgamento precisa da entrada normalizada.')
        row = {
            'schemaVersion': JUDGMENT_SCHEMA,
            'id': uuid.uuid4().hex,
            'recordedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
            'verdict': verdict,
            'normalized': payload['normalized'],
            'rawInput': payload.get('rawInput', ''),
            'candidateSource': payload.get('candidateSource', ''),
            'correctedSource': payload.get('correctedSource', ''),
            'note': str(payload.get('note', ''))[:2000],
            'context': payload.get('context', {}),
            'artifacts': payload.get('artifacts', {}),
            'normalizerProfile': payload.get('normalizerProfile', ''),
            'provenance': 'contributor-judgment',
            'reviewStatus': 'lab-only',
            'grantsApproval': False,
        }
        previous = self.read(1)
        if previous and _same(previous[0], row):
            return {'appended': False, 'reason': 'UNCHANGED', 'id': previous[0]['id']}
        if self.path.is_file() and self.path.stat().st_size > MAX_FILE:
            raise ValueError('O registro de julgamentos atingiu o limite; arquive-o antes de continuar.')
        with self.path.open('a', encoding='utf-8') as handle:
            handle.write(json.dumps(row, ensure_ascii=False) + '\n')
            handle.flush()
            os.fsync(handle.fileno())
        return {'appended': True, 'id': row['id']}

    def read(self, limit=100):
        if not self.path.is_file():
            return []
        rows = []
        with self.path.open('r', encoding='utf-8') as handle:
            for line in handle:
                line = line.strip()
                if not line:
                    continue
                try:
                    rows.append(json.loads(line))
                except ValueError:
                    continue
        return list(reversed(rows))[:limit]

    def count(self):
        return len(self.read(10 ** 6))


def _same(previous, row):
    return all(previous.get(key) == row.get(key) for key in
               ('verdict', 'normalized', 'candidateSource', 'correctedSource', 'note'))
