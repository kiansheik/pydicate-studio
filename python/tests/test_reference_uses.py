"""Static cross-source impact inspection, including aliases and shadowing."""
import sys
import tempfile
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from reference_uses import reference_uses


class ReferenceUsesTests(unittest.TestCase):
    def test_transitive_uses_keep_definition_identity_across_sources_and_rebinding(self):
        with tempfile.TemporaryDirectory() as directory:
            corpus = Path(directory)
            historic = corpus / 'historic'; historic.mkdir()
            lexical = historic / 'lexicon.tu.py'
            lexical.write_text("root = Noun('root')\ncompound = root * other\n")
            (historic / 'one.tu.py').write_text("l = [compound, root]\nroot = Noun('different')\nl += root\nl += compound\none = l\n")
            (historic / 'two.tu.py').write_text("l = [other]\nl += compound\ntwo = l\n")
            before = {path:path.read_bytes() for path in historic.iterdir()}
            result = reference_uses(corpus, 'root', str(lexical), 1)
            self.assertEqual([(use['sourceId'], use['ordinal']) for use in result['uses']], [('one',1),('one',2),('one',4),('two',2)])
            self.assertEqual(result['uses'][0]['via'], ['compound'])
            self.assertFalse(result['uses'][0]['direct'])
            self.assertTrue(result['uses'][1]['direct'])
            self.assertEqual(result['diagnostics'], [])
            self.assertEqual(before, {path:path.read_bytes() for path in historic.iterdir()})
