"""Lexical source provenance without generating text or invoking a provider."""
import json
from pathlib import Path
import sys
import tempfile
import unittest
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from active_lexicon import inventory


class Predicate:
    category = 'noun'
    def __init__(self, name, definition=''):
        self.verbete = name
        self.definition = definition
    def eval(self):
        raise AssertionError('Inventory must not evaluate a predicate')
    def __mul__(self, other):
        return Predicate(self.verbete + other.verbete)


class ActiveLexiconTests(unittest.TestCase):
    def fixture(self, shared, local=''):
        temp = tempfile.TemporaryDirectory(); self.addCleanup(temp.cleanup)
        corpus = Path(temp.name); (corpus / 'historic').mkdir()
        (corpus / 'historic/lexicon.tu.py').write_text(shared)
        source = corpus / 'historic/example.tu.py'; source.write_text(local)
        namespace = {'Predicate': Predicate}
        exec(shared, namespace); exec(local, namespace)
        return corpus, source, namespace

    def test_composite_aliases_repeated_occurrences_and_elements(self):
        corpus, source, namespace = self.fixture("base = Predicate('taba', definition='aldeia')\nother = Predicate('xe')\nalias = base\ncompound = alias * other\n")
        result = inventory('compound * base * base', corpus, source, namespace)
        entries = {item['name']: item for item in result['entries']}
        self.assertEqual(set(entries), {'compound', 'alias', 'base', 'other'})
        self.assertNotEqual(entries['alias']['id'], entries['base']['id'])
        self.assertEqual(len(entries['base']['occurrenceIds']), 3)
        self.assertEqual(entries['base']['elements'][1], {'name': 'definition', 'code': "'aldeia'"})
        self.assertEqual(len({item['id'] for item in result['occurrences']}), len(result['occurrences']))
        expanded = next(item for item in result['occurrences'] if item['name'] == 'base' and item['via'])
        self.assertEqual(expanded['via'], ['compound', 'alias'])
        self.assertFalse(expanded['direct'])
        self.assertEqual(result['diagnostics'], [])
        changed = inventory('base * compound * base', corpus, source, namespace)
        self.assertTrue(set(entries['base']['occurrenceIds']).isdisjoint({item['id'] for item in changed['occurrences']}))

    def test_nested_helper_parameter_bindings_do_not_become_lexical_entries(self):
        corpus, source, namespace = self.fixture("base = Predicate('taba')\nother = Predicate('xe')\ntwice = lambda x: x * x\nouter = lambda y: twice(y) * other\n")
        result = inventory('outer(base)', corpus, source, namespace)
        self.assertEqual({item['name'] for item in result['entries']}, {'outer', 'twice', 'base', 'other'})
        uses = [item for item in result['occurrences'] if item['name'] == 'base']
        self.assertEqual(len(uses), 2)
        self.assertEqual([item['sourceNodeId'] for item in uses], ['root/arg0', 'root/arg0'])
        self.assertEqual([item['binding']['parameter'] for item in uses], ['y', 'y'])
        self.assertEqual(result['diagnostics'], [])

    def test_conditional_helper_marks_candidates_and_local_shadowing(self):
        corpus, source, namespace = self.fixture("base = Predicate('taba')\nother = Predicate('xe')\ndef choose(x, flag=True):\n    other = x\n    if flag:\n        return other\n    return base\n")
        result = inventory('choose(base)', corpus, source, namespace)
        self.assertNotIn('other', {item['name'] for item in result['entries']})
        self.assertTrue(any('candidatas' in value for value in result['diagnostics']))
        self.assertTrue(all(item['certainty'] == 'candidate' for item in result['occurrences'] if item['name'] == 'base'))

    def test_source_shadow_identity_exact_line_context_and_invalid_raw(self):
        corpus, source, namespace = self.fixture("base = Predicate('original')\n", "base = Predicate('local')\n")
        local = inventory('base', corpus, source, namespace, source_line=2)
        before = inventory('base', corpus, source, namespace, source_line=1)
        self.assertNotEqual(local['entries'][0]['id'], before['entries'][0]['id'])
        self.assertEqual(local['entries'][0]['provenance']['sourcePath'], str(source))
        invalid = inventory('base * (', corpus, source, namespace)
        self.assertEqual(invalid['entries'], [])
        self.assertTrue(invalid['diagnostics'])
        json.dumps(local)


if __name__ == '__main__': unittest.main()
