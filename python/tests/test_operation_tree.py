"""Source-operation identity survives eager Pydicate composition; no provider calls."""
import ast
import os
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from authoring_runtime import configure, lexicon_result, namespace_for, realize
from studio_authoring import expression_tree, replace_node, source_entries


def nodes(root):
    yield root
    for child in root['children']:
        yield from nodes(child['node'])


def source_steps(raw):
    """Independently enumerate authoring steps, excluding Python load/operator tokens."""
    syntax = ast.increment_lineno(ast.parse('(\n' + raw + '\n)', mode='eval').body, -1)

    def visit(node, identifier='root'):
        yield identifier, node
        if isinstance(node, ast.BinOp):
            children = [('left', node.left), ('right', node.right)]
        elif isinstance(node, ast.UnaryOp):
            children = [('operand', node.operand)]
        elif isinstance(node, ast.Compare):
            assert len(node.ops) == 1
            children = [('left', node.left), ('right', node.comparators[0])]
        elif isinstance(node, ast.Call):
            children = [('receiver', node.func.value)] if isinstance(node.func, ast.Attribute) else []
            children += [('arg' + str(index), value) for index, value in enumerate(node.args)]
            children += [('kw:' + value.arg, value.value) for value in node.keywords]
        else:
            assert isinstance(node, (ast.Name, ast.Constant)), type(node).__name__
            children = []
        for slot, child in children:
            yield from visit(child, identifier + '/' + slot)

    return list(visit(syntax))


class OperationAssertions:
    def assert_source_fidelity(self, raw, root):
        actual = list(nodes(root))
        expected = source_steps(raw)
        self.assertEqual([node['id'] for node in actual], [identifier for identifier, _ in expected])
        self.assertEqual(len({node['id'] for node in actual}), len(actual))
        encoded = raw.encode('utf-16-le')
        for node, (identifier, syntax) in zip(actual, expected):
            with self.subTest(node=identifier):
                self.assertEqual(node['code'], ast.get_source_segment(raw, syntax))
                self.assertEqual(encoded[node['start'] * 2:node['end'] * 2].decode('utf-16-le'), node['code'])
                self.assertEqual(replace_node(raw, node, node['code']), raw)


class OperationSyntaxTests(OperationAssertions, unittest.TestCase):
    def test_calls_receivers_arguments_keywords_and_repeated_references_are_distinct_steps(self):
        raw = '''studio_define(
    (oré * tym).var(1).circ(False),  # preserve the contributor's grouping
    definition="🌿 significado de î / 🦜",
) + oré'''
        parsed = expression_tree(raw, 'unicode-occurrences')
        self.assertFalse(parsed['diagnostics'])
        self.assert_source_fidelity(raw, parsed['root'])
        by_id = {node['id']: node for node in nodes(parsed['root'])}
        self.assertEqual(by_id['root/left']['kind'], 'call')
        self.assertEqual(by_id['root/left/arg0']['kind'], 'method')
        self.assertEqual(by_id['root/left/arg0/receiver']['kind'], 'method')
        self.assertEqual(by_id['root/left/arg0/arg0']['value'], False)
        self.assertEqual(by_id['root/left/kw:definition']['value'], '🌿 significado de î / 🦜')
        occurrences = [node for node in by_id.values() if node['code'] == 'oré']
        self.assertEqual(len(occurrences), 2)
        self.assertNotEqual(occurrences[0]['start'], occurrences[1]['start'])
        edited = replace_node(raw, occurrences[1], 'ixé')
        self.assertEqual(edited, raw.removesuffix('oré') + '(ixé)')
        self.assert_source_fidelity(edited, expression_tree(edited)['root'])

    def test_every_supported_operator_retains_its_own_step_and_operand_slots(self):
        for symbol in ('*', '+', '/', '@', '<<', '>>', '==', '!='):
            raw = f'(-tym) {symbol} (+tym)'
            root = expression_tree(raw)['root']
            with self.subTest(operator=symbol):
                self.assert_source_fidelity(raw, root)
                self.assertEqual(root['operator'], symbol)
                self.assertEqual([child['slot'] for child in root['children']], ['left', 'right'])
                self.assertEqual([child['node']['operator'] for child in root['children']], ['-', '+'])
                self.assertEqual(len(list(nodes(root))), 5)


REAL = Path(os.environ.get('PYDICATE_PROJECT_PARENT', str(Path(__file__).resolve().parents[3]))).expanduser().resolve()


