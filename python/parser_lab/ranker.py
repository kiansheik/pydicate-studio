"""Small CPU candidate ranker: real fit, save, load and evaluate. Stdlib only.

Pairwise logistic ranking over numeric features plus sparse symbols (root rule,
family, bound lexeme, source character 3-grams). The vocabulary and the weights
are fitted on the training split only.

Label honesty: every candidate the search returns realizes the whole
observation, so two candidates for one input are readings the surface cannot
separate. Only a contributor judgment can make one of them preferable, and only
such decided pairs are trained on. A generating expression is not, by itself,
evidence that the alternatives are wrong.
"""
from __future__ import annotations

import json
import math
import random
import time

from parser_lab.equivalence import acceptance_from_judgments
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

def _record(candidate):
    """Feature record for one candidate, as both scoring and fitting see it."""
    return (candidate['features'], symbols_of(
        rule=candidate['family'], families=candidate['provenance'].get('families', []),
        bindings=candidate['bindings'], source=candidate['source']))


def build_training_pairs(engine, index, examples, progress=None, cancelled=None, limit=None,
                         rules=None, judgments=()):
    """Propose with the runtime searcher, then keep only decided contrasts.

    Every candidate the search returns already realizes the whole observation, so
    two candidates for one input are co-generating readings the surface cannot
    separate. Training the ranker to prefer whichever happened to generate a
    synthetic row would teach an arbitrary preference and then report it as
    accuracy. Such pairs are counted and skipped.

    A pair survives only when a contributor judgment separated it. That is the
    honest consequence of a sound validator: ranking supervision comes from
    readers, not from the generator.
    """
    from parser_lab.search import analyze, Budget

    rows = []
    statistics = {'examples': 0, 'withContrast': 0, 'goldFound': 0, 'goldMissing': 0,
                  'noAlternatives': 0, 'coGeneratingSkipped': 0, 'undecidedObservations': 0}
    for example in examples:
        if cancelled and cancelled():
            break
        if limit is not None and statistics['withContrast'] >= limit:
            break
        statistics['examples'] += 1
        if progress and statistics['examples'] % 25 == 0:
            progress({'stage': 'contrasts', 'processed': statistics['examples'],
                      'kept': statistics['withContrast'],
                      'coGeneratingSkipped': statistics['coGeneratingSkipped']})
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
        acceptance = acceptance_from_judgments(observed, judgments)
        if not acceptance.decided():
            statistics['undecidedObservations'] += 1
        kept = []
        for row in candidates:
            if row is gold:
                continue
            if acceptance.contrastable(gold['source'], row['source']):
                kept.append(row)
            else:
                statistics['coGeneratingSkipped'] += 1
        if not kept:
            continue
        statistics['withContrast'] += 1
        for row in kept:
            rows.append({'positive': _record(gold), 'negative': _record(row),
                         'contrast': 'contributor-decided', 'observed': observed,
                         'goldSource': gold['source'], 'alternativeSource': row['source'],
                         'origin': 'judged-generated'})
    if progress:
        progress({'stage': 'contrasts', 'processed': statistics['examples'],
                  'kept': statistics['withContrast'],
                  'coGeneratingSkipped': statistics['coGeneratingSkipped'], 'status': 'done'})
    return rows, statistics


def human_pairs(engine, index, judgments, progress=None, cancelled=None):
    """Contrasts a contributor decided, turned into feature records.

    Both sides must still be reachable by the current searcher, because a ranker
    can only reorder what the search proposes. A preferred reading the search
    never proposes is a *coverage* failure, counted separately so it is never
    mistaken for a ranking result.
    """
    from parser_lab.search import analyze, Budget
    from parser_lab.feedback import preference_pairs

    rows = []
    statistics = {'declared': 0, 'usable': 0, 'preferredNotProposed': 0,
                  'alternativeNotProposed': 0}
    by_observation = {}
    for pair in preference_pairs(judgments):
        by_observation.setdefault(pair['observed'], []).append(pair)
    for observed, pairs in sorted(by_observation.items()):
        if cancelled and cancelled():
            break
        candidates, _rejections, _timings, _diagnostics = analyze(
            engine, index, observed, budget=Budget({'maxCandidates': 25, 'maxSeconds': 5.0}))
        found = {row['source']: row for row in candidates}
        for pair in pairs:
            statistics['declared'] += 1
            preferred = found.get(pair['preferred'])
            other = found.get(pair['other'])
            if preferred is None:
                statistics['preferredNotProposed'] += 1
                continue
            if other is None:
                statistics['alternativeNotProposed'] += 1
                continue
            statistics['usable'] += 1
            rows.append({'positive': _record(preferred), 'negative': _record(other),
                         'contrast': 'contributor-judgment', 'observed': observed,
                         'goldSource': pair['preferred'], 'alternativeSource': pair['other'],
                         'origin': 'judgment'})
        if progress:
            progress({'stage': 'human-contrasts', 'observations': len(by_observation),
                      'usable': statistics['usable']})
    return rows, statistics


