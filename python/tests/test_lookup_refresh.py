"""Read refresh rebuilds current lookup data without authorizing stale writes."""
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from adapter import AdapterError, ProjectAdapter
from authoring_service import AuthoringService


REAL = Path(os.environ.get('PYDICATE_PROJECT_PARENT', str(Path(__file__).resolve().parents[3]))).expanduser().resolve()
SOURCE = 'araujo_catecismo_1686'


@unittest.skipUnless((REAL / 'oldtupicorpus/historic' / f'{SOURCE}.tu.py').exists(), 'selected corpus not installed')
class LookupRefreshTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix='studio-lookup-refresh-')
        cls.parent = Path(cls.temp.name)
        cls.corpus = cls.parent / 'oldtupicorpus'
        cls.corpus.mkdir()
        for directory in ('historic', 'authoring', 'ground_truth'):
            shutil.copytree(REAL / 'oldtupicorpus' / directory, cls.corpus / directory,
                            ignore=shutil.ignore_patterns('__pycache__'))
        (cls.parent / 'nhe-enga').symlink_to(REAL / 'nhe-enga', target_is_directory=True)
        cls.source = cls.corpus / 'historic' / f'{SOURCE}.tu.py'
        cls.original = cls.source.read_bytes()
        subprocess.run(['git', 'init', '--quiet', str(cls.corpus)], check=True)
        subprocess.run(['git', '-C', str(cls.corpus), 'add', '.'], check=True)
        subprocess.run(['git', '-C', str(cls.corpus), '-c', 'user.name=Studio Test',
                        '-c', 'user.email=test@example.invalid', 'commit', '--quiet',
                        '-m', 'disposable fixture'], check=True)

    @classmethod
    def tearDownClass(cls):
        # Only the disposable source was changed; the actual corpus is untouched.
        assert (REAL / 'oldtupicorpus/historic' / f'{SOURCE}.tu.py').read_bytes() == cls.original
        cls.temp.cleanup()

    def setUp(self):
        self.write_source('antigo')
        self.adapter = ProjectAdapter(self.parent / ('state-' + self.id().rsplit('.', 1)[-1]))
        self.project = self.adapter.open_project(str(self.parent))
        passage = next(p for p in self.project['passages'] if p['sourceId'] == SOURCE)
        self.params = {'projectId': self.project['id'], 'passageId': passage['id'],
                       'sourceId': SOURCE, 'engineFingerprint': self.project['engineFingerprint']}

    def write_source(self, meaning):
        self.source.write_text(
            'from historic.lexicon import *\n'
            f'fresh_probe = Noun("studio-{meaning}", definition="sentido {meaning}")\n'
            'l = [fresh_probe, amen]\n'
            f'{SOURCE} = l\n', encoding='utf-8')

    def assert_code(self, code, method, params):
        with self.assertRaises(AdapterError) as failure:
            self.adapter.invoke(method, params)
        self.assertEqual(failure.exception.code, code)

    def test_refresh_rebuilds_changed_declaration_and_rejects_previous_selection(self):
        first = self.adapter.invoke('structure_search', {**self.params, 'query': 'fresh_probe'})
        previous = next(row for row in first['results'] if row.get('name') == 'fresh_probe')
        preview = self.adapter.invoke('source_preview', {**self.params, 'raw': 'amen'})
        self.write_source('novo')
        after_change = self.source.read_bytes()
        with patch.object(AuthoringService, 'child', side_effect=AssertionError('stale reads must not evaluate')):
            for method, extra in [('structure_search', {'query': 'fresh_probe'}),
                                  ('dictionary_lookup', {'query': 'pysyrõ'}),
                                  ('predicate_catalog', {}), ('lexicon_search', {'query': 'fresh_probe'}),
                                  ('structure_resolve', {'candidateId': previous['id'], 'indexFingerprint': first['indexFingerprint']})]:
                with self.subTest(method=method):
                    self.assert_code('STALE_ENGINE', method, {**self.params, **extra})
        self.project = self.adapter.refresh_project()
        current = {**self.params, 'engineFingerprint': self.project['engineFingerprint']}
        self.assertNotEqual(current['engineFingerprint'], self.params['engineFingerprint'])
        self.assert_code('STALE_ENGINE', 'structure_search', {**self.params, 'query': 'fresh_probe'})
        found = self.adapter.invoke('structure_search', {**current, 'query': 'fresh_probe'})
        candidate = next(row for row in found['results'] if row.get('name') == 'fresh_probe')
        self.assertNotEqual(found['indexFingerprint'], first['indexFingerprint'])
        self.assertNotEqual(candidate['surface'], previous['surface'])
        self.assertIn('novo', candidate['surface'])
        self.assert_code('STALE_STRUCTURE_INDEX', 'structure_resolve', {
            **current, 'candidateId': previous['id'], 'indexFingerprint': first['indexFingerprint']})
        resolved = self.adapter.invoke('structure_resolve', {
            **current, 'candidateId': candidate['id'], 'indexFingerprint': found['indexFingerprint']})
        self.assertEqual(resolved['surface'], candidate['surface'])
        self.assert_code('STALE_SOURCE', 'source_apply', preview)
        self.assertEqual(self.source.read_bytes(), after_change)

    def test_read_retry_uses_fresh_context_without_changing_dictionary_sense_or_source(self):
        before = self.adapter.invoke('dictionary_lookup', {**self.params, 'query': 'pysyrõ'})
        entry = before['results'][0]
        selected = {**self.params, 'entryIndex': entry['entryIndex'], 'datasetFingerprint': entry['datasetFingerprint']}
        self.write_source('novo')
        changed = self.source.read_bytes()
        self.assert_code('STALE_ENGINE', 'dictionary_predicate', selected)
        fresh = self.adapter.refresh_project()
        current = {**self.params, 'engineFingerprint': fresh['engineFingerprint']}
        after = self.adapter.invoke('dictionary_lookup', {**current, 'query': 'pysyrõ'})
        self.assertEqual(after['results'], before['results'])
        self.assertEqual(after['engineFingerprint'], fresh['engineFingerprint'])
        self.assert_code('STALE_ENGINE', 'dictionary_predicate', selected)
        created = self.adapter.invoke('dictionary_predicate', {**selected, **current})
        self.assertEqual(created['status'], 'ready')
        self.assertEqual(created['entry']['definition'], entry['definition'])
        self.assertEqual(created['engineFingerprint'], fresh['engineFingerprint'])
        self.assertEqual(self.source.read_bytes(), changed)

    def test_refresh_does_not_silently_select_another_project_or_deleted_passage(self):
        self.write_source('novo')
        fresh = self.adapter.refresh_project()
        current = {**self.params, 'engineFingerprint': fresh['engineFingerprint']}
        self.assert_code('STALE_PROJECT', 'structure_search', {**current, 'projectId': 'other-project', 'query': 'fresh_probe'})
        self.assert_code('PASSAGE_NOT_FOUND', 'structure_search', {**current, 'passageId': 'deleted-passage', 'query': 'fresh_probe'})
        self.assert_code('PASSAGE_NOT_FOUND', 'dictionary_lookup', {**current, 'passageId': 'deleted-passage', 'query': 'tym'})


if __name__ == '__main__':
    unittest.main()
