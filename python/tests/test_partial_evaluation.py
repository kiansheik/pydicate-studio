"""Partial authoring keeps working branches without approving an incomplete root."""
import ast
import os
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from adapter import AdapterError, ProjectAdapter
from authoring_runtime import configure, namespace_for, realize
from authoring_service import AuthoringService
from rendered_structures import build
from studio_authoring import contains_slots, expression_tree, source_entries


def nodes(root):
    yield root
    for child in root['children']:
        yield from nodes(child['node'])


class SlotSyntaxTests(unittest.TestCase):
    def test_holes_are_distinct_source_nodes_and_keep_exact_utf16_spans(self):
        raw = 'Noun("🦜") * __studio_slot_a10f'
        parsed = expression_tree(raw)
        self.assertTrue(parsed['capabilities']['edit'])
        hole = next(node for node in nodes(parsed['root']) if node['kind'] == 'hole')
        self.assertEqual(hole['label'], 'Conectar aqui')
        self.assertNotIn('lexicalReference', hole)
        self.assertEqual(raw.encode('utf-16-le')[hole['start'] * 2:hole['end'] * 2].decode('utf-16-le'), '__studio_slot_a10f')
        self.assertTrue(contains_slots(raw))
        self.assertFalse(contains_slots('Noun("__studio_slot_a10f")'))


REAL = Path(os.environ.get('PYDICATE_PROJECT_PARENT', str(Path(__file__).resolve().parents[3]))).expanduser().resolve()


