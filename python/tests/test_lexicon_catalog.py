"""Reuse complete lexical catalogs without reusing stale namespaces or results."""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from adapter import AdapterError, ProjectAdapter
from authoring_runtime import lexicon_result
from authoring_service import AuthoringService


class LexiconCatalogTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(prefix='studio-lexicon-catalog-')
        self.addCleanup(temporary.cleanup)
        self.parent = Path(temporary.name)
        self.historic = self.parent / 'oldtupicorpus/historic'
        self.historic.mkdir(parents=True)
        for source in ('first', 'second'):
            (self.historic / (source + '.tu.py')).write_text(
                "probe = Noun('amen')\nl = [probe]\n" + source + ' = l\n', encoding='utf-8')
        self.project = {'id': 'project', 'engineFingerprint': 'engine',
                        'sources': [{'id': 'first'}, {'id': 'second'}], 'passages': [
                            {'id': 'passage:a', 'sourceId': 'first', 'sourceLine': 2},
                            {'id': 'passage:b', 'sourceId': 'first', 'sourceLine': 20},
                            {'id': 'passage:c', 'sourceId': 'second', 'sourceLine': 2}]}
        self.adapter = SimpleNamespace(parent=self.parent, project=self.project)
        self.params = {'projectId': 'project', 'passageId': 'passage:a', 'engineFingerprint': 'engine'}
        self.rows = [{'name': 'entry_' + str(index), 'definition': '', 'surface': 'form_' + str(index),
                      'uses': [index], 'provenance': {'source': 'original'}} for index in range(120)]
        self.rows.extend([
            {'name': 'z_exact', 'definition': '', 'surface': 'abá'},
            {'name': 'a_meaning', 'definition': 'pessoa aba', 'surface': 'other'},
            {'name': 'b_prefix', 'definition': '', 'surface': 'abacaxi'}])
        self.fresh_patch = patch.object(AuthoringService, 'fresh', return_value='engine')
        self.fresh = self.fresh_patch.start()
        self.addCleanup(self.fresh_patch.stop)
        self.child_patch = patch.object(AuthoringService, 'child', side_effect=self.build)
        self.child = self.child_patch.start()
        self.addCleanup(self.child_patch.stop)

    def build(self, payload):
        self.assertEqual(payload['action'], 'lexicon_catalog')
        self.assertNotIn('query', payload)
        self.assertNotIn('limit', payload)
        return {'entries': json.loads(json.dumps(self.rows))}

    def search(self, **params):
        # A new service for every call matches ProjectAdapter.invoke ownership.
        return AuthoringService(self.adapter).lexicon_search({**self.params, **params})

    def test_query_and_limit_rank_the_full_catalog_without_repeating_evaluation(self):
        first = self.search(query='aba', limit=1)
        self.assertEqual(first['total'], 3)
        self.assertEqual([row['name'] for row in first['results']], ['z_exact'])
        second = self.search(query='aba', limit=10)
        self.assertEqual([row['name'] for row in second['results']], ['z_exact', 'a_meaning', 'b_prefix'])
        self.assertEqual(self.search(query='entry_119', limit=1)['results'][0]['name'], 'entry_119')
        self.assertEqual(self.search(query='', limit=200)['total'], 123)
        self.assertEqual(len(self.search(query='', limit=200)['results']), 100)
        self.assertEqual(self.child.call_count, 1)
        self.assertEqual(self.fresh.call_count, 10, 'cache hits retain both exact freshness checks')

    def test_returned_nested_values_and_draft_only_changes_cannot_mutate_the_catalog(self):
        first = self.search(query='entry_1')
        first['results'][0]['uses'].append(999)
        first['results'][0]['provenance']['source'] = 'changed'
        second = self.search(query='entry_1', raw='unrelated', revisionId='new',
                             drafts=[{'passageId': 'passage:a', 'raw': 'another'}])
        self.assertNotIn(999, second['results'][0]['uses'])
        self.assertEqual(second['results'][0]['provenance']['source'], 'original')
        second['results'].clear()
        self.assertTrue(self.search(query='entry_1')['results'])
        self.assertEqual(self.child.call_count, 1)

    def test_source_line_project_path_and_engine_each_select_a_distinct_catalog(self):
        self.search()
        self.search(passageId='passage:b')
        self.search(passageId='passage:c')
        self.project['passages'][0]['sourceLine'] = 9
        self.search()
        self.project['id'] = 'other-project'
        self.params['projectId'] = 'other-project'
        self.search()
        self.adapter.parent = self.parent / 'other-parent'
        self.search()
        self.fresh.return_value = 'new-engine'
        self.search()
        self.assertEqual(self.child.call_count, 7)
        for params, code in [({'projectId': 'missing'}, 'STALE_PROJECT'),
                             ({'passageId': 'missing'}, 'PASSAGE_NOT_FOUND'),
                             ({'sourceId': 'second'}, 'PASSAGE_NOT_FOUND')]:
            with self.subTest(params=params), self.assertRaises(AdapterError) as failure:
                self.search(**params)
            self.assertEqual(failure.exception.code, code)
        self.assertEqual(self.child.call_count, 7)

    def test_pending_insertion_anchor_is_resolved_before_cache_lookup(self):
        pending = {'passageId': 'pending:00000000-0000-4000-8000-000000000001', 'sourceId': 'first'}
        self.search(**pending, beforePassageId='passage:a')
        self.search(**pending, beforePassageId='passage:b')
        self.search(**pending)
        self.search(**pending)
        self.assertEqual([call.args[0]['line'] for call in self.child.call_args_list], [2, 20, 3])
        path = self.historic / 'first.tu.py'
        path.write_text(path.read_text().replace('first = l', '\nfirst = l'))
        self.search(**pending)
        self.assertEqual(self.child.call_args.args[0]['line'], 4)
        with self.assertRaises(AdapterError) as failure:
            self.search(**pending, beforePassageId='passage:c')
        self.assertEqual(failure.exception.code, 'STALE_INSERTION')

    def test_definition_context_keeps_its_separate_scope_and_does_not_use_ordinary_cache(self):
        self.search()
        with self.assertRaises(AdapterError) as failure:
            self.search(definitionContext={})
        self.assertEqual(failure.exception.code, 'LEXICAL_SCOPE')
        self.assertEqual(self.child.call_count, 1)
        owner = {'sourceId': 'first', 'line': 2, 'scope': 'source'}
        with patch.object(AuthoringService, '_definition_context', return_value=owner) as checked:
            self.child.side_effect = lambda payload: {'results': [], 'total': 0}
            self.search(definitionContext={'declarationId': 'selected'}, includeLaterDefinitions=True)
            self.search(definitionContext={'declarationId': 'selected'})
            self.assertEqual(checked.call_count, 2)
        self.assertEqual(self.child.call_count, 3)
        self.assertEqual(self.child.call_args.args[0]['action'], 'lexicon_tree_search')
        self.assertEqual(self.child.call_args.args[0]['declarationLine'], 2)
        self.search()
        self.assertEqual(self.child.call_count, 3)

    def test_failures_and_changed_content_during_build_never_populate_cache(self):
        self.child.side_effect = AdapterError('child failed', 'ENGINE_ERROR')
        with self.assertRaises(AdapterError): self.search()
        self.child.side_effect = self.build
        self.fresh.side_effect = ['engine', AdapterError('changed during build', 'STALE_ENGINE')]
        with self.assertRaises(AdapterError): self.search()
        self.fresh.side_effect = None
        self.search()
        self.assertEqual(self.child.call_count, 3)
        self.fresh.side_effect = AdapterError('changed before hit', 'STALE_ENGINE')
        with self.assertRaises(AdapterError): self.search()
        self.assertEqual(self.child.call_count, 3)

    def test_lru_and_serialized_byte_limits_bound_retained_catalogs(self):
        for line in range(1, 9):
            self.project['passages'][0]['sourceLine'] = line
            self.search()
        self.project['passages'][0]['sourceLine'] = 1
        self.search()  # Touch oldest; the next insertion must evict line 2.
        self.project['passages'][0]['sourceLine'] = 9
        self.search()
        self.project['passages'][0]['sourceLine'] = 1
        self.search()
        self.assertEqual(self.child.call_count, 9)
        self.project['passages'][0]['sourceLine'] = 2
        self.search()
        self.assertEqual(self.child.call_count, 10)
        self.assertEqual(len(self.adapter.lexicon_catalog_cache), 8)
        del self.adapter.lexicon_catalog_cache
        size = len(json.dumps({'entries': self.rows}, ensure_ascii=False, separators=(',', ':')).encode())
        with patch('authoring_service.LEXICON_CATALOG_BYTES', size + 1):
            self.search(passageId='passage:a')
            self.search(passageId='passage:b')
            self.search(passageId='passage:a')
            self.assertEqual(len(self.adapter.lexicon_catalog_cache), 1)
        del self.adapter.lexicon_catalog_cache
        with patch('authoring_service.LEXICON_CATALOG_BYTES', size - 1):
            self.search()
            self.search()
            self.assertFalse(getattr(self.adapter, 'lexicon_catalog_cache', {}))

    def test_real_exact_content_and_head_guards_invalidate_a_warm_catalog(self):
        self.fresh_patch.stop()
        engine = self.parent / 'nhe-enga/pydicate'
        engine.mkdir(parents=True)
        (engine / 'fixture.py').write_text('# original\n')
        repos = [self.parent / name for name in ('oldtupicorpus', 'nhe-enga')]
        def git(repo, *args):
            subprocess.run(['git', '-C', str(repo), *args], check=True, capture_output=True)
        for repo in repos:
            git(repo, 'init', '--quiet')
            git(repo, 'add', '.')
            git(repo, '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid',
                'commit', '--quiet', '-m', 'fixture')
        self.adapter = ProjectAdapter()
        self.adapter.parent, self.adapter.project = self.parent, self.project
        def refresh_identity():
            current = self.adapter._engine_fingerprint(self.adapter._snapshots(metadata=False))
            self.project['engineFingerprint'] = self.params['engineFingerprint'] = current
        refresh_identity()
        self.search()
        source = self.historic / 'first.tu.py'
        previous_stat = source.stat()
        for change in ('same-size-content', 'head', 'untracked-source', 'engine-content'):
            with self.subTest(change=change):
                if change == 'same-size-content':
                    source.write_text(source.read_text().replace('amen', 'tupa'))
                    os.utime(source, ns=(previous_stat.st_atime_ns, previous_stat.st_mtime_ns))
                elif change == 'head':
                    git(repos[0], '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid',
                        'commit', '--allow-empty', '--quiet', '-m', 'new HEAD, same files')
                elif change == 'untracked-source':
                    (self.historic / 'new.py').write_text('# new trusted module\n')
                else:
                    (engine / 'fixture.py').write_text('# modified\n')
                count = self.child.call_count
                with self.assertRaises(AdapterError) as failure: self.search()
                self.assertEqual(failure.exception.code, 'STALE_ENGINE')
                self.assertEqual(self.child.call_count, count)
                refresh_identity()
                self.search()
                self.search(query='entry_119')
                self.assertEqual(self.child.call_count, count + 1)


