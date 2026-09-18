"""Artifact job stages: snapshot → generate → split → index → train → evaluate.

Each stage reports counts and elapsed time, writes into a staging directory and
can be cancelled. The manifest is written last, so an interrupted job leaves a
recoverable staging directory and never a half-built "complete" artifact.
"""
from __future__ import annotations

import json
import time
from pathlib import Path

from parser_lab import datasets, grammar
from parser_lab.artifacts import ArtifactStore, write_jsonl
from parser_lab.contracts import AST_SCHEMA
from parser_lab.index import LabIndex
from parser_lab.normalization import PROFILE
from parser_lab.projection import PROJECTION_VERSION

STAGES = ('snapshot', 'fragments', 'retrieval', 'examples', 'splits', 'index')


class Cancelled(RuntimeError):
    pass


def _noop(_event):
    return None


def prepare(engine, store, profile, progress=None, cancelled=None):
    """Build one index artifact. Never activates it; activation is explicit."""
    progress = progress or _noop
    cancelled = cancelled or (lambda: False)
    started = time.time()
    progress({'stage': 'snapshot', 'status': 'running'})
    context = engine.context()
    recipe = datasets.recipe_of(profile)
    lexemes = engine.lexemes()
    declared = sorted({name for members in profile['inventory'].values() for name in members})
    missing = [name for name in declared if name not in lexemes]
    if missing:
        raise ValueError('Léxico do perfil ausente no contexto: ' + ', '.join(missing[:8]))
    writer = store.begin('index', recipe=recipe, context=context,
                         normalizer_profile=PROFILE, grammar_version=grammar.GRAMMAR_VERSION,
                         ast_schema=AST_SCHEMA,
                         split_policy=profile.get('split', {}),
                         lexical_snapshot={'declared': declared,
                                           'contextLexemeCount': len(lexemes),
                                           'projectionVersion': PROJECTION_VERSION})
    counts = {}
    try:
        (writer.directory / 'profile.json').write_text(
            json.dumps(recipe, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

        progress({'stage': 'fragments', 'status': 'running'})
        fragments = list(datasets.generate_fragments(engine, profile, progress, cancelled))
        if cancelled():
            raise Cancelled('Preparação cancelada.')
        counts['fragments'] = write_jsonl(writer.path('fragments.jsonl'), fragments)
        writer.checkpoint({'stage': 'fragments', 'counts': counts})
        progress({'stage': 'fragments', 'status': 'done', 'count': counts['fragments']})

        counts['retrieval'] = 0
        if profile.get('includeRetrieval', True):
            progress({'stage': 'retrieval', 'status': 'running'})
            rows = list(datasets.build_retrieval(engine, progress, cancelled))
            if cancelled():
                raise Cancelled('Preparação cancelada.')
            counts['retrieval'] = write_jsonl(writer.path('retrieval.jsonl'), rows)
            counts['retrievalExpressions'] = sum(1 for row in rows if row['role'] == 'expression')
            writer.checkpoint({'stage': 'retrieval', 'counts': counts})
        progress({'stage': 'retrieval', 'status': 'done', 'count': counts['retrieval']})

        progress({'stage': 'examples', 'status': 'running'})
        examples = []
        for example in datasets.generate_examples(engine, profile, fragments, progress, cancelled):
            examples.append(datasets.annotate_example(engine, example))
        if cancelled():
            raise Cancelled('Preparação cancelada.')
        counts['examples'] = write_jsonl(writer.path('examples.jsonl'), examples)
        writer.checkpoint({'stage': 'examples', 'counts': counts})
        progress({'stage': 'examples', 'status': 'done', 'count': counts['examples']})

        progress({'stage': 'splits', 'status': 'running'})
        splits = datasets.assign_splits(examples, profile)
        (writer.path('splits.json')).write_text(
            json.dumps(splits, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        counts.update({'splitGroups': splits['groups'], **{f'split.{k}': v for k, v in splits['counts'].items()}})
        progress({'stage': 'splits', 'status': 'done', 'counts': splits['counts']})

        progress({'stage': 'index', 'status': 'running'})
        manifest = writer.commit(counts=counts, metrics={
            'elapsedSeconds': round(time.time() - started, 3),
            'fragmentFamilies': _family_counts(fragments)})
        progress({'stage': 'index', 'status': 'done', 'artifactId': manifest['artifactId']})
        return manifest
    except BaseException:
        # Leave the staging directory for inspection and explicit recovery.
        raise


def _family_counts(fragments):
    counts = {}
    for row in fragments:
        counts[row['family']] = counts.get(row['family'], 0) + 1
    return counts


def load_index(store, artifact_id):
    manifest = store.manifest(artifact_id)
    if not manifest:
        raise ValueError('Artefato de índice não encontrado: ' + str(artifact_id))
    return LabIndex(store.directory(artifact_id), manifest)


def train(engine, store, index_id, progress=None, cancelled=None, options=None):
    """Train the candidate ranker on contrasts produced by the runtime proposer."""
    from parser_lab.ranker import train_ranker
    progress = progress or _noop
    cancelled = cancelled or (lambda: False)
    manifest = store.manifest(index_id)
    if not manifest:
        raise ValueError('Prepare um índice antes de treinar.')
    context = engine.context()
    if manifest['context']['fingerprint'] != context['fingerprint']:
        raise ValueError('O índice foi construído com outro motor/léxico. Reconstrua antes de treinar.')
    index = load_index(store, index_id)
    recipe = {'trainer': 'logistic-pairwise-v1', 'parent': index_id, **(options or {})}
    writer = store.begin('ranker', recipe=recipe, context=context, normalizer_profile=PROFILE,
                         grammar_version=grammar.GRAMMAR_VERSION, ast_schema=AST_SCHEMA,
                         split_policy=manifest.get('splitPolicy', {}),
                         lexical_snapshot=manifest.get('lexicalSnapshot', {}), parents=[index_id])
    result = train_ranker(engine, store, index, index_id, writer, progress, cancelled, options or {})
    manifest = writer.commit(counts=result['counts'], metrics=result['metrics'], parents=[index_id])
    progress({'stage': 'train', 'status': 'done', 'artifactId': manifest['artifactId']})
    return manifest


def evaluate(engine, store, index_id, ranker_id=None, progress=None, cancelled=None, options=None):
    from parser_lab.evaluation import run_suites
    progress = progress or _noop
    cancelled = cancelled or (lambda: False)
    context = engine.context()
    index = load_index(store, index_id)
    recipe = {'evaluator': 'suites-v1', 'index': index_id, 'ranker': ranker_id, **(options or {})}
    writer = store.begin('evaluation', recipe=recipe, context=context, normalizer_profile=PROFILE,
                         grammar_version=grammar.GRAMMAR_VERSION, ast_schema=AST_SCHEMA,
                         parents=[item for item in (index_id, ranker_id) if item])
    report = run_suites(engine, store, index, index_id, ranker_id, progress, cancelled, options or {})
    (writer.path('evaluation.json')).write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    manifest = writer.commit(counts=report['counts'], metrics=report['metrics'],
                             parents=[item for item in (index_id, ranker_id) if item])
    progress({'stage': 'evaluate', 'status': 'done', 'artifactId': manifest['artifactId']})
    return manifest


def open_store(root):
    return ArtifactStore(Path(root))
