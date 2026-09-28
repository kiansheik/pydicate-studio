"""One fresh approval process retains complete-output and atomic-write guards."""
import copy
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import types
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from adapter import AdapterError, ProjectAdapter
from authoring_runtime import approve_authoritatively
from authoring_service import AuthoringService


class Predicate:
    category = 'noun'
    definition = 'fixture'

    def __init__(self, surface='reviewed'):
        self.verbete = surface

    def copy(self):
        return copy.deepcopy(self)

    def eval(self, annotated=False):
        return self.verbete


class ApprovalTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='studio-approval-')
        self.addCleanup(self.temporary.cleanup)
        self.corpus = Path(self.temporary.name) / 'oldtupicorpus'
        self.source = self.corpus / 'historic/fixture.tu.py'
        self.source.parent.mkdir(parents=True)
        self.source.write_text('l = [entry]\nfixture = l\n')
        self.records = self.corpus / 'ground_truth/records/historic/fixture.jsonl'
        self.state = Path(self.temporary.name) / 'state'
        self.namespace = {'entry': Predicate()}
        self.payload = {'sourceId': 'fixture', 'ordinal': 1,
                        'passageId': 'passage:fixture', 'reviewedSurface': 'reviewed',
                        'engineFingerprint': 'engine:reviewed', 'stateDir': str(self.state)}
        self.bind_source()
        records = types.ModuleType('authoring.records')
        records.normalize_surface = lambda value: value.strip().removesuffix('.')
        for context in (
            patch.dict(sys.modules, {'authoring.records': records}),
            patch('authoring_runtime.namespace_for', side_effect=lambda *_: self.namespace),
            patch('studio_authoring.authoritative_metadata', return_value={}),
            patch.object(ProjectAdapter, '_snapshots', return_value=[]),
            patch.object(ProjectAdapter, '_engine_fingerprint', return_value='engine:reviewed'),
        ):
            context.start()
            self.addCleanup(context.stop)

    def bind_source(self):
        self.payload['sourceFileFingerprint'] = 'sha256:' + hashlib.sha256(self.source.read_bytes()).hexdigest()

    def approve(self):
        return approve_authoritatively(self.payload, self.corpus)

    def assert_unwritten(self):
        self.assertFalse(self.records.exists())
        self.assertFalse((self.state / 'recovery').exists())

    def test_approval_preserves_source_and_writes_one_recovery_journal(self):
        before = self.source.read_bytes()
        result = self.approve()
        self.assertEqual(result['committed_surface'], 'reviewed')
        self.assertEqual(self.source.read_bytes(), before)
        self.assertEqual(json.loads(self.records.read_text())['status'], 'approved')
        self.assertEqual(len(list((self.state / 'recovery').glob('*.json'))), 1)

    def test_requires_exact_reviewed_surface_before_normalization(self):
        for surface in (None, 1, 'reviewed.', ' reviewed ', 'different'):
            with self.subTest(surface=surface):
                self.payload['reviewedSurface'] = surface
                with self.assertRaises(AdapterError) as failure:
                    self.approve()
                self.assertEqual(failure.exception.code, 'REVIEW_REQUIRED')
                self.assert_unwritten()

    def test_complete_empty_surface_is_approvable(self):
        self.namespace['entry'] = Predicate('')
        self.payload['reviewedSurface'] = ''
        self.assertEqual(self.approve()['committed_surface'], '')

    def test_partial_output_unknown_names_and_non_predicates_cannot_be_approved(self):
        for raw in ('entry + 1', '__studio_slot_a1', 'unknown_name', '1'):
            with self.subTest(raw=raw):
                self.source.write_text(f'l = [{raw}]\nfixture = l\n')
                self.bind_source()
                self.payload['reviewedSurface'] = ''
                with self.assertRaises(AdapterError) as failure:
                    self.approve()
                self.assertEqual(failure.exception.code, 'INCOMPLETE_EVALUATION')
                self.assert_unwritten()

    def test_annotation_failure_is_still_incomplete_even_with_matching_plain_surface(self):
        class MissingAnnotation(Predicate):
            def eval(self, annotated=False):
                if annotated:
                    raise ValueError('annotation unavailable')
                return super().eval()
        self.namespace['entry'] = MissingAnnotation()
        with self.assertRaises(AdapterError) as failure:
            self.approve()
        self.assertEqual(failure.exception.code, 'INCOMPLETE_EVALUATION')
        self.assert_unwritten()

    def test_canonical_interpretation_must_match_even_when_ui_copy_matches(self):
        class DifferentCopy(Predicate):
            def copy(self):
                return Predicate('reviewed')
        self.namespace['entry'] = DifferentCopy('canonical differs')
        with self.assertRaisesRegex(ValueError, 'superfície mudou'):
            self.approve()
        self.assert_unwritten()

    def test_unsupported_syntax_cannot_be_approved(self):
        self.source.write_text('l = [lambda: entry]\nfixture = l\n')
        self.bind_source()
        with self.assertRaisesRegex(ValueError, 'inválida'):
            self.approve()
        self.assert_unwritten()

    def test_engine_changed_during_evaluation_rejects_before_journal(self):
        with patch.object(ProjectAdapter, '_engine_fingerprint', return_value='engine:changed'):
            with self.assertRaises(AdapterError) as failure:
                self.approve()
        self.assertEqual(failure.exception.code, 'STALE_ENGINE')
        self.assert_unwritten()

    def test_source_changed_before_or_during_evaluation_is_not_written(self):
        self.source.write_text(self.source.read_text() + '# changed\n')
        with self.assertRaisesRegex(ValueError, 'fonte mudou'):
            self.approve()
        self.assert_unwritten()
        self.bind_source()
        original = self.source.read_bytes()

        class ExternalEdit(Predicate):
            def eval(inner, annotated=False):
                self.source.write_bytes(original + b'# simultaneous edit\n')
                return super().eval(annotated)

        self.namespace['entry'] = ExternalEdit()
        with self.assertRaisesRegex(ValueError, 'mudou externamente'):
            self.approve()
        self.assert_unwritten()

    def test_existing_reference_identity_and_human_target_are_preserved(self):
        self.records.parent.mkdir(parents=True)
        base = {'source': 'fixture', 'ordinal': 1, 'surface': 'reviewed'}
        for extra in ({'studio_passage_id': 'other'}, {'normalized_target': 'human target'}):
            with self.subTest(extra=extra):
                before = json.dumps({**base, **extra}) + '\n'
                self.records.write_text(before)
                with self.assertRaises(ValueError):
                    self.approve()
                self.assertEqual(self.records.read_text(), before)
                self.assertFalse((self.state / 'recovery').exists())

    def test_service_uses_one_fresh_child_and_retains_stale_source_guard(self):
        passage = {'id': self.payload['passageId'], 'sourceId': 'fixture', 'ordinal': 1,
                   'sourceExpression': 'entry', 'sourceFingerprint': 'source:reviewed',
                   'sourceFileFingerprint': self.payload['sourceFileFingerprint']}
        adapter = ProjectAdapter(self.state)
        adapter.parent = self.corpus.parent
        adapter.project = {'engineFingerprint': 'engine:reviewed', 'passages': [passage]}
        service = AuthoringService(adapter)
        params = {'passageId': passage['id'], 'sourceFingerprint': 'source:reviewed',
                  'engineFingerprint': 'engine:reviewed', 'reviewedSurface': 'reviewed'}
        with patch.object(service, 'child', side_effect=lambda payload, **_: approve_authoritatively(payload, self.corpus)) as child, \
                patch.object(adapter, 'refresh_project', return_value=adapter.project):
            service.reference_approve(params)
            self.assertEqual(child.call_count, 1)
            self.assertEqual(child.call_args.args[0]['action'], 'approve')
            with self.assertRaises(AdapterError) as failure:
                service.reference_approve({**params, 'sourceFingerprint': 'old'})
            self.assertEqual(failure.exception.code, 'STALE_SOURCE')
            self.assertEqual(child.call_count, 1)


if __name__ == '__main__':
    unittest.main()
