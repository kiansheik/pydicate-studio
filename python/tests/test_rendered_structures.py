"""Natural lookup is text matching; insertion also proves structural equivalence."""
import ast
import json
import os
from pathlib import Path
import sys
import tempfile
import time
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from adapter import AdapterError, ProjectAdapter
from authoring_runtime import configure, namespace_for, shape
from rendered_structures import declarations, evaluated, fingerprint, isolated_namespace, normalize, resolve, search, valid_index


class SearchTests(unittest.TestCase):
    def row(self, identifier, surface, expression='a', definition=''):
        return {'id': identifier, 'surface': surface, 'expression': expression, 'kind': 'expression', 'source': {'label': identifier}, 'definition': definition, '_structure': identifier}

    def test_spaces_unicode_case_and_apostrophes_preserve_exact_accent_distinctions(self):
        self.assertEqual(normalize('  TUPA\u0303\t  O’KA '), normalize("tupão'ka"))
        rows = [self.row('nasal', 'Tupã'), self.row('oral', 'tupa')]
        found = search(rows, 'tu pã')['results']
        self.assertEqual([(r['id'], r['match']) for r in found], [('nasal', 'exact'), ('oral', 'relaxed')])
        self.assertNotIn('_structure', found[0])

    def test_same_surface_structures_stay_distinct_and_long_segments_sort_first(self):
        rows = [self.row('a', 'oemitymbûerypy'), self.row('b', 'oemitymbûerypy', 'b'), self.row('c', 'ypy'), self.row('d', 'em')]
        self.assertEqual(search(rows, 'o emi tym bûer ypy')['total'], 3)
        results = search(rows, 'xe oemitymbûerypy pupé')['results']
        self.assertEqual([r['id'] for r in results], ['a', 'b', 'c'])
        self.assertTrue(all(r['match'] == 'segment' for r in results))
        self.assertEqual(search(rows, '   ')['results'], [])

    def test_corrupt_cache_is_discardable(self):
        for value in (None, [], {'entries': [{}], 'diagnostics': []}, {'entries': [], 'diagnostics': [None]}):
            self.assertFalse(valid_index(value))
        self.assertTrue(valid_index({'entries': [], 'diagnostics': []}))

    def test_future_redefinition_is_not_the_origin_of_an_earlier_reference(self):
        with tempfile.TemporaryDirectory() as directory:
            corpus = Path(directory)
            (corpus / 'historic').mkdir()
            (corpus / 'historic/lexicon.tu.py').write_text('known = shared\n')
            source = corpus / 'historic/source.tu.py'
            source.write_text('known = earlier\nl = [known]\nknown = later\n')
            self.assertEqual(declarations(corpus, source, 2)['known']['expression'], 'earlier')
            self.assertEqual(declarations(corpus, source, 10**9)['known']['expression'], 'later')

    def test_helper_globals_are_copied_before_mutating_evaluation(self):
        class Predicate:
            def __init__(self): self.history = []
            def eval(self): return 'ok'
        shared = Predicate()
        globals_map = {'shared': shared, '__name__': 'historic.fixture'}
        exec('def helper():\n    shared.history.append("mutation")\n    return shared', globals_map)
        original = {'helper': globals_map['helper']}
        cloned = isolated_namespace(original, ast.parse('helper()', mode='eval'))
        cloned['helper']()
        self.assertEqual(shared.history, [])
        self.assertEqual(cloned['helper'].__globals__['shared'].history, ['mutation'])


REAL = Path(os.environ.get('PYDICATE_PROJECT_PARENT', str(Path(__file__).resolve().parents[3]))).expanduser().resolve()


