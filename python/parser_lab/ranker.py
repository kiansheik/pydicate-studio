"""Small CPU candidate ranker: real fit, save, load and evaluate. Stdlib only.

Pairwise logistic ranking over numeric features plus sparse symbols (root rule,
family, bound lexeme, source character 3-grams). The vocabulary and the weights
are fitted on the training split only.

Label honesty: a positive is *the expression that generated the example*. An
alternative with the same realized surface is not thereby ungrammatical, so
alternatives are treated as lower-preference, not as proven errors. Contrast
pairs are only used where the two analyses differ in a way that is a real
claim — a different root rule or a different lexical identity.
"""
from __future__ import annotations

import json
import math
import random
import time

from parser_lab.normalization import normalize
from parser_lab import projection

RANKER_VERSION = 'logistic-pairwise-v1'
MAX_SYMBOLS = 6000
NGRAM = 3


def symbols_of(*, rule, families, bindings, source):
    """Sparse symbolic features: construction identity, lexemes, source n-grams."""
    rows = ['rule=' + str(rule)]
    rows.extend('family=' + str(name) for name in sorted(set(families)))
    rows.extend('lexeme=' + str(value) for value in sorted(set(bindings.values())))
    text = normalize(source) or source
    rows.extend('ngram=' + text[index:index + NGRAM] for index in range(max(len(text) - NGRAM + 1, 0)))
    return rows


class Ranker:
    def __init__(self, weights=None, bias=0.0, vocabulary=None, numeric=None, metadata=None):
        self.weights = dict(weights or {})
        self.bias = float(bias)
        self.vocabulary = list(vocabulary or [])
        self.numeric = list(numeric or [])
        self.metadata = dict(metadata or {})

    # -- scoring -----------------------------------------------------------
    def raw(self, features, symbols):
        total = self.bias
        for name in self.numeric:
            total += self.weights.get('num:' + name, 0.0) * float(features.get(name, 0.0))
        seen = set()
        for symbol in symbols:
            if symbol in seen:
                continue
            seen.add(symbol)
            total += self.weights.get('sym:' + symbol, 0.0)
        return total

    def score(self, features, symbols=()):
        value = self.raw(features, symbols)
        return 1.0 / (1.0 + math.exp(-max(-30.0, min(30.0, value))))

    def identity(self):
        return {'version': RANKER_VERSION, 'features': len(self.weights),
                'artifactId': self.metadata.get('artifactId'),
                'trainedAt': self.metadata.get('trainedAt')}

    # -- persistence -------------------------------------------------------
    def to_json(self):
        return {'version': RANKER_VERSION, 'bias': self.bias, 'weights': self.weights,
                'vocabulary': self.vocabulary, 'numeric': self.numeric, 'metadata': self.metadata}

    def save(self, path):
        from pathlib import Path
        Path(path).write_text(json.dumps(self.to_json(), ensure_ascii=False) + '\n', encoding='utf-8')

    @classmethod
    def load(cls, path):
        from pathlib import Path
        value = json.loads(Path(path).read_text(encoding='utf-8'))
        if value.get('version') != RANKER_VERSION:
            raise ValueError('Versão de classificador incompatível: ' + str(value.get('version')))
        return cls(weights=value['weights'], bias=value['bias'], vocabulary=value['vocabulary'],
                   numeric=value['numeric'], metadata=value.get('metadata', {}))


def fit(pairs, *, numeric, vocabulary, epochs=8, rate=0.1, l2=1e-4, seed=20260918):
    """Pairwise logistic SGD. `pairs` are (positive, negative) feature records."""
    model = Ranker(numeric=list(numeric), vocabulary=list(vocabulary))
    generator = random.Random(seed)
    order = list(range(len(pairs)))
    history = []
    for epoch in range(epochs):
        generator.shuffle(order)
        loss = 0.0
        for position in order:
            positive, negative = pairs[position]
            margin = model.raw(*positive) - model.raw(*negative)
            margin = max(-30.0, min(30.0, margin))
            probability = 1.0 / (1.0 + math.exp(-margin))
            loss += -math.log(max(probability, 1e-12))
            gradient = rate * (1.0 - probability)
            _update(model, positive, gradient, l2, rate)
            _update(model, negative, -gradient, l2, rate)
        history.append(round(loss / max(len(pairs), 1), 6))
    model.metadata['lossByEpoch'] = history
    return model