@unittest.skipUnless((REAL / 'oldtupicorpus/historic/araujo_catecismo_1686.tu.py').exists(), 'selected corpus not installed')
class PartialEvaluationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.corpus = configure(REAL)
        cls.path = cls.corpus / 'historic/araujo_catecismo_1686.tu.py'
        cls.original = cls.path.read_bytes()
        cls.entries = source_entries(cls.path)
        cls.adapter = ProjectAdapter()
        cls.project = cls.adapter.open_project(str(REAL))
        cls.passage = cls.project['passages'][76]
        cls.params = {'passageId': cls.passage['id'], 'engineFingerprint': cls.project['engineFingerprint'], 'revisionId': 'partial-fixture'}

    @classmethod
    def tearDownClass(cls):
        assert cls.path.read_bytes() == cls.original

    def evaluate(self, raw):
        result = realize(raw, namespace_for(self.corpus, self.path, self.entries[76]['statementLine']))
        return result, {node['id']: node for node in nodes(result['tree'])}

    def test_missing_method_blocks_ancestors_but_preserves_both_branches(self):
        result, tree = self.evaluate('tym.ord() + (og * (emi * tym))')
        self.assertEqual(result['evaluationStatus'], 'partial')
        self.assertEqual(result['surface'], '')
        self.assertEqual(result['annotated'], '')
        self.assertEqual(result['morphemes'], [])
        self.assertNotIn('runtimeTree', result)
        self.assertNotIn('structureFingerprint', result)
        self.assertEqual(tree['root/left']['evaluation']['status'], 'error')
        self.assertEqual(tree['root/left']['operandTypes'], ['Verb'])
        self.assertEqual(tree['root']['evaluation']['status'], 'blocked')
        self.assertEqual(tree['root']['evaluation']['causes'], ['root/left'])
        self.assertEqual(tree['root/left/receiver']['evaluation']['surface'], 'tym')
        self.assertEqual(tree['root/right']['evaluation']['surface'], 'oemityma')
        self.assertEqual(tree['root/right/right']['evaluation']['surface'], 'temityma')

    def test_failed_outer_operation_retains_all_children_and_dispatch(self):
        result, tree = self.evaluate('(og * (emi * tym)) * 1')
        self.assertEqual(tree['root']['evaluation']['status'], 'error')
        self.assertEqual(tree['root']['operandTypes'], ['Deverbal', 'int'])
        self.assertIn('__mul__', tree['root']['dispatch'])
        self.assertEqual(tree['root/left']['evaluation']['surface'], 'oemityma')
        self.assertEqual(tree['root/right']['evaluation'], {'status': 'value', 'value': '1'})
        self.assertEqual(result['failures'][0]['stage'], 'operation')

    def test_missing_lexical_name_is_a_reference_failure_and_collects_the_right_sibling(self):
        result, tree = self.evaluate('unknown_word + (emi * tym)')
        self.assertEqual(tree['root/right']['evaluation']['surface'], 'temityma')
        self.assertEqual(result['failures'][0]['nodeId'], 'root/left')
        self.assertEqual(result['failures'][0]['stage'], 'reference')
        self.assertIn('unknown_word', result['failures'][0]['message'])

    def test_missing_slot_and_all_ancestors_share_the_same_direct_cause(self):
        result, tree = self.evaluate('(tym * __studio_slot_a1) + (og * (emi * tym))')
        hole_id = 'root/left/right'
        self.assertEqual(tree[hole_id]['kind'], 'hole')
        self.assertEqual(tree[hole_id]['evaluation']['status'], 'missing')
        for identifier in ('root/left', 'root'):
            self.assertEqual(tree[identifier]['evaluation']['causes'], [hole_id])
        self.assertEqual(tree['root/right']['evaluation']['surface'], 'oemityma')
        self.assertEqual(result['evaluationStatus'], 'partial')

    def test_isolated_eval_failure_can_recover_in_its_parent_even_when_other_branch_is_missing(self):
        raw = '(îe * mombeu).var(1).base_nominal() + unknown_word'
        result, tree = self.evaluate(raw)
        self.assertEqual(tree['root/left']['evaluation'], {'status': 'ok', 'surface': "îemombe'u"})
        self.assertEqual(tree['root/left/receiver']['evaluation']['status'], 'error')
        self.assertEqual(tree['root']['evaluation']['causes'], ['root/right'])
        evaluation_failure = next(failure for failure in result['failures'] if failure['stage'] == 'evaluation')
        self.assertTrue(evaluation_failure['engineFrames'])
        self.assertTrue(any('/nhe-enga/' in frame['file'] for frame in evaluation_failure['engineFrames']))
        complete, complete_tree = self.evaluate('(îe * mombeu).var(1).base_nominal()')
        self.assertEqual(complete['evaluationStatus'], 'complete')
        self.assertEqual(complete['surface'], "îemombe'u")
        self.assertEqual(complete_tree['root/receiver']['evaluation']['status'], 'unavailable')

    def test_root_eval_failure_has_real_engine_frames_and_never_erases_successful_leaf_results(self):
        result, tree = self.evaluate('(îe * mombeu) + tym')
        self.assertEqual(tree['root']['evaluation']['status'], 'error')
        self.assertEqual(tree['root/right']['evaluation']['surface'], 'tym')
        self.assertIn('Predicate.__add__', tree['root']['dispatch'])
        root_failure = next(failure for failure in result['failures'] if failure['nodeId'] == 'root')
        self.assertEqual(root_failure['stage'], 'evaluation')
        self.assertGreater(len(root_failure['engineFrames']), 0)
        self.assertLessEqual(len(root_failure['engineFrames']), 6)

    def test_empty_success_is_distinct_from_partial_missing_root(self):
        class EmptyPredicate:
            category = 'noun'
            def copy(self): return EmptyPredicate()
            def eval(self, annotated=False): return ''
        complete = realize('empty', {'empty': EmptyPredicate()})
        tree = {node['id']: node for node in nodes(complete['tree'])}
        self.assertEqual(complete['evaluationStatus'], 'complete')
        self.assertEqual(complete['surface'], '')
        self.assertEqual(tree['root']['evaluation'], {'status': 'ok', 'surface': ''})
        partial, tree = self.evaluate('__studio_slot_a1')
        self.assertEqual(partial['evaluationStatus'], 'partial')
        self.assertEqual(tree['root']['evaluation']['status'], 'missing')

    def test_service_preserves_revision_and_partial_context_only_for_investigation(self):
        params = {**self.params, 'raw': 'tym.ord() + ypy'}
        result = self.adapter.invoke('evaluate_expression', params)
        self.assertEqual(result['revisionId'], params['revisionId'])
        self.assertEqual(result['engineFingerprint'], self.project['engineFingerprint'])
        context = self.adapter.invoke('assistant_context', {**params, 'action': 'investigate'})
        self.assertEqual(context['evaluation']['evaluationStatus'], 'partial')
        self.assertEqual(context['evaluation']['expression'], params['raw'])
        with self.assertRaises(AdapterError) as failure:
            self.adapter.invoke('assistant_context', {**params, 'action': 'translate'})
        self.assertEqual(failure.exception.code, 'INCOMPLETE_EVALUATION')
        other = self.adapter.invoke('assistant_context', {**params, 'action': 'explain'})
        self.assertIsNone(other['evaluation'])
        self.assertTrue(other['diagnostics'])

    def test_slots_cannot_enter_either_source_preview_but_ordinary_unknown_names_remain_reviewable(self):
        for method in ('source_preview', 'source_new_preview'):
            with self.subTest(method=method):
                with self.assertRaises(AdapterError) as error:
                    self.adapter.invoke(method, {**self.params, 'raw': 'tym * __studio_slot_a1'})
                self.assertEqual(error.exception.code, 'UNRESOLVED_SLOTS')
        preview = self.adapter.invoke('source_preview', {**self.params, 'raw': 'unknown_ordinary_word'})
        self.assertIn('unknown_ordinary_word', preview['diff'])
        preview = self.adapter.invoke('source_preview', {**self.params, 'raw': 'Noun("__studio_slot_a1")'})
        self.assertIn('__studio_slot_a1', preview['diff'])

    def test_reference_approval_cannot_accept_empty_surface_of_partial_root(self):
        with patch.object(AuthoringService, 'evaluate_expression', return_value={'evaluationStatus': 'partial', 'surface': ''}):
            with self.assertRaises(AdapterError) as failure:
                self.adapter.invoke('reference_approve', {**self.params, 'sourceFingerprint': self.passage['sourceFingerprint'], 'reviewedSurface': ''})
            self.assertEqual(failure.exception.code, 'INCOMPLETE_EVALUATION')

    def test_detached_fragment_provenance_survives_indexing(self):
        result = build({'includeSources': False, 'drafts': [{'passageId': self.passage['id'], 'sourceId': self.passage['sourceId'], 'line': self.passage['sourceLine'], 'ordinal': 77, 'fragmentId': 'fragment:abc', 'raw': 'tym.ord() + (emi * tym)'}]}, self.corpus)
        found = next(row for row in result['entries'] if row['surface'] == 'temityma')
        self.assertEqual(found['source']['fragmentId'], 'fragment:abc')
        self.assertIn('Peça solta', found['source']['label'])


if __name__ == '__main__':
    unittest.main()
