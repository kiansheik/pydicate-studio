#!/usr/bin/env python3
"""Repeatable command line for the Tupi → Pydicate lab.

Exactly the operations the hidden Studio tab exposes, so a preparation, training
or evaluation run can be reproduced and scripted. Nothing here publishes corpus
source, approves a reference or calls a paid provider.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

STUDIO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(STUDIO / 'python'))
sys.dont_write_bytecode = True

from parser_lab import jobs
from parser_lab.artifacts import ArtifactStore
from parser_lab.datasets import load_profile
from parser_lab.engine import LabEngine
from parser_lab.normalization import prepare as prepare_input
from parser_lab.ranker import Ranker
from parser_lab.search import Budget, analyze
from parser_lab.contracts import result as make_result


def emit(event):
    print(json.dumps(event, ensure_ascii=False), file=sys.stderr, flush=True)


def build(arguments):
    engine = LabEngine(arguments.parent, source_id=arguments.source)
    store = ArtifactStore(arguments.artifacts)
    return engine, store


def command_prepare(arguments):
    engine, store = build(arguments)
    profile = load_profile(arguments.profile)
    manifest = jobs.prepare(engine, store, profile, progress=emit)
    if arguments.activate:
        store.activate('index', manifest['artifactId'])
    print(json.dumps({'artifactId': manifest['artifactId'], 'counts': manifest['counts'],
                      'activated': arguments.activate, 'root': str(store.root)},
                     ensure_ascii=False, indent=2))
    return 0


def command_train(arguments):
    engine, store = build(arguments)
    index_id = arguments.index or store.active_for('index')
    if not index_id:
        print('Prepare e ative um índice antes de treinar.', file=sys.stderr)
        return 2
    options = {'epochs': arguments.epochs, 'maxExamples': arguments.max_examples,
               'maxContrasts': arguments.max_contrasts}
    manifest = jobs.train(engine, store, index_id, progress=emit, options=options)
    if arguments.activate:
        store.activate('ranker', manifest['artifactId'])
    print(json.dumps({'artifactId': manifest['artifactId'], 'counts': manifest['counts'],
                      'metrics': manifest['metrics'], 'activated': arguments.activate},
                     ensure_ascii=False, indent=2))
    return 0


def command_evaluate(arguments):
    engine, store = build(arguments)
    index_id = arguments.index or store.active_for('index')
    if not index_id:
        print('Prepare e ative um índice antes de avaliar.', file=sys.stderr)
        return 2
    ranker_id = arguments.ranker or store.active_for('ranker')
    manifest = jobs.evaluate(engine, store, index_id, ranker_id, progress=emit,
                             options={'sample': arguments.sample})
    report = json.loads((store.directory(manifest['artifactId']) / 'evaluation.json')
                        .read_text(encoding='utf-8'))
    print(json.dumps({'artifactId': manifest['artifactId'], 'metrics': report['metrics'],
                      'counts': report['counts']}, ensure_ascii=False, indent=2))
    return 0


def command_analyze(arguments):
    engine, store = build(arguments)
    index_id = arguments.index or store.active_for('index', engine.context_fingerprint())
    if not index_id:
        print('Nenhum índice compatível está ativo. Execute "prepare --activate".', file=sys.stderr)
        return 2
    index = jobs.load_index(store, index_id)
    ranker_id = arguments.ranker or store.active_for('ranker', engine.context_fingerprint())
    ranker = Ranker.load(store.directory(ranker_id) / 'ranker.json') if ranker_id else None
    prepared = prepare_input(arguments.text)
    candidates, rejections, timings, diagnostics = analyze(
        engine, index, prepared['normalized'],
        budget=Budget({'maxSeconds': arguments.seconds}), ranker=ranker)
    status = 'complete' if candidates else 'unknown'
    payload = make_result(
        input_profile=prepared, context=engine.context(),
        artifacts={'index': index_id, 'ranker': ranker_id,
                   'indexCounts': index.counts()},
        candidates=candidates, rejections=rejections, timings=timings, status=status,
        message='' if candidates else 'Nenhuma análise completa foi validada para esta entrada.',
        configuration={'diagnostics': diagnostics, 'ranker': bool(ranker)})
    print(json.dumps(payload, ensure_ascii=False, indent=2))
    return 0 if candidates else 1


def command_status(arguments):
    store = ArtifactStore(arguments.artifacts)
    fingerprint = None
    if arguments.parent:
        try:
            fingerprint = LabEngine(arguments.parent, source_id=arguments.source).context_fingerprint()
        except Exception as error:
            emit({'stage': 'status', 'warning': str(error)})
    print(json.dumps(store.status(fingerprint), ensure_ascii=False, indent=2))
    return 0


def command_activate(arguments):
    store = ArtifactStore(arguments.artifacts)
    print(json.dumps(store.activate(arguments.kind, arguments.id), ensure_ascii=False, indent=2))
    return 0


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    default_parent = os.environ.get('PYDICATE_PROJECT_PARENT', str(STUDIO.parent))
    default_artifacts = os.environ.get('PYDICATE_PARSER_LAB_ARTIFACTS',
                                       str(Path.home() / '.pydicate-studio' / 'parser-lab'))
    parser.add_argument('--parent', default=default_parent, type=Path,
                        help='Pasta com oldtupicorpus e nhe-enga.')
    parser.add_argument('--artifacts', default=default_artifacts, type=Path,
                        help='Diretório de artefatos do laboratório (fora do Git).')
    parser.add_argument('--source', default='araujo_catecismo_1686',
                        help='Fonte histórica que define o contexto léxico do laboratório.')
    sub = parser.add_subparsers(dest='command', required=True)

    build_parser = sub.add_parser('prepare', help='Gerar fragmentos, índice e conjuntos.')
    build_parser.add_argument('--profile', default='smoke')
    build_parser.add_argument('--activate', action='store_true')
    build_parser.set_defaults(handler=command_prepare)

    train_parser = sub.add_parser('train', help='Treinar o classificador de candidatos.')
    train_parser.add_argument('--index')
    train_parser.add_argument('--epochs', type=int, default=8)
    train_parser.add_argument('--max-examples', type=int, default=200)
    train_parser.add_argument('--max-contrasts', type=int, default=200)
    train_parser.add_argument('--activate', action='store_true')
    train_parser.set_defaults(handler=command_train)

    evaluate_parser = sub.add_parser('evaluate', help='Executar os conjuntos de avaliação.')
    evaluate_parser.add_argument('--index')
    evaluate_parser.add_argument('--ranker')
    evaluate_parser.add_argument('--sample', type=int, default=25)
    evaluate_parser.set_defaults(handler=command_evaluate)

    analyze_parser = sub.add_parser('analyze', help='Analisar uma frase normalizada.')
    analyze_parser.add_argument('text')
    analyze_parser.add_argument('--index')
    analyze_parser.add_argument('--ranker')
    analyze_parser.add_argument('--seconds', type=float, default=6.0)
    analyze_parser.set_defaults(handler=command_analyze)

    status_parser = sub.add_parser('status', help='Listar artefatos e compatibilidade.')
    status_parser.set_defaults(handler=command_status)

    activate_parser = sub.add_parser('activate', help='Ativar um artefato concluído.')
    activate_parser.add_argument('kind', choices=('index', 'ranker', 'dataset', 'evaluation'))
    activate_parser.add_argument('id')
    activate_parser.set_defaults(handler=command_activate)

    arguments = parser.parse_args(argv)
    return arguments.handler(arguments)


if __name__ == '__main__':
    raise SystemExit(main())
