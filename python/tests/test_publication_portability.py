"""Portable reviewed writes and real isolated regression workers, no project clones."""
import json
import os
from pathlib import Path
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from adapter import AdapterError
from authoring_service import AuthoringService
from publication_regression import check_publication
from reviewed_files import _sync_parent, apply_reviewed_files


def fail(message, code):
    raise AdapterError(message, code)


class PortableReviewedFilesTests(unittest.TestCase):
    def test_windows_fallback_saves_existing_and_new_files_with_durable_journal(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = root / 'fonte.py'
            source.write_bytes(b'original')
            source.chmod(0o640)
            new = root / 'reference.json'
            journal = root / 'recovery' / 'review.json'
            members = [
                {'path': source, 'before': b'original', 'after': 'îeupiragûera'.encode()},
                {'path': new, 'before': b'', 'beforeExists': False, 'after': b'new'},
            ]
            with patch('reviewed_files.os.fchmod', None, create=True), \
                    patch('reviewed_files.sys.platform', 'win32'), \
                    patch('reviewed_files.os.chmod', wraps=os.chmod) as chmod, \
                    patch('reviewed_files.os.fsync', wraps=os.fsync) as fsync:
                apply_reviewed_files(members, journal, {'version': 2}, fail)
            self.assertEqual(source.read_bytes(), 'îeupiragûera'.encode())
            self.assertEqual(new.read_bytes(), b'new')
            self.assertEqual(json.loads(journal.read_text()), {'version': 2})
            self.assertEqual(fsync.call_count, 5)  # journal plus both staged pairs
            self.assertEqual(chmod.call_count, 4)
            self.assertTrue(all('.studio-' in str(call.args[0]) for call in chmod.call_args_list))
            if os.name != 'nt':
                self.assertEqual(source.stat().st_mode & 0o777, 0o640)
                self.assertEqual(new.stat().st_mode & 0o777, 0o600)
            self.assertFalse(list(root.glob('.*.studio-*')))

    def test_windows_fallback_rolls_back_when_later_replacement_fails(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            existing = root / 'source.py'
            existing.write_bytes(b'original')
            new = root / 'new.json'
            members = [
                {'path': new, 'before': b'', 'beforeExists': False, 'after': b'new'},
                {'path': existing, 'before': b'original', 'after': b'changed'},
            ]
            replace = os.replace

            def interrupted(source, target):
                if Path(target) == existing:
                    raise OSError('simulated interruption')
                return replace(source, target)

            with patch('reviewed_files.os.fchmod', None, create=True), \
                    patch('reviewed_files.sys.platform', 'win32'), \
                    patch('reviewed_files.os.replace', side_effect=interrupted), \
                    self.assertRaisesRegex(OSError, 'simulated interruption'):
                apply_reviewed_files(members, root / 'recovery' / 'review.json', {}, fail)
            self.assertFalse(new.exists())
            self.assertEqual(existing.read_bytes(), b'original')
            self.assertTrue((root / 'recovery' / 'review.json').is_file())
            self.assertFalse(list(root.glob('.*.studio-*')))

    def test_stale_source_is_rejected_before_staging_or_journal(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = root / 'source.py'
            source.write_bytes(b'external change')
            journal = root / 'recovery' / 'review.json'
            with patch('reviewed_files.os.fchmod', None, create=True), \
                    self.assertRaises(AdapterError) as caught:
                apply_reviewed_files([
                    {'path': source, 'before': b'reviewed', 'after': b'replacement'}
                ], journal, {}, fail)
            self.assertEqual(caught.exception.code, 'STALE_SOURCE')
            self.assertEqual(source.read_bytes(), b'external change')
            self.assertFalse(journal.exists())

    def test_windows_parent_flush_does_not_open_a_directory(self):
        with patch('reviewed_files.sys.platform', 'win32'), \
                patch('reviewed_files.os.open', side_effect=AssertionError('directory opened')):
            _sync_parent(Path('source.py'))


class PortablePublicationReviewTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.parent = Path(self.temporary.name)
        self.corpus = self.parent / 'oldtupicorpus'
        for name in ('historic', 'authoring', 'ground_truth'):
            (self.corpus / name).mkdir(parents=True)
        self.source = self.corpus / 'historic' / 'sample.tu.py'
        self.source.write_text('l = [word]\n', encoding='utf-8')
        (self.corpus / 'historic' / '__init__.py').write_text('', encoding='utf-8')
        (self.corpus / 'historic' / 'lexicon.tu.py').write_text('', encoding='utf-8')
        (self.corpus / 'historic' / 'lexicon.py').write_text(
            'from fixture_engine import word, other\n'
            'def load_lexicon():\n'
            '    return {"word": word, "other": other}\n', encoding='utf-8')
        (self.corpus / 'authoring' / 'source_annotations.py').write_text(
            'def source_entries(path, source_name=None): return []\n'
            'def annotations_by_source_line(path, entries): return {}\n'
            'def waterfall_locator_annotations(entries, annotations): return {}\n', encoding='utf-8')
        engine = self.parent / 'nhe-enga' / 'pydicate'
        engine.mkdir(parents=True)
        (engine / 'fixture_engine.py').write_text(
            'class Value:\n'
            '    def __init__(self, surface): self.surface = surface\n'
            '    def eval(self, annotated=False):\n'
            '        return self.surface + ("[ROOT]" if annotated else "")\n'
            'word = Value("abá")\n'
            'other = Value("îeupiragûera")\n', encoding='utf-8')
        self.originals = {path: path.read_bytes() for path in self.parent.rglob('*') if path.is_file()}
        self.service = AuthoringService(SimpleNamespace(parent=self.parent, project={'id': 'fixture'}))

    def tearDown(self):
        self.assertEqual(
            {path: path.read_bytes() for path in self.parent.rglob('*') if path.is_file()},
            self.originals,
        )

    def test_real_worker_uses_selected_engine_without_any_directory_symlink(self):
        calls = []
        child = self.service.child

        def inspect(payload, timeout):
            result = child(payload, timeout)
            calls.append((payload, result))
            if 'enginePath' in payload:
                staged = Path(payload['parent'])
                self.assertFalse((staged / 'nhe-enga').exists())
                self.assertEqual(payload['enginePath'], str(self.parent / 'nhe-enga'))
                self.assertEqual((staged / 'oldtupicorpus' / 'historic' / 'sample.tu.py').read_bytes(), b'l = [other]\n')
            return result

        with patch.object(Path, 'symlink_to', side_effect=OSError('Windows requires privilege')), \
                patch.object(self.service, 'child', side_effect=inspect):
            result = check_publication(self.service, [
                {'path': self.source, 'before': self.source.read_bytes(), 'after': b'l = [other]\n'}
            ])
        self.assertTrue(result['ok'])
        self.assertEqual(result['checked'], 1)
        self.assertEqual(result['changed'], 1)
        self.assertEqual(result['baselineIssues'], 0)
        self.assertEqual(calls[0][1]['sample']['rows'][0]['surface'], 'abá')
        self.assertEqual(calls[1][1]['sample']['rows'][0]['surface'], 'îeupiragûera')
        self.assertFalse(Path(calls[1][0]['parent']).exists())

    def test_real_worker_still_blocks_failed_candidate_without_writing_sources(self):
        with patch.object(Path, 'symlink_to', side_effect=OSError('Windows requires privilege')), \
                self.assertRaises(AdapterError) as caught:
            check_publication(self.service, [
                {'path': self.source, 'before': self.source.read_bytes(), 'after': b'l = [missing_name]\n'}
            ])
        self.assertEqual(caught.exception.code, 'REGRESSION_FAILED')

    def test_review_preserves_resolved_corpus_path_guard(self):
        with self.assertRaises(ValueError):
            check_publication(self.service, [
                {'path': self.parent / 'nhe-enga' / 'pydicate' / 'fixture_engine.py',
                 'before': b'', 'after': b'never written'}
            ])
