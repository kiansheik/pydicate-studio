"""Turn what the contributor actually does into data future runs can learn from.

Three things are worth keeping, and they are kept apart because they carry
different evidential weight:

* **Attempts** — every analysis request and its outcome. Cheap, automatic, and
  the only honest source of *coverage gaps*: the inputs this laboratory could
  not analyse at all. Deduplicated per (observation, artifact, outcome), so
  retyping the same sentence does not inflate anything.

* **Confirmed readings** — an accepted or corrected analysis becomes a gold
  example on *real* input, with the same schema generated examples use. These
  are the reviewed examples the evaluation suites otherwise have none of.

* **Preferences** — a judgment that separates candidates yields real pairwise
  contrasts. Unlike generated data, a human broke the tie, so these are the only
  contrasts that can teach ranking between co-generating readings.

None of this publishes corpus source or approves a reference. `reviewStatus`
stays `lab-reviewed`, distinct from the corpus's own editorial status, and a
contributor correction never becomes a generated example's equal by accident.
"""
from __future__ import annotations

import json
import os
import time
from pathlib import Path

from parser_lab import projection
from parser_lab.datasets import DATASET_SCHEMA
from parser_lab.equivalence import acceptance_from_judgments
from parser_lab.normalization import PROFILE

ATTEMPT_SCHEMA = 1
MAX_ATTEMPTS_FILE = 32 * 1024 * 1024


class AttemptLog:
    """Local, append-only record of what was asked and what came back."""

    def __init__(self, path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)

    def record(self, row):
        """Append one attempt unless an identical one is already the latest.

        Identity is (observation, artifacts, outcome, proposed sources): asking
        the same question of the same index twice is one data point, not two.
        """
        entry = {
            'schemaVersion': ATTEMPT_SCHEMA,
            'recordedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
            'normalized': row['normalized'],
            'rawInput': row.get('rawInput', ''),
            'status': row.get('status', 'unknown'),
            'candidateCount': int(row.get('candidateCount', 0)),
            'candidateSources': list(row.get('candidateSources', ()))[:25],
            'lexicalHints': list(row.get('lexicalHints') or [])[:8],
            'artifacts': row.get('artifacts', {}),
            'context': row.get('context', {}),
            'recognizedSpans': list(row.get('recognizedSpans', ()))[:50],
            'rejections': list(row.get('rejections', ()))[:10],
            'seconds': round(float(row.get('seconds', 0.0)), 4),
            'normalizerProfile': PROFILE,
        }
        if self._duplicate(entry):
            return {'appended': False, 'reason': 'UNCHANGED'}
        if self.path.is_file() and self.path.stat().st_size > MAX_ATTEMPTS_FILE:
            return {'appended': False, 'reason': 'LOG_FULL'}
        with self.path.open('a', encoding='utf-8') as handle:
            handle.write(json.dumps(entry, ensure_ascii=False) + '\n')
        return {'appended': True}

    def _duplicate(self, entry):
        rows = self.read(1)
        if not rows:
            return False
        previous = rows[0]
        return all(previous.get(key) == entry.get(key) for key in
                   ('normalized', 'status', 'candidateSources', 'artifacts'))

    def read(self, limit=None):
        if not self.path.is_file():
            return []
        rows = []
        with self.path.open('r', encoding='utf-8') as handle:
            for line in handle:
                line = line.strip()
                if line:
                    try:
                        rows.append(json.loads(line))
                    except ValueError:
                        continue
        rows.reverse()
        return rows if limit is None else rows[:limit]


def coverage_gaps(attempts, limit=40):
    """Observations this laboratory could not analyse, most frequent first.

    This is the list that says what to add next: each row is an input a real
    contributor wanted and the declared grammar and inventory could not reach.
    """
    counts, samples = {}, {}
    for row in attempts:
        if row.get('status') == 'complete':
            continue
        key = row['normalized']
        counts[key] = counts.get(key, 0) + 1
        samples.setdefault(key, row)
    rows = []
    for key, count in sorted(counts.items(), key=lambda item: (-item[1], item[0]))[:limit]:
        sample = samples[key]
        rows.append({'normalized': key, 'attempts': count,
                     'rawInput': sample.get('rawInput', ''),
                     'recognizedSpans': sample.get('recognizedSpans', []),
                     'rejections': sample.get('rejections', [])})
    return rows


