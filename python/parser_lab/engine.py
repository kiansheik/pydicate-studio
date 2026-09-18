"""Bounded binding to the selected Pydicate engine for lab work.

Every realization goes through the same interpreter, isolation and evaluation
snapshot used by ordinary authoring. Nothing here reimplements Tupi morphology:
surfaces are always obtained from the selected engine.

The lab context is deliberately *answer free*. It loads the shared lexicon only
(`line = 1`), so no saved passage expression, alias or source-local declaration
can hand an analysis to the search or to an evaluation run.
"""
from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

STUDIO_PYTHON = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(STUDIO_PYTHON))

from parser_lab.normalization import PROFILE, normalize

LEXICON_ONLY_LINE = 1
DEFAULT_SOURCE = 'araujo_catecismo_1686'
RUNTIME_FILES = ('authoring_runtime.py', 'studio_authoring.py', 'rendered_structures.py')
LAB_FILES = ('normalization.py', 'engine.py', 'grammar.py', 'search.py', 'ranker.py',
             'datasets.py', 'artifacts.py', 'evaluation.py', 'contracts.py',
             'projection.py', 'index.py', 'jobs.py')


def digest(value):
    return 'sha256:' + hashlib.sha256(value).hexdigest()


def code_fingerprint():
    """Lab + shared runtime implementation identity, for artifact invalidation."""
    hasher = hashlib.sha256()
    for name in RUNTIME_FILES:
        hasher.update((STUDIO_PYTHON / name).read_bytes())
    for name in LAB_FILES:
        path = STUDIO_PYTHON / 'parser_lab' / name
        hasher.update(path.read_bytes() if path.is_file() else b'')
    return digest(hasher.digest())


class EngineError(RuntimeError):
    pass


class LabEngine:
    """One long-lived engine context. Caches immutable results, not predicates."""

    def __init__(self, parent, source_id=DEFAULT_SOURCE, line=LEXICON_ONLY_LINE, cache_limit=200_000):
        from authoring_runtime import configure
        self.parent = Path(parent).expanduser().resolve()
        self.source_id = source_id
        self.line = line
        self.corpus = configure(self.parent)
        self.path = self.corpus / 'historic' / f'{source_id}.tu.py'
        if not self.path.is_file():
            raise EngineError(f'Fonte {source_id} não encontrada no corpus selecionado.')
        self._namespace = None
        self._surfaces = {}
        self._cache_limit = cache_limit
        self._snapshots = None

    @property
    def namespace(self):
        if self._namespace is None:
            from authoring_runtime import namespace_for
            self._namespace = namespace_for(self.corpus, self.path, self.line)
        return self._namespace

    def lexemes(self):
        """Names in scope that realize a predicate, with their definitions."""
        import inspect
        result = {}
        for name, value in self.namespace.items():
            if name.startswith('_') or inspect.isclass(value) or not callable(getattr(value, 'eval', None)):
                continue
            result[name] = getattr(value, 'definition', '') or ''
        return result

    def snapshots(self):
        if self._snapshots is None:
            from adapter import repository_snapshot, CORPUS_ROOTS, ENGINE_ROOTS
            self._snapshots = [repository_snapshot(self.parent / 'oldtupicorpus', CORPUS_ROOTS),
                               repository_snapshot(self.parent / 'nhe-enga', ENGINE_ROOTS)]
        return self._snapshots

    def context_fingerprint(self):
        """Engine + lexicon + lab-context + lab-code identity.

        Any change invalidates the artifacts built under it; callers surface a
        rebuild action rather than silently reusing incompatible data.
        """
        material = {'profile': PROFILE, 'sourceId': self.source_id, 'line': self.line,
                    'code': code_fingerprint(), 'python': sys.version.split()[0],
                    'repositories': [item['fingerprint'] for item in self.snapshots()]}
        return digest(json.dumps(material, sort_keys=True, ensure_ascii=False).encode())

    def context(self):
        return {'sourceId': self.source_id, 'line': self.line, 'answerFree': self.line <= 1,
                'normalizerProfile': PROFILE, 'fingerprint': self.context_fingerprint(),
                'lexemeCount': len(self.lexemes())}

    # -- realization -------------------------------------------------------
    def _evaluate(self, raw, annotated=False):
        from authoring_runtime import interpret, evaluation_snapshot
        from rendered_structures import isolated_namespace
        from studio_authoring import parse_ast
        syntax = parse_ast(raw)
        value = interpret(syntax, isolated_namespace(self.namespace, syntax), {})
        if not callable(getattr(value, 'eval', None)):
            raise EngineError('A expressão não resulta em um predicado realizável.')
        return str(evaluation_snapshot(value).eval(annotated=annotated))

    def surface(self, raw):
        """Memoized surface for an immutable expression. None when it fails."""
        if raw in self._surfaces:
            return self._surfaces[raw]
        try:
            value = self._evaluate(raw)
        except Exception:
            value = None
        if len(self._surfaces) < self._cache_limit:
            self._surfaces[raw] = value
        return value

    def key(self, raw):
        surface = self.surface(raw)
        return None if surface is None else normalize(surface)

    def realize(self, raw):
        """Full authoring realization: surface, annotation, morphemes, tree."""
        from authoring_runtime import realize
        return realize(raw, self.namespace)

    def tree(self, raw):
        from studio_authoring import expression_tree
        return expression_tree(raw)

    def morphemes(self, annotated):
        """Engine surface units and tag bundles, with declared provenance.

        Duplicate tags are preserved exactly as the grammar emitted them; they
        are not reinterpreted as separate semantic morphemes.
        """
        from pydicate.predicate import parse_annotated_morphs
        result = []
        for index, item in enumerate(parse_annotated_morphs(annotated)):
            result.append({'occurrence': index, 'surface': item.surface, 'tags': list(item.tags),
                           'provenance': 'engine-annotation'})
        return result
