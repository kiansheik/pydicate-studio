"""Stative authoring uses the selected engine's existing nominal conversion."""
import os
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from authoring_runtime import configure, realize, stative_conversion

REAL = Path(os.environ.get('PYDICATE_PROJECT_PARENT', str(Path(__file__).resolve().parents[3]))).expanduser().resolve()


class StativeCapabilityTests(unittest.TestCase):
    def test_capability_does_not_realize_computed_nominal_properties(self):
        class IncompleteNominal:
            def eval(self): raise AssertionError('Do not realize while inspecting')
            @property
            def noun(self): raise AssertionError('Do not evaluate an incomplete noun')
        self.assertEqual(stative_conversion(IncompleteNominal()), 'nominal')
        self.assertEqual(stative_conversion(IncompleteNominal), 'unsupported')
        self.assertEqual(stative_conversion('name'), 'unsupported')


@unittest.skipUnless((REAL / 'nhe-enga/pydicate/pydicate').exists(), 'selected engine not installed')
class SelectedEngineStativeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        configure(REAL)
        from pydicate.lang.tupilang import pos
        cls.namespace = {name: getattr(pos, name) for name in dir(pos) if not name.startswith('_')}

    def test_nominal_and_verbal_inputs_keep_the_original_source_tree(self):
        cases = [
            ('Noun("porang")', 'nominal'),
            ('Noun("porang") / Noun("ting")', 'nominal'),
            ('Pronoun("xe")', 'nominal'),
            ('Postposition("pupé")', 'nominal'),
            ('bae * Verb("só")', 'nominal'),
            ('Verb("potar", verb_class="(v.tr.)")', 'base_nominal'),
            ('Noun("tekó") / Verb("kuab", verb_class="(v.tr.)")', 'base_nominal'),
            ('Number("mokõi")', 'base_nominal'),
        ]
        for raw, mode in cases:
            with self.subTest(raw=raw):
                original = realize(raw, self.namespace)
                self.assertEqual(original['tree']['stativeConversion'], mode)
                conversion = f'v(({raw}))' if mode == 'nominal' else f'v(({raw}).base_nominal())'
                result = realize(conversion, self.namespace)
                self.assertEqual(result['evaluationStatus'], 'complete')
                self.assertEqual(result['tree']['runtimeType'], 'Verb')
                child = result['tree']['children'][0]['node']
                if mode == 'base_nominal': child = child['children'][0]['node']
                self.assertEqual(child['code'], raw)
                self.assertEqual(realize(raw, self.namespace)['annotated'], original['annotated'])

    def test_compound_stative_keeps_incorporation_annotations_and_changes_verb_class(self):
        raw = 'Noun("tekó") / Verb("kuab", verb_class="(v.tr.)")'
        before = realize(f'bae * ({raw})', self.namespace)
        after = realize(f'bae * v(({raw}).base_nominal())', self.namespace)
        self.assertEqual(before['surface'], "otekokuaba'e")
        self.assertEqual(after['surface'], "itekokuaba'e")
        self.assertIn('[SUBJECT_PREFIX:3p]', after['annotated'])
        self.assertIn('[INCORPORATED_OBJECT]', after['annotated'])
        self.assertIn('[RELATIVE_AGENT_SUFFIX]', after['annotated'])

    def test_unsupported_roots_remain_preview_errors_without_inventing_a_nominal(self):
        for raw in ('Adverb("kori")', 'Interjection("pa")'):
            with self.subTest(raw=raw):
                original = realize(raw, self.namespace)
                self.assertEqual(original['tree']['stativeConversion'], 'unsupported')
                result = realize(f'v(({raw}))', self.namespace)
                self.assertEqual(result['evaluationStatus'], 'partial')
                self.assertTrue(result['failures'])


if __name__ == '__main__': unittest.main()