def confirmed_examples(judgments):
    """Accepted and corrected analyses, in the generated-example schema.

    These are reviewed examples on real input. They are marked as contributor
    evidence so no report can silently count them as engine-generated rows.
    """
    latest = {}
    for row in sorted(judgments, key=lambda item: item.get('recordedAt', '')):
        # Selecting a provisional syntax tree is not confirmation of a missing
        # lexical meaning. Keep that judgment without scoring it as full recall.
        if row.get('candidateCompleteness') == 'partial':
            continue
        verdict = row.get('verdict')
        if verdict not in ('accepted', 'corrected'):
            continue
        source = (row.get('correctedSource') if verdict == 'corrected' else
                  row.get('candidateSource')) or ''
        if not source.strip():
            continue
        latest[row['normalized']] = (source, verdict, row)
    examples = []
    for normalized, (source, verdict, row) in sorted(latest.items()):
        try:
            tree = projection.project(source)
        except ValueError:
            continue
        examples.append({
            'schemaVersion': DATASET_SCHEMA, 'kind': 'example',
            'id': 'judged-' + normalized[:48],
            'rootRule': 'contributor', 'families': ['contributor'],
            'sourceExpression': source, 'sourceAst': tree,
            'canonicalSurface': row.get('surface', ''),
            'normalized': normalized,
            'lexemes': sorted(set(projection.lexemes(tree))),
            'bindings': {}, 'lineage': {'judgment': row.get('id'), 'verdict': verdict},
            'provenance': 'contributor-corrected' if verdict == 'corrected' else 'contributor-confirmed',
            'reviewStatus': 'lab-reviewed', 'grantsApproval': False,
            'normalizerProfile': PROFILE,
        })
    return examples


def preference_pairs(judgments):
    """Contrasts a human actually decided, ready for the ranker.

    A confirmed reading is preferred over anything rejected for the same
    observation, and over the readings that were on screen when it was chosen.
    Nothing is inferred between two readings the contributor never compared.
    """
    by_observation = {}
    for row in judgments:
        by_observation.setdefault(row.get('normalized', ''), []).append(row)
    pairs = []
    for observed, rows in sorted(by_observation.items()):
        if not observed:
            continue
        acceptance = acceptance_from_judgments(observed, rows)
        for preferred in sorted(acceptance.accepted):
            for other in sorted(acceptance.rejected | acceptance.passed_over):
                if acceptance.contrastable(preferred, other):
                    pairs.append({
                        'observed': observed, 'preferred': preferred, 'other': other,
                        'origin': 'contributor-judgment',
                        # A rejection is a stronger statement than a reading that
                        # was simply not chosen; both are kept distinguishable.
                        'strength': 'rejected' if other in acceptance.rejected else 'passed-over'})
    return pairs


def summary(attempts, judgments):
    """What the laboratory has learned from use, in numbers a contributor reads."""
    examples = confirmed_examples(judgments)
    pairs = preference_pairs(judgments)
    gaps = coverage_gaps(attempts)
    complete = sum(1 for row in attempts if row.get('status') == 'complete')
    verdicts = {}
    for row in judgments:
        verdicts[row.get('verdict')] = verdicts.get(row.get('verdict'), 0) + 1
    recall_misses = sum(1 for row in judgments
                        if row.get('verdict') == 'corrected' and row.get('correctionWasProposed') is False)
    return {
        'attempts': len(attempts),
        'attemptsComplete': complete,
        'attemptsUnknown': len(attempts) - complete,
        'judgments': len(judgments),
        'verdicts': verdicts,
        'confirmedExamples': len(examples),
        'preferencePairs': len(pairs),
        'coverageGaps': len(gaps),
        'correctionsTheSearchNeverProposed': recall_misses,
        'note': 'Dados locais do laboratório. Exemplos confirmados são evidência de '
                'contribuidor (lab-reviewed) e nunca aprovação editorial do corpus. '
                'Correções que a busca nunca propôs medem falhas de cobertura, não de ordenação.',
    }


def export(attempts, judgments, path):
    """Write the derived training material next to the raw logs, for reuse."""
    payload = {'exportedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
               'normalizerProfile': PROFILE,
               'summary': summary(attempts, judgments),
               'confirmedExamples': confirmed_examples(judgments),
               'preferencePairs': preference_pairs(judgments),
               'coverageGaps': coverage_gaps(attempts)}
    target = Path(path)
    temp = target.with_suffix(target.suffix + '.tmp')
    temp.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    os.replace(temp, target)
    return payload['summary']
