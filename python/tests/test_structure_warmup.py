"""Cold index construction must not occupy the JSON-lines worker."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from copy import deepcopy
from threading import Event
from types import SimpleNamespace
from unittest import TestCase
from unittest.mock import patch
import tempfile
from authoring_service import AuthoringService


class WarmupTests(TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.project = {'id': 'test', 'engineFingerprint': 'engine', 'passages': [
            {'id': 'passage:a', 'sourceId': 'source', 'ordinal': 1, 'sourceExpression': 'original', 'sourceLine': 1}]}
        self.adapter = SimpleNamespace(project=self.project, state_dir=Path(self.temp.name))
        self.params = {'drafts': [{'passageId': 'passage:a', 'raw': 'changed', 'sourceId': 'source'}]}
        self.fresh = patch.object(AuthoringService, 'fresh', return_value='engine')
        self.fresh.start()
        self.addCleanup(self.fresh.stop)

    def test_nonblocking_coalescing_and_persisted_drafts_after_base_warmup(self):
        entered, release = Event(), Event()
        calls = []
        def build(service, payload, timeout=45):
            calls.append(payload)
            entered.set()
            if not release.wait(5): raise AssertionError('test did not release build')
            return {'entries': [], 'diagnostics': ['draft'] if payload.get('drafts') else []}
        with patch.object(AuthoringService, 'child', build):
            service = AuthoringService(self.adapter)
            self.assertEqual(service.structure_prepare(self.params), {'preparing': True})
            self.assertTrue(entered.wait(2))
            for _ in range(5): self.assertEqual(service.structure_prepare(self.params), {'preparing': True})
            # Foreground reads can still run while the builder is held.
            self.assertEqual(service.structure_search({**self.params, 'passageId': 'passage:a', 'query': 'x', 'background': True})['preparing'], True)
            thread = self.adapter.structure_warmup.thread
            release.set()
            thread.join(5)
            self.assertFalse(thread.is_alive())
            self.assertEqual(service.structure_prepare(self.params), {'preparing': False})
            self.assertEqual(len(calls), 2)
        reopened = SimpleNamespace(project=deepcopy(self.project), state_dir=Path(self.temp.name))
        with patch.object(AuthoringService, 'child', side_effect=AssertionError('durable cache must avoid evaluation')):
            service = AuthoringService(reopened)
            service.structure_index({})  # startup base preparation must preserve the draft cache
            self.assertEqual(service.structure_index(self.params)['diagnostics'], ['draft'])
        # A different draft must not reuse the previous overlay.
        with patch.object(AuthoringService, 'child', return_value={'entries': [], 'diagnostics': ['new']}) as build:
            changed = {'drafts': [{**self.params['drafts'][0], 'raw': 'new'}]}
            self.assertEqual(service.structure_index(changed)['diagnostics'], ['new'])
            self.assertEqual(build.call_count, 1)

    def test_corrupt_overlay_and_changed_engine_rebuild(self):
        service = AuthoringService(self.adapter)
        with patch.object(AuthoringService, 'child', return_value={'entries': [], 'diagnostics': []}) as build:
            service.structure_index(self.params)
            (Path(self.temp.name) / 'structure-index/test.drafts.json').write_text('[null]')
            self.adapter.structure_cache = None
            service.structure_index(self.params)
            self.assertEqual(build.call_count, 3)  # base reused; overlay rebuilt
            self.adapter.project['engineFingerprint'] = 'changed'
            with patch.object(AuthoringService, 'fresh', return_value='changed'):
                service.structure_index(self.params)
            self.assertEqual(build.call_count, 5)

    def test_speculative_preparation_does_not_turn_source_changes_into_editor_refreshes(self):
        from adapter import AdapterError
        service = AuthoringService(self.adapter)
        with patch.object(AuthoringService, 'fresh', side_effect=AdapterError('changed', 'STALE_ENGINE')):
            self.assertEqual(service.structure_prepare({}), {'preparing': True})
            with self.assertRaises(AdapterError): service.structure_index({})
