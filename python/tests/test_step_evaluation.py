"""Intermediate eval evidence is isolated from normal Pydicate realization."""
import copy
import json
import os
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from authoring_runtime import configure, interpret, namespace_for, realize, shape
from studio_authoring import parse_ast, source_entries


def nodes(root):
    yield root
    for child in root['children']:
        yield from nodes(child['node'])


class Predicate:
    """Deliberately shallow engine copies and mutating operations/evaluation."""
    category = 'noun'

    def __init__(self, text, fails=False, empty=False):
        self.verbete = text
        self.arguments = []
        self.cache = {'eval_calls': 0}
        self.fails = fails
        self.empty = empty

    def copy(self):
        return copy.copy(self)

    def __deepcopy__(self, memo):
        result = self.copy()
        memo[id(self)] = result
        return result

    def __mul__(self, other):
        self.verbete += '-consumed'
        result = Predicate(self.verbete + ' ' + other.verbete)
        result.arguments = [self, other]
        return result

    def eval(self, annotated=False):
        if self.fails:
            raise ValueError('This step needs a parent')
        self.cache['eval_calls'] += 1
        if self.empty: return ''
        return self.verbete + ':' + str(self.cache['eval_calls']) + ('[ROOT]' if annotated else '')


class SlotsState:
    __slots__ = ('mutable', '__dict__')


def helper(base, count, enabled, missing, text, callback):
    return base


helper.__module__ = 'historic.preview_fixture'


class IsolatedEvaluationTests(unittest.TestCase):
    def test_previews_capture_before_parent_mutation_and_cannot_mutate_shared_engine_caches(self):
        namespace = {'left': Predicate('left'), 'right': Predicate('right')}
        result = realize('left * right', namespace)
        by_id = {node['id']: node for node in nodes(result['tree'])}
        self.assertEqual(result['surface'], 'left-consumed right:1')
        self.assertEqual(result['annotated'], 'left-consumed right:2[ROOT]')
        self.assertEqual(by_id['root']['evaluation'], {'status': 'ok', 'surface': result['surface']})
        self.assertEqual(by_id['root/left']['evaluation'], {'status': 'ok', 'surface': 'left:1'})
        self.assertEqual(by_id['root/right']['evaluation'], {'status': 'ok', 'surface': 'right:1'})
        self.assertEqual(namespace['left'].cache['eval_calls'], 0)
        self.assertEqual(namespace['right'].cache['eval_calls'], 0)
        self.assertEqual(namespace['left'].verbete, 'left')
        self.assertEqual(result['structure']['cache'], {'eval_calls': 0})

    def test_failed_or_uncopyable_child_preview_does_not_invalidate_parent(self):
        for failure in ('eval', 'copy'):
            left = Predicate('left', fails=failure == 'eval')
            if failure == 'copy':
                left.state = SlotsState()
                left.state.mutable = []
            with self.subTest(failure=failure):
                result = realize('left * right', {'left': left, 'right': Predicate('right')})
                by_id = {node['id']: node for node in nodes(result['tree'])}
                self.assertEqual(result['surface'], 'left-consumed right:1')
                self.assertEqual(by_id['root/left']['evaluation']['status'], 'unavailable')
                self.assertTrue(by_id['root/left']['evaluation']['message'])
                self.assertEqual(by_id['root/right']['evaluation']['surface'], 'right:1')
                self.assertEqual(by_id['root']['evaluation']['surface'], result['surface'])

    def test_empty_surface_is_success_and_literals_or_functions_are_not_claimed_as_morphology(self):
        raw = 'helper(base, 2, False, None, "texto", helper)'
        result = realize(raw, {'helper': helper, 'base': Predicate('base', empty=True)})
        by_id = {node['id']: node for node in nodes(result['tree'])}
        self.assertEqual(by_id['root']['evaluation'], {'status': 'ok', 'surface': ''})
        self.assertEqual(by_id['root/arg0']['evaluation'], {'status': 'ok', 'surface': ''})
        for index, text in ((1, '2'), (2, 'False'), (3, 'None'), (4, 'texto')):
            self.assertEqual(by_id[f'root/arg{index}']['evaluation'], {'status': 'value', 'value': text})
        self.assertEqual(by_id['root/arg5']['evaluation']['status'], 'unavailable')

    def test_normal_interpretation_without_previews_does_not_call_eval(self):
        left = Predicate('left')
        right = Predicate('right')
        result = interpret(parse_ast('left * right'), {'left': left, 'right': right})
        self.assertEqual(left.cache['eval_calls'], 0)
        self.assertEqual(right.cache['eval_calls'], 0)
        self.assertEqual(result.cache['eval_calls'], 0)


REAL = Path(os.environ.get('PYDICATE_PROJECT_PARENT', str(Path(__file__).resolve().parents[3]))).expanduser().resolve()


@unittest.skipUnless((REAL / 'oldtupicorpus/historic/araujo_catecismo_1686.tu.py').exists(), 'selected local corpus not installed')
class RealStepEvaluationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.corpus = configure(REAL)
        cls.path = cls.corpus / 'historic/araujo_catecismo_1686.tu.py'
        cls.entries = source_entries(cls.path)
        cls.original = cls.path.read_bytes()

    @classmethod
    def tearDownClass(cls):
        assert cls.path.read_bytes() == cls.original, 'Step previews must not edit historical source'

    def test_actual_compound_contains_the_result_of_every_prior_building_step(self):
        entry = self.entries[80]
        raw = '(pûera * (og * (emi * tym))) / ypy'
        result = realize(raw, namespace_for(self.corpus, self.path, entry['statementLine']))
        by_code = {node['code']: node for node in nodes(result['tree'])}
        expected = {
            'tym': 'tym',
            'emi * tym': 'temityma',
            'og * (emi * tym)': 'oemityma',
            'pûera * (og * (emi * tym))': 'oemitymbûera',
            raw: 'oemitymbûerypy',
        }
        for expression, surface in expected.items():
            with self.subTest(expression=expression):
                self.assertEqual(by_code[expression]['evaluation'], {'status': 'ok', 'surface': surface})

    def test_all_araujo_roots_match_independent_normal_execution_and_keep_step_statuses(self):
        self.assertGreaterEqual(len(self.entries), 82)
        for entry in self.entries:
            with self.subTest(ordinal=entry['ordinal']):
                raw = entry['expression']
                reference = interpret(parse_ast(raw), namespace_for(self.corpus, self.path, entry['statementLine']))
                expected_structure = shape(reference)
                expected_surface = str(reference.eval())
                expected_annotated = str(reference.eval(annotated=True))
                result = realize(raw, namespace_for(self.corpus, self.path, entry['statementLine']))
                self.assertEqual(result['surface'], expected_surface)
                self.assertEqual(result['annotated'], expected_annotated)
                self.assertEqual(result['structure'], expected_structure)
                self.assertEqual(result['tree']['evaluation'], {'status': 'ok', 'surface': result['surface']})
                for node in nodes(result['tree']):
                    self.assertIn(node['evaluation']['status'], ('ok', 'value', 'unavailable'))
                # Snapshots contain engine objects and must never enter IPC.
                json.dumps(result)


if __name__ == '__main__':
    unittest.main()