def train_ranker(engine, store, index, index_id, writer, progress, cancelled, options):
    """Full trainable path used by the job runner and the CLI.

    Two sources feed it, and they are kept distinguishable in the artifact:
    contrasts a contributor decided (the only supervision a sound validator can
    leave behind), and generated examples whose alternatives a judgment has
    separated. Co-generating readings nobody has decided are skipped, counted
    and reported, never silently trained against.
    """
    from parser_lab.artifacts import read_jsonl
    from parser_lab.datasets import split_of

    started = time.time()
    directory = store.directory(index_id)
    splits = json.loads((directory / 'splits.json').read_text(encoding='utf-8'))
    examples = list(read_jsonl(directory / 'examples.jsonl'))
    judgments = list(options.get('judgments') or ())
    train_examples = [row for row in examples if split_of(splits, row) == 'train']
    dev_examples = [row for row in examples if split_of(splits, row) == 'dev']
    limit = options.get('maxExamples')
    if limit:
        train_examples = train_examples[:limit]
        dev_examples = dev_examples[:max(limit // 4, 1)]

    progress({'stage': 'human-contrasts', 'status': 'running', 'judgments': len(judgments)})
    judged_pairs, judged_statistics = human_pairs(engine, index, judgments, progress, cancelled)
    progress({'stage': 'contrasts', 'status': 'running', 'train': len(train_examples)})
    generated_pairs, statistics = build_training_pairs(
        engine, index, train_examples, progress, cancelled,
        limit=options.get('maxContrasts'), judgments=judgments)
    pairs = judged_pairs + generated_pairs
    if not pairs:
        raise ValueError(
            'Não há contrastes decididos para treinar. Toda análise devolvida realiza a '
            'mesma forma, então duas leituras só podem ser separadas por um julgamento do '
            'contribuidor. Analise frases, escolha ou corrija a leitura correta em Analisar '
            'e treine de novo; até lá a ordenação determinística permanece ativa.')

    numeric = sorted({name for pair in pairs for name in pair['positive'][0]})
    counter = {}
    for pair in pairs:
        for symbol in set(pair['positive'][1]) | set(pair['negative'][1]):
            counter[symbol] = counter.get(symbol, 0) + 1
    vocabulary = [symbol for symbol, _ in
                  sorted(counter.items(), key=lambda item: (-item[1], item[0]))[:MAX_SYMBOLS]]
    progress({'stage': 'fit', 'status': 'running', 'pairs': len(pairs),
              'judgmentPairs': len(judged_pairs), 'numeric': len(numeric),
              'symbols': len(vocabulary)})
    model = fit([(pair['positive'], pair['negative']) for pair in pairs],
                numeric=numeric, vocabulary=vocabulary,
                epochs=options.get('epochs', 8), rate=options.get('rate', 0.1),
                seed=options.get('seed', 20260918))
    model.metadata.update({'artifactId': writer.id,
                           'trainedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
                           'contrastStatistics': statistics,
                           'judgmentStatistics': judged_statistics, 'parent': index_id})
    model.save(writer.path('ranker.json'))
    (writer.path('contrasts.json')).write_text(json.dumps({
        'pairs': len(pairs), 'fromJudgments': len(judged_pairs),
        'fromGeneratedExamples': len(generated_pairs),
        'sample': [{'observed': pair['observed'], 'preferred': pair['goldSource'],
                    'alternative': pair['alternativeSource'], 'origin': pair['origin']}
                   for pair in pairs[:500]]}, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    progress({'stage': 'fit', 'status': 'done'})

    # Held-out comparison against the deterministic ordering, on decided pairs only.
    dev_pairs, dev_statistics = build_training_pairs(
        engine, index, dev_examples, progress, cancelled,
        limit=options.get('maxContrasts'), judgments=judgments)
    trained_correct = baseline_correct = 0
    for pair in dev_pairs:
        if model.raw(*pair['positive']) > model.raw(*pair['negative']):
            trained_correct += 1
        if pair['positive'][0].get('ast_nodes', 0) <= pair['negative'][0].get('ast_nodes', 0):
            baseline_correct += 1
    trained = round(trained_correct / len(dev_pairs), 4) if dev_pairs else None
    baseline = round(baseline_correct / len(dev_pairs), 4) if dev_pairs else None
    metrics = {
        'trainPairs': len(pairs),
        'trainPairsFromJudgments': len(judged_pairs),
        'trainPairsFromGeneratedExamples': len(generated_pairs),
        'devPairs': len(dev_pairs),
        'coGeneratingSkipped': statistics['coGeneratingSkipped'],
        'undecidedObservations': statistics['undecidedObservations'],
        'judgmentsPreferredNotProposed': judged_statistics['preferredNotProposed'],
        'devPairwiseAccuracy': trained,
        'devBaselinePairwiseAccuracy': baseline,
        'improvesOverBaseline': bool(trained is not None and baseline is not None and trained > baseline),
        'recommendActivation': bool(trained is not None and baseline is not None and trained > baseline),
        'finalLoss': model.metadata['lossByEpoch'][-1] if model.metadata.get('lossByEpoch') else None,
        'elapsedSeconds': round(time.time() - started, 3),
        'note': 'Só pares decididos por um contribuidor entram no treino: duas leituras que '
                'geram a mesma forma são ambiguidade, não erro, e treinar nelas ensinaria uma '
                'preferência arbitrária. Uma leitura preferida que a busca nunca propõe é '
                'falha de cobertura, contada à parte e não corrigível por ordenação. '
                'A acurácia pareada não é uma probabilidade calibrada.',
    }
    counts = {'trainExamples': len(train_examples), 'devExamples': len(dev_examples),
              'judgments': len(judgments),
              'trainPairs': len(pairs), 'devPairs': len(dev_pairs),
              'numericFeatures': len(numeric), 'symbolFeatures': len(vocabulary),
              **{f'contrast.{k}': v for k, v in statistics.items()},
              **{f'judgment.{k}': v for k, v in judged_statistics.items()}}
    return {'counts': counts, 'metrics': metrics, 'model': model,
            'devStatistics': dev_statistics}