@unittest.skipUnless((REAL / 'oldtupicorpus/historic/araujo_catecismo_1686.tu.py').exists(), 'selected local corpus not installed')
class RealOperationTreeTests(OperationAssertions, unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.corpus = configure(REAL)
        cls.path = cls.corpus / 'historic/araujo_catecismo_1686.tu.py'
        cls.entries = source_entries(cls.path)
        cls.original = cls.path.read_bytes()

    @classmethod
    def tearDownClass(cls):
        assert cls.path.read_bytes() == cls.original, 'Operation tree checks must not edit the corpus'

    def test_araujo_81_keeps_every_composition_step_even_when_result_is_frozen_classifier(self):
        entry = self.entries[80]
        result = realize(entry['expression'], namespace_for(self.corpus, self.path, entry['statementLine']))
        self.assert_source_fidelity(entry['expression'], result['tree'])
        compound = next(node for node in nodes(result['tree']) if node.get('operator') == '/')
        self.assertEqual(compound['runtimeType'], 'Classifier')
        self.assertEqual(compound['code'], '(pûera * (og * (emi * tym))) / ypy')
        self.assertEqual([node['operator'] for node in nodes(compound) if 'operator' in node], ['/', '*', '*', '*'])
        self.assertEqual([node['code'] for node in nodes(compound) if node['kind'] == 'reference'], ['pûera', 'og', 'emi', 'tym', 'ypy'])
        self.assertTrue(all(node.get('dispatch') for node in nodes(compound) if 'operator' in node))
        self.assertTrue(any(node['label'] == 'oemitymbûerypy' and node['runtimeType'] == 'Classifier' for node in result['runtimeTree']['nodes']))
        self.assertNotIn('oemitymbûerypy', [node['code'] for node in nodes(compound)])

    def test_compound_can_be_built_one_source_operation_at_a_time(self):
        entry = self.entries[80]
        namespace = namespace_for(self.corpus, self.path, entry['statementLine'])
        raw = 'tym'
        expected = ('tym', 'temityma', 'oemityma', 'oemitymbûera', 'oemitymbûerypy')
        for index, modifier in enumerate((None, 'emi', 'og', 'pûera', 'ypy')):
            if modifier:
                raw = f'({raw}) / ypy' if modifier == 'ypy' else f'{modifier} * ({raw})'
            result = realize(raw, namespace)
            with self.subTest(step=index):
                self.assertEqual(result['surface'], expected[index])
                self.assertEqual(len(list(nodes(result['tree']))), 1 + 2 * index)
                self.assert_source_fidelity(raw, result['tree'])

    def test_all_araujo_evaluations_preserve_every_explicit_source_step(self):
        self.assertGreaterEqual(len(self.entries), 82)
        for entry in self.entries:
            with self.subTest(ordinal=entry['ordinal']):
                namespace = namespace_for(self.corpus, self.path, entry['statementLine'])
                result = realize(entry['expression'], namespace)
                self.assert_source_fidelity(entry['expression'], result['tree'])
                for node in nodes(result['tree']):
                    self.assertIn('runtimeType', node)
                    if node['kind'] in ('binary', 'comparison', 'unary', 'call', 'method'):
                        self.assertIn('dispatch', node)

    def test_reused_reference_only_gains_editable_inner_steps_after_verified_copy(self):
        entry = self.entries[59]
        namespace = namespace_for(self.corpus, self.path, entry['statementLine'])
        original = realize(entry['expression'], namespace)
        reference = next(node for node in nodes(original['tree']) if node['code'] == 'risetoheaven')
        self.assertEqual(reference['children'], [])
        info = lexicon_result({'action': 'lexicon_inspect', 'name': 'risetoheaven'}, self.corpus, self.path, namespace)
        self.assertTrue(info['safeOccurrenceExpansion'])
        expanded_raw = replace_node(entry['expression'], reference, info['safeOccurrenceExpansion'])
        expanded = realize(expanded_raw, namespace)
        self.assert_source_fidelity(expanded_raw, expanded['tree'])
        expanded_scope = next(node for node in nodes(expanded['tree']) if node['id'] == reference['id'])
        self.assertGreater(len(list(nodes(expanded_scope))), 1)
        self.assertEqual(expanded['surface'], original['surface'])
        self.assertEqual(expanded['annotated'], original['annotated'])
        self.assertEqual(expanded['structure'], original['structure'])


if __name__ == '__main__':
    unittest.main()
