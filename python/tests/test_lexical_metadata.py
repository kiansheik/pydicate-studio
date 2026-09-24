"""Manual grammar choices retain unknown meanings and explicit uncertainty."""
import ast
import os
from pathlib import Path
import sys
from types import SimpleNamespace
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from authoring_runtime import configure, interpret, namespace_for, predicate_create, realize, shape
from lexical_metadata import HYPOTHETICAL_TAG, inherit_lexical_status, lexical_status, restore_namespace_lexical_status

REAL = Path(os.environ.get('PYDICATE_PROJECT_PARENT', str(Path(__file__).resolve().parents[3]))).resolve()


class LexicalStatusTests(unittest.TestCase):
    class Predicate:
        def __init__(self, tag='[NOUN]'):
            self.tag = tag
            self.arg0 = self

        def eval(self):
            return 'singleton'

    def test_status_follows_children_without_recursing_through_cycles(self):
        child = SimpleNamespace(eval=lambda: '', tag=HYPOTHETICAL_TAG)
        parent = SimpleNamespace(eval=lambda: '', tag='[VERB]', arguments=[])
        parent.arguments.extend([parent, child])
        self.assertEqual(lexical_status(parent), 'hypothetical')
        parent.arguments.pop()
        self.assertIsNone(lexical_status(parent))
        self.assertIsNone(lexical_status(lambda: child))

    def test_saved_dependencies_recover_erased_status_without_executing_source(self):
        def predicate(tag='[NOUN]'):
            return self.Predicate(tag)
        namespace = {'root': predicate(HYPOTHETICAL_TAG), 'derived': predicate(),
                     'alias': predicate(), 'clean': predicate(),
                     'captured': lambda: None, 'shadowed': lambda root: None,
                     'via_helper': predicate()}
        source = '''derived = root.base_nominal()
alias = derived
clean = Noun('other', definition='root [LEXICAL_STATUS:HYPOTHETICAL]')
def captured():
    return root.base_nominal()
def shadowed(root):
    return root.base_nominal()
via_helper = captured()
'''
        before = {name: value.tag for name, value in namespace.items() if hasattr(value, 'tag')}
        restore_namespace_lexical_status(namespace, ast.parse(source).body)
        for name in ('root', 'derived', 'alias', 'captured', 'via_helper'):
            self.assertEqual(lexical_status(namespace[name]), 'hypothetical', name)
        self.assertIsNone(lexical_status(namespace['clean']))
        self.assertIsNone(lexical_status(namespace['shadowed']))
        self.assertEqual(before, {name: value.tag for name, value in namespace.items() if hasattr(value, 'tag')})

    def test_ignored_hypothetical_input_cannot_mark_the_shared_returned_singleton(self):
        singleton = self.Predicate()
        root = self.Predicate(HYPOTHETICAL_TAG)
        result = inherit_lexical_status(singleton, root)
        self.assertIsNot(result, singleton)
        self.assertIs(result.arg0, result)
        self.assertIsNone(lexical_status(singleton))
        self.assertEqual(lexical_status(result), 'hypothetical')
        self.assertEqual(shape(singleton), shape(result))
        namespace = {'known': singleton, 'root': root, 'derived': singleton}
        restore_namespace_lexical_status(namespace, ast.parse('derived = ignore(root)').body)
        self.assertIs(namespace['known'], singleton)
        self.assertIsNone(lexical_status(namespace['known']))
        self.assertEqual(lexical_status(namespace['derived']), 'hypothetical')
        self.assertEqual(shape(namespace['known']), shape(namespace['derived']))


