"""Discovery tolerates spelling omissions without changing lexical identities."""
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from lexical_search import Document, Query
from rendered_structures import search
from authoring_runtime import lexicon_result


class LexicalSearchTests(unittest.TestCase):
    def test_complete_forms_then_whole_meanings_then_prefixes_and_substrings(self):
        rows = [
            {'id': 'substring', 'surface': 'other', 'definition': 'acabamento'},
            {'id': 'prefix', 'surface': 'abacaxi'},
            {'id': 'whole-meaning', 'surface': 'word', 'definition': 'abá; pessoa'},
            {'id': 'folded', 'surface': 'abá'},
            {'id': 'exact', 'surface': 'aba'},
        ]
        rows = [dict(kind='reference', expression=row['id'], **row) for row in rows]
        self.assertEqual([row['id'] for row in search(rows, 'aba')['results']],
                         ['exact', 'folded', 'whole-meaning', 'prefix', 'substring'])
        self.assertIsNone(Query('cas a').match(Document(definition='casa')))
        meaning = Query('casa')
        self.assertLess(meaning.match(Document(definition='uma casa')).rank,
                        meaning.match(Document(definition='casamento')).rank)

    def test_apostrophe_and_diacritic_fallback_keeps_distinct_names_and_saved_forms(self):
        rows = [{'id': 'variable', 'name': 'u', 'surface': "'ú"},
                {'id': 'other', 'name': 'other_u', 'surface': 'u'},
                {'id': 'sense', 'name': 'second', 'surface': '’u'}]
        rows = [dict(kind='reference', expression=row['id'], **row) for row in rows]
        self.assertEqual(search(rows, 'u')['results'][0]['id'], 'variable')
        for query in ("'u", '’u', 'ʔu', "'u\u0301"):
            self.assertEqual(search(rows, query)['total'], 3)
        self.assertEqual(rows[0]['surface'], "'ú")
        self.assertEqual(rows[2]['surface'], '’u')
        self.assertEqual(Query('root_123').match(Document(name='root_123')).rank[0], -1)

    def test_lexicon_surfaces_are_folded_and_ranked_before_limit_without_mutating_values(self):
        class Predicate:
            def __init__(self, surface): self.surface = surface; self.calls = 0
            def eval(self): self.calls += 1; return self.surface
        entries = [{'name': 'a_definition', 'definition': 'pessoa aba'},
                   {'name': 'b_prefix', 'definition': ''},
                   {'name': 'z_exact', 'definition': ''}]
        namespace = {name: Predicate(surface) for name, surface in
                     [('a_definition', 'other'), ('b_prefix', 'abacaxi'), ('z_exact', 'abá')]}
        with patch('authoring_runtime.lexical_entries', return_value=entries):
            result = lexicon_result({'action': 'lexicon_search', 'query': 'aba', 'limit': 1}, None, None, namespace)
        self.assertEqual(result['total'], 3)
        self.assertEqual(result['results'][0]['name'], 'z_exact')
        self.assertEqual(result['results'][0]['surface'], 'abá')
        self.assertTrue(all(value.calls == 0 for value in namespace.values()))