def _update(model, record, gradient, l2, rate):
    features, symbols = record
    for name in model.numeric:
        key = 'num:' + name
        value = float(features.get(name, 0.0))
        if value:
            model.weights[key] = model.weights.get(key, 0.0) * (1 - rate * l2) + gradient * value
    for symbol in set(symbols):
        key = 'sym:' + symbol
        if key in model.weights or symbol in model.vocabulary:
            model.weights[key] = model.weights.get(key, 0.0) * (1 - rate * l2) + gradient


# -- training data ---------------------------------------------------------

def contrast_kind(gold_ast, gold_bindings, candidate):
    """Why this alternative is a different claim, or why it is only a variant."""
    if candidate['provenance'].get('rootRule') and candidate['family'] != gold_ast.get('rootRule'):
        return 'different-root-rule'
    if set(candidate['bindings'].values()) != set(gold_bindings.values()):
        return 'different-lexical-identity'
    if candidate.get('astFingerprint') != gold_ast.get('fingerprint'):
        return 'different-structure'
    return 'variant'


def build_training_pairs(engine, index, examples, progress=None, cancelled=None, limit=None,
                         rules=None):
    """Propose with the runtime searcher, then keep examples with real contrasts."""
    from parser_lab.search import analyze, Budget, features_of

    rows = []
    statistics = {'examples': 0, 'withContrast': 0, 'goldFound': 0, 'goldMissing': 0,
                  'noAlternatives': 0}
    for example in examples:
        if cancelled and cancelled():
            break
        if limit is not None and statistics['withContrast'] >= limit:
            break
        statistics['examples'] += 1
        if progress and statistics['examples'] % 25 == 0:
            progress({'stage': 'contrasts', 'processed': statistics['examples'],
                      'kept': statistics['withContrast']})
        observed = example['normalized']
        candidates, _rejections, _timings, _diagnostics = analyze(
            engine, index, observed, budget=Budget({'maxCandidates': 12, 'maxSeconds': 3.0}),
            rules=rules)
        if len(candidates) < 2:
            statistics['noAlternatives'] += 1
            continue
        gold_projection = example['sourceAst']
        gold = None
        for row in candidates:
            try:
                if projection.project(row['source']) == gold_projection:
                    gold = row
                    break
            except ValueError:
                continue
        if gold is None:
            statistics['goldMissing'] += 1
            continue
        statistics['goldFound'] += 1
        alternatives = [row for row in candidates if row is not gold]
        kept = []
        for row in alternatives:
            kind = ('different-root-rule' if row['family'] != gold['family'] else
                    'different-lexical-identity'
                    if set(row['bindings'].values()) != set(gold['bindings'].values())
                    else 'variant')
            # A "variant" shares rule and lexemes: it is not a contrast we can
            # justify labelling, so it stays unlabelled and out of training.
            if kind != 'variant':
                kept.append((row, kind))
        if not kept:
            statistics['noAlternatives'] += 1
            continue
        statistics['withContrast'] += 1
        positive = (gold['features'], symbols_of(rule=gold['family'], families=gold['provenance'].get('families', []),
                                                 bindings=gold['bindings'], source=gold['source']))
        for row, kind in kept:
            negative = (row['features'], symbols_of(rule=row['family'],
                                                    families=row['provenance'].get('families', []),
                                                    bindings=row['bindings'], source=row['source']))
            rows.append({'positive': positive, 'negative': negative, 'contrast': kind,
                         'observed': observed, 'goldSource': gold['source'],
                         'alternativeSource': row['source']})
    if progress:
        progress({'stage': 'contrasts', 'processed': statistics['examples'],
                  'kept': statistics['withContrast'], 'status': 'done'})
    return rows, statistics


def symmetric_pairs(pairs):
    """Pairs whose two analyses each appear as the other's generator.

    A symmetric pair is genuine ambiguity: the surface does not determine which
    expression produced it, so no ranker can be expected to decide it.
    """
    seen = {(pair['goldSource'], pair['alternativeSource']) for pair in pairs}
    return sum(1 for left, right in seen if (right, left) in seen)