@unittest.skipUnless((REAL / 'oldtupicorpus/historic/lexicon.tu.py').exists(), 'selected corpus not installed')
class ManualLexicalGrammarTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        corpus = configure(REAL)
        cls.namespace = namespace_for(corpus, corpus / 'historic/lexicon.tu.py', 1)

    def create(self, name='Noun', values=None, lexical=None):
        return predicate_create({'constructor': name, 'values': values or {'value': 'ekat'},
                                 **({'lexical': lexical} if lexical is not None else {})}, self.namespace)

    def value(self, expression):
        return interpret(ast.parse(expression, mode='eval').body, self.namespace)

    def test_default_options_preserve_existing_constructor_source(self):
        values = {'value': 'abá', 'definition': '(t) original grammar and gloss'}
        before = self.create(values=values)
        after = self.create(values=values, lexical={'pluriform': 'default', 'verbClass': 'default', 'status': 'unspecified'})
        self.assertEqual(before['expression'], after['expression'])
        self.assertEqual(before['surface'], after['surface'])

    def test_explicit_nominal_class_is_independent_of_semantic_markers(self):
        definition = '(s) is quoted as a hypothesis, not a morphology choice'
        result = self.create(values={'value': 'ekat', 'definition': definition},
                             lexical={'pluriform': 't', 'status': 'hypothetical'})
        value = self.value(result['expression'])
        self.assertEqual(value.noun.pluriforme, 't')
        self.assertEqual(value.definition, definition)
        self.assertEqual(result['surface'], 'tekata')
        self.assertEqual(result['tree']['lexicalStatus'], 'hypothetical')
        no_prefix = self.create(values={'value': 'ekat', 'definition': '(t) semantic note'}, lexical={'pluriform': 'none'})
        self.assertFalse(self.value(no_prefix['expression']).noun.pluriforme)
        self.assertEqual(no_prefix['surface'], 'ekata')

    def test_explicit_stative_class_preserves_unknown_semantics(self):
        result = self.create('Verb', lexical={'pluriform': 't', 'verbClass': 'stative', 'status': 'hypothetical'})
        value = self.value(result['expression'])
        self.assertEqual(value.definition, '')
        self.assertEqual(value.verb.verb_class, '(t) adj.')
        self.assertTrue(value.verb.segunda_classe)
        self.assertFalse(value.verb.transitivo)
        self.assertEqual(str(self.value('(+ixé * (' + result['expression'] + '))').eval()), 'xerekat')
        self.assertEqual(result['lexicalStatus'], 'hypothetical')

    def test_invalid_class_or_status_cannot_silently_be_accepted(self):
        for name, options in [('Noun', []), ('Noun', {'status': 'attested'}),
                              ('Noun', {'pluriform': 't,t'}), ('Noun', {'verbClass': 'stative'}),
                              ('Verb', {'pluriform': 'm'}), ('Noun', {'definition': 'invented'}),
                              ('ProperNoun', {'status': 'hypothetical'})]:
            with self.subTest(name=name, options=options), self.assertRaises(ValueError):
                self.create(name, lexical=options)

    def test_dictionary_cannot_silently_replace_an_explicit_manual_class(self):
        for options in ({'pluriform': 't', 'verbClass': 'intransitive'},
                        {'pluriform': 'none', 'verbClass': 'stative'}):
            with self.subTest(options=options), self.assertRaisesRegex(ValueError, 'motor substituiu'):
                self.create('Verb', {'value': 'só'}, options)

    def test_status_preserves_custom_tag_and_is_idempotent(self):
        result = self.create(values={'value': 'ekat', 'tag': '[NOUN:CUSTOM]' + HYPOTHETICAL_TAG},
                             lexical={'status': 'hypothetical'})
        tag = self.value(result['expression']).tag
        self.assertEqual(tag, '[NOUN:CUSTOM]' + HYPOTHETICAL_TAG)

    def test_engine_conversions_preserve_status_without_changing_morphology(self):
        noun = self.create(lexical={'pluriform': 't', 'status': 'hypothetical'})['expression']
        verb = self.create('Verb', lexical={'pluriform': 't', 'verbClass': 'stative', 'status': 'hypothetical'})['expression']
        for expression in (f'v({noun})', f'({verb}).base_nominal()'):
            with self.subTest(expression=expression):
                value = self.value(expression)
                self.assertEqual(lexical_status(value), 'hypothetical')
                self.assertNotIn(HYPOTHETICAL_TAG, value.tag)
                before = shape(value)
                value._studio_lexical_status = None
                self.assertEqual(shape(value), before)
                expected_surface, expected_annotated = str(value.eval()), str(value.eval(annotated=True))
                evaluated = realize(expression, self.namespace)
                self.assertEqual(evaluated['tree']['lexicalStatus'], 'hypothetical')
                self.assertEqual(evaluated['surface'], expected_surface)
                self.assertEqual(evaluated['annotated'], expected_annotated)


if __name__ == '__main__':
    unittest.main()