@unittest.skipUnless((REAL / 'oldtupicorpus/historic/araujo_catecismo_1686.tu.py').exists(), 'selected corpus not installed')
class RealReuseTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix='studio-rendered-index-')
        cls.adapter = ProjectAdapter(Path(cls.temp.name))
        cls.project = cls.adapter.open_project(str(REAL))
        cls.params = {'passageId': cls.project['passages'][0]['id'], 'projectId': cls.project['id']}
        cls.source = REAL / 'oldtupicorpus/historic/araujo_catecismo_1686.tu.py'
        cls.original = cls.source.read_bytes()
        start = time.monotonic()
        cls.first = cls.adapter.invoke('structure_search', {**cls.params, 'query': 'o emi tym bûer ypy'})
        cls.cold_seconds = time.monotonic() - start
        cls.corpus = configure(REAL)

    @classmethod
    def tearDownClass(cls):
        assert cls.source.read_bytes() == cls.original
        cls.temp.cleanup()

    def test_real_unnamed_stage_found_and_reused_in_earlier_passage(self):
        candidate = self.first['results'][0]
        self.assertEqual(candidate['surface'], 'oemitymbûerypy')
        self.assertEqual(candidate['match'], 'exact')
        self.assertEqual(candidate['source']['ordinal'], 81)
        self.assertEqual(candidate['kind'], 'expression')
        result = self.adapter.invoke('structure_resolve', {**self.params, 'candidateId': candidate['id'], 'indexFingerprint': self.first['indexFingerprint']})
        self.assertEqual(result['expression'], '(pûera * (og * (emi * tym))) / ypy')
        self.assertEqual(result['surface'], candidate['surface'])

    def test_every_indexed_occurrence_repeats_the_same_standalone_structure_and_surface(self):
        namespaces = {}
        for row in self.adapter.structure_cache['base']['entries']:
            context = row['_context']
            key = (context['sourceId'], context['line'])
            if key not in namespaces:
                namespaces[key] = namespace_for(self.corpus, self.corpus / 'historic' / (key[0] + '.tu.py'), key[1])
            with self.subTest(expression=row['expression'], source=row['source']['label']):
                self.assertEqual(evaluated(row['expression'], namespaces[key]), {'surface': row['surface'], 'structure': row['_structure']})

    def test_warm_queries_do_not_spawn_engine_and_restart_reads_durable_cache(self):
        from authoring_service import AuthoringService
        with patch.object(AuthoringService, 'child', side_effect=AssertionError('warm query must not reevaluate')):
            result = self.adapter.invoke('structure_search', {**self.params, 'query': 'tupã'})
            self.assertGreater(result['total'], 0)
            reopened = ProjectAdapter(Path(self.temp.name))
            reopened.open_project(str(REAL))
            result = reopened.invoke('structure_search', {**self.params, 'query': 'tupã'})
            self.assertGreater(result['total'], 0)

    def test_draft_subtrees_refresh_and_old_selection_rejected(self):
        first_draft = {'passageId': self.params['passageId'], 'sourceId': 'araujo_catecismo_1686', 'revisionId': 'a', 'raw': 'Noun("reuse-probe") * Noun("second-probe")'}
        params = {**self.params, 'drafts': [first_draft], 'query': 'reuse-probe'}
        found = self.adapter.invoke('structure_search', params)
        self.assertTrue(any(row['source'].get('draft') and row['surface'] == 'reuse-probe' for row in found['results']))
        row = next(row for row in found['results'] if row['surface'] == 'reuse-probe')
        resolved = self.adapter.invoke('structure_resolve', {**params, 'candidateId': row['id'], 'indexFingerprint': found['indexFingerprint']})
        self.assertEqual(resolved['surface'], 'reuse-probe')
        revision_only = self.adapter.invoke('structure_search', {**params, 'drafts': [{**first_draft, 'revisionId': 'b'}]})
        self.assertEqual(found['indexFingerprint'], revision_only['indexFingerprint'])
        with self.assertRaisesRegex(AdapterError, 'mudaram'):
            self.adapter.invoke('structure_resolve', {**params, 'drafts': [{**first_draft, 'raw': 'tym'}], 'candidateId': row['id'], 'indexFingerprint': found['indexFingerprint']})
        self.adapter.invoke('structure_search', {**self.params, 'query': 'tym'})

    def test_conflicting_alias_copies_definition_but_never_accepts_same_surface_alone(self):
        context = {'sourceId': 'araujo_catecismo_1686', 'line': self.project['passages'][0]['sourceLine']}
        ns = namespace_for(self.corpus, self.source, context['line'])
        original = ns['tym']
        conflict = ns['ypy']
        # Same spelling but different grammar/meaning must not pass as equivalent.
        changed = original.copy(); changed.definition = 'another meaning'
        origin = {**ns, 'remembered': original}
        destination = {**ns, 'remembered': changed}
        exact = evaluated('remembered', origin)
        candidate = {'expression': 'remembered', 'surface': exact['surface'], '_structure': exact['structure'], '_context': context, 'kind': 'reference', 'source': {'label': 'fixture'}}
        with patch('authoring_runtime.namespace_for', side_effect=[origin, destination]), patch('rendered_structures.declarations', return_value={'remembered': {'expression': 'tym'}}):
            resolved = resolve({'candidate': candidate, **context}, self.corpus)
        self.assertTrue(resolved['copied'])
        self.assertEqual(resolved['expression'], 'tym')
        with patch('authoring_runtime.namespace_for', side_effect=[origin, {**ns, 'remembered': conflict}]), patch('rendered_structures.declarations', return_value={}):
            with self.assertRaisesRegex(ValueError, 'cópia equivalente'):
                resolve({'candidate': candidate, **context}, self.corpus)

    def test_context_and_engine_staleness_rejected(self):
        with self.assertRaisesRegex(AdapterError, 'projeto mudou'):
            self.adapter.invoke('structure_search', {**self.params, 'projectId': 'other', 'query': 'tym'})
        with self.assertRaises(AdapterError):
            self.adapter.invoke('structure_search', {'passageId': 'pending:probe', 'sourceId': '../escape', 'query': 'tym'})
        with self.assertRaises(AdapterError):
            self.adapter.invoke('structure_search', {'passageId': 'deleted-passage', 'sourceId': 'araujo_catecismo_1686', 'query': 'tym'})
        with self.assertRaises(AdapterError):
            self.adapter.invoke('structure_search', {**self.params, 'engineFingerprint': 'stale', 'query': 'tym'})


if __name__ == '__main__':
    unittest.main()
