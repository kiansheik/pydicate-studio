"""Migration accepts an existing research export without launching Chromium."""
import json
import pathlib
import sys
import tempfile
import unittest
from unittest.mock import patch
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from desktop_sync import prepare_local_bundle, validate_browser_export

class LegacyBrowserExportTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(); self.addCleanup(temporary.cleanup)
        self.root = pathlib.Path(temporary.name)
        self.file = self.root / 'export.json'

    def export(self, entries):
        self.file.write_text(json.dumps({'format': 'pydicate-browser-storage', 'version': 1,
            'origins': [{'origin': 'studio://app', 'entries': entries}]}))
        return self.file

    def test_existing_research_export_retains_exact_bytes(self):
        self.export({'studio-theme': 'dark', 'pydicate-studio:drafts:v1:project': '{"raw":"abá"}'})
        before = self.file.read_bytes()
        self.assertEqual(validate_browser_export(self.file), self.file)
        self.assertEqual(self.file.read_bytes(), before)

    def test_credential_or_nonstring_values_are_rejected(self):
        for entries in ({'access_token': 'private'}, {'studio-theme': {'token': 'private'}}):
            with self.subTest(entries=entries):
                with self.assertRaisesRegex(ValueError, 'non-allowlisted'):
                    validate_browser_export(self.export(entries))

    def test_raw_chromium_profile_requires_export_before_snapshot(self):
        state = self.root / 'profile'; state.mkdir(); (state / 'Local Storage').mkdir()
        (state / 'session.json').write_text(json.dumps({'parentPath': str(self.root)}))
        with patch.dict('os.environ', {'LOCAL_STUDIO_STATE': str(state), 'LOCAL_BROWSER_STORAGE': ''}), \
                patch('desktop_sync.create_bundle') as bundle:
            with self.assertRaisesRegex(ValueError, 'LOCAL_BROWSER_STORAGE'):
                prepare_local_bundle(self.root / 'archive.tar')
        bundle.assert_not_called()
        self.assertFalse((self.root / 'archive.tar').exists())

if __name__ == '__main__': unittest.main()
