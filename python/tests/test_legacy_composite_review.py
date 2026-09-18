"""Ordinary review repairs only dictionary-proven legacy compound definitions.

These checks use the actual selected engine and a disposable corpus. They never
call composition_define or apply a preview, and make no provider requests.
"""
import ast
import copy
import json
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import test_lexical_publication as fixtures


COMPOUND_DEFINITION = (
    '(etim. - fazer-se padre) (s.) - sacramento da ordem (Ar., Cat., 17v)'
)
LEGACY_DEFINITION = (
    COMPOUND_DEFINITION
    + '; definição do composto nhe + mo + abaré (Navarro 7935).'
)
PASSAGE_ID = 'passage:dbb1dab7-bb56-41b8-81e2-2c143aad47da'


@unittest.skipUnless(
    (fixtures.REAL / 'oldtupicorpus/historic' / f'{fixtures.SOURCE}.tu.py').exists(),
    'selected corpus not installed',
)
class LegacyCompositeReviewTests(unittest.TestCase):
    # Reuse only fixture setup/cleanup, without inheriting the other test cases.
    @classmethod
    def setUpClass(cls):
        fixtures.LexicalPublicationTests.setUpClass.__func__(cls)

    @classmethod
    def tearDownClass(cls):
        fixtures.LexicalPublicationTests.tearDownClass.__func__(cls)

    setUp = fixtures.LexicalPublicationTests.setUp
    tearDown = fixtures.LexicalPublicationTests.tearDown
    assert_unchanged = fixtures.LexicalPublicationTests.assert_unchanged

    def request(self, definition):
        raw = (
            "(((((nhe) * ((mo) * (Noun(value='abaré', definition="
            + repr(definition)
            + ")))).var(1)).base_nominal()))"
        )
        return {
            'sourceId': fixtures.SOURCE,
            'newPassageId': PASSAGE_ID,
            'raw': raw,
            'metadata': {'diplomatic': 'Nhemöabaré.', 'printedPage': '6'},
        }

    def assert_composite_review(self, preview, definition):
        self.assertEqual(preview['raw'], 'nhemoabare')
        self.assertIn('+l += nhemoabare\n', preview['diff'])
        self.assertTrue(preview['diagnostics'])
        self.assertTrue(preview['regression']['ok'])
        self.assertFalse(preview['regression']['failures'])
        self.assertGreater(preview['regression']['checked'], 100)
        entries = {item['name']: item for item in preview['lexicalAdditions']}
        self.assertEqual(set(entries), {'abare', 'nhemoabare'})
        self.assertIn('padre', entries['abare']['definition'])
        self.assertNotIn('sacramento da ordem', entries['abare']['definition'])
        self.assertEqual(entries['nhemoabare']['definition'], definition)
        self.assertEqual(entries['nhemoabare']['kind'], 'composition')
        expected = ast.parse(
            '(nhe * (mo * abare)).var(1).base_nominal().copy()', mode='eval',
        )
        actual = ast.parse(entries['nhemoabare']['expression'], mode='eval')
        self.assertEqual(ast.dump(actual), ast.dump(expected))
        self.assertIn(
            '+nhemoabare.definition = ' + repr(definition), preview['diff'],
        )
        self.assertEqual(len(preview['definitionRepairs']), 1)
        repair = preview['definitionRepairs'][0]
        self.assertEqual(repair['base'], 'abaré')
        self.assertEqual(repair['compound'], 'nhemoabaré')
        self.assertEqual(repair['before'], definition)
        self.assertEqual(repair['compoundDefinition'], definition)
        self.assertEqual(repair['baseDefinition'], entries['abare']['definition'])
        self.assert_unchanged()

    def test_exact_reported_legacy_draft_repairs_on_ordinary_repeatable_review(self):
        request = self.request(LEGACY_DEFINITION)
        original_request = copy.deepcopy(request)
        # Retained draft bytes are independent of the proposed source/lexicon
        # review; the user must still explicitly choose to publish that diff.
        saved_draft = self.state / 'legacy-draft.json'
        saved_draft.parent.mkdir(parents=True, exist_ok=True)
        saved_draft.write_text(json.dumps(request, ensure_ascii=False))
        draft_before = saved_draft.read_bytes()

        preview = self.adapter.invoke('source_new_preview', request)
        self.assert_composite_review(preview, LEGACY_DEFINITION)
        repeated = self.adapter.invoke('source_new_preview', request)
        self.assert_composite_review(repeated, LEGACY_DEFINITION)
        for key in ('raw', 'diff', 'files', 'lexicalAdditions', 'diagnostics'):
            self.assertEqual(preview[key], repeated[key], key)
        self.assertEqual(request, original_request)
        self.assertEqual(saved_draft.read_bytes(), draft_before)

    def test_exact_dictionary_definition_moves_to_composition_without_legacy_suffix(self):
        preview = self.adapter.invoke(
            'source_new_preview', self.request(COMPOUND_DEFINITION),
        )
        self.assert_composite_review(preview, COMPOUND_DEFINITION)

    def test_custom_base_definition_is_preserved_without_automatic_composite(self):
        definition = 'Sentido autoral de abaré nesta passagem; nota a revisar.'
        preview = self.adapter.invoke('source_new_preview', self.request(definition))
        entries = {item['name']: item for item in preview['lexicalAdditions']}
        self.assertEqual(set(entries), {'abare'})
        self.assertEqual(entries['abare']['definition'], definition)
        self.assertNotIn('nhemoabare', preview['raw'])
        self.assertNotIn('nhemoabare.definition', preview['diff'])
        self.assertTrue(preview['regression']['ok'])
        self.assertFalse(preview['regression']['failures'])
        self.assert_unchanged()

    def test_different_whole_surface_does_not_trigger_dictionary_repair(self):
        request = self.request(COMPOUND_DEFINITION)
        request['raw'] = (
            "nhe * (mo * Noun(value='abaré', definition="
            + repr(COMPOUND_DEFINITION) + '))'
        )
        preview = self.adapter.invoke('source_new_preview', request)
        entries = {item['name']: item for item in preview['lexicalAdditions']}
        self.assertEqual(set(entries), {'abare'})
        self.assertEqual(entries['abare']['definition'], COMPOUND_DEFINITION)
        self.assertFalse(preview.get('definitionRepairs'))
        self.assertTrue(preview['regression']['ok'])
        self.assert_unchanged()

    def test_explicit_leaf_definition_is_not_treated_as_legacy_corruption(self):
        request = self.request(COMPOUND_DEFINITION)
        request['raw'] = (
            "(nhe * (mo * studio_define(Noun(value='abaré', definition='padre'), "
            + repr(COMPOUND_DEFINITION) + '))).var(1).base_nominal()'
        )
        preview = self.adapter.invoke('source_new_preview', request)
        entries = {item['name']: item for item in preview['lexicalAdditions']}
        self.assertEqual(set(entries), {'abare'})
        self.assertEqual(entries['abare']['definition'], COMPOUND_DEFINITION)
        self.assertFalse(preview.get('definitionRepairs'))
        self.assertNotIn('nhemoabare', preview['raw'])
        self.assertTrue(preview['regression']['ok'])
        self.assert_unchanged()


if __name__ == '__main__':
    unittest.main()