class CatalogRuntimeTests(unittest.TestCase):
    def test_catalog_contains_every_isolated_surface_and_preserves_search_ranking(self):
        class Predicate:
            def __init__(self, surface): self.surface, self.calls = surface, 0
            def eval(self): self.calls += 1; return self.surface
        entries = [{'name': name, 'definition': meaning} for name, meaning in
                   [('a_meaning', 'pessoa aba'), ('b_prefix', ''), ('z_exact', '')]]
        namespace = {name: Predicate(surface) for name, surface in
                     [('a_meaning', 'other'), ('b_prefix', 'abacaxi'), ('z_exact', 'abá')]}
        with patch('authoring_runtime.lexical_entries', side_effect=lambda *args: json.loads(json.dumps(entries))):
            catalog = lexicon_result({'action': 'lexicon_catalog', 'query': 'ignored', 'limit': 1}, None, None, namespace)
            uncached = lexicon_result({'action': 'lexicon', 'query': 'aba', 'limit': 1}, None, None, namespace)
        from lexical_search import search_catalog
        self.assertEqual(len(catalog['entries']), 3)
        self.assertEqual(search_catalog(catalog['entries'], 'aba', 1), uncached)
        self.assertEqual(uncached['results'][0]['name'], 'z_exact')
        self.assertTrue(all(value.calls == 0 for value in namespace.values()))


if __name__ == '__main__':
    unittest.main()