def train_ranker(engine, store, index, index_id, writer, progress, cancelled, options):
    """Full trainable path used by the job runner and the CLI."""
    from parser_lab.artifacts import read_jsonl
    from parser_lab.search import features_of

    started = time.time()
    directory = store.directory(index_id)
    splits = json.loads((directory / 'splits.json').read_text(encoding='utf-8'))
    examples = list(read_jsonl(directory / 'examples.jsonl'))
    from parser_lab.datasets import split_of
    train_examples = [row for row in examples if split_of(splits, row) == 'train']
    dev_examples = [row for row in examples if split_of(splits, row) == 'dev']
    limit = options.get('maxExamples')
    if limit:
        train_examples = train_examples[:limit]
        dev_examples = dev_examples[:max(limit // 4, 1)]
    progress({'stage': 'contrasts', 'status': 'running', 'train': len(train_examples)})
    pairs, statistics = build_training_pairs(engine, index, train_examples, progress, cancelled,
                                             limit=options.get('maxContrasts'))
    if not pairs:
        raise ValueError('Não há contrastes suficientes para treinar. '
                         'Amplie o perfil ou mantenha a ordenação determinística.')
    numeric = sorted({name for pair in pairs for name in pair['positive'][0]})
    counter = {}
    for pair in pairs:
        for symbol in set(pair['positive'][1]) | set(pair['negative'][1]):
            counter[symbol] = counter.get(symbol, 0) + 1
    vocabulary = [symbol for symbol, _ in
                  sorted(counter.items(), key=lambda item: (-item[1], item[0]))[:MAX_SYMBOLS]]
    progress({'stage': 'fit', 'status': 'running', 'pairs': len(pairs),
              'numeric': len(numeric), 'symbols': len(vocabulary)})
    model = fit([(pair['positive'], pair['negative']) for pair in pairs],
                numeric=numeric, vocabulary=vocabulary,
                epochs=options.get('epochs', 8), rate=options.get('rate', 0.1),
                seed=options.get('seed', 20260918))
    model.metadata.update({'artifactId': writer.id, 'trainedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
                           'contrastStatistics': statistics, 'parent': index_id})
    model.save(writer.path('ranker.json'))
    contrast_rows = [{'observed': pair['observed'], 'gold': pair['goldSource'],
                      'alternative': pair['alternativeSource'], 'contrast': pair['contrast']}
                     for pair in pairs[:500]]
    (writer.path('contrasts.json')).write_text(
        json.dumps({'pairs': len(pairs), 'sample': contrast_rows}, ensure_ascii=False, indent=2) + '\n',
        encoding='utf-8')
    progress({'stage': 'fit', 'status': 'done'})

    # Held-out pairwise comparison against the deterministic baseline.
    dev_pairs, dev_statistics = build_training_pairs(engine, index, dev_examples, progress, cancelled,
                                                     limit=options.get('maxContrasts'))
    trained_correct = baseline_correct = 0
    for pair in dev_pairs:
        if model.raw(*pair['positive']) > model.raw(*pair['negative']):
            trained_correct += 1
        if pair['positive'][0].get('ast_nodes', 0) <= pair['negative'][0].get('ast_nodes', 0):
            baseline_correct += 1
    trained = round(trained_correct / len(dev_pairs), 4) if dev_pairs else None
    baseline = round(baseline_correct / len(dev_pairs), 4) if dev_pairs else None
    metrics = {
        'trainPairs': len(pairs), 'devPairs': len(dev_pairs),
        'trainSymmetricPairs': symmetric_pairs(pairs),
        'devSymmetricPairs': symmetric_pairs(dev_pairs),
        'devPairwiseAccuracy': trained,
        'devBaselinePairwiseAccuracy': baseline,
        'improvesOverBaseline': bool(trained is not None and baseline is not None and trained > baseline),
        'recommendActivation': bool(trained is not None and baseline is not None and trained > baseline),
        'finalLoss': model.metadata['lossByEpoch'][-1] if model.metadata.get('lossByEpoch') else None,
        'elapsedSeconds': round(time.time() - started, 3),
        'note': 'A acurácia pareada compara a expressão geradora com uma alternativa de '
                'estrutura ou léxico diferentes. Não é uma probabilidade calibrada nem '
                'prova que a alternativa seja agramatical. Um par simétrico — em que as '
                'duas análises se geram mutuamente a partir da mesma forma — é ambiguidade '
                'real e não pode ser decidido por estas características.',
    }
    counts = {'trainExamples': len(train_examples), 'devExamples': len(dev_examples),
              'trainPairs': len(pairs), 'devPairs': len(dev_pairs),
              'numericFeatures': len(numeric), 'symbolFeatures': len(vocabulary),
              **{f'contrast.{k}': v for k, v in statistics.items()}}
    return {'counts': counts, 'metrics': metrics, 'model': model,
            'devStatistics': dev_statistics}
