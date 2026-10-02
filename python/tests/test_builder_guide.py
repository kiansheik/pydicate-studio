"""Executable guide recipes; selected-engine simulations only, no provider calls."""
import ast
import json
import os
import subprocess
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "python"))
from studio_authoring import expression_tree

GUIDE = json.loads((ROOT / "src/domain/builder-guide.json").read_text())
PARENT = Path(os.environ.get("PYDICATE_PROJECT_PARENT", str(ROOT.parent)))
HAS_ENGINE = (PARENT / "oldtupicorpus/historic/lexicon.tu.py").is_file() and (PARENT / "nhe-enga/pydicate").is_dir()

class GuideSyntaxTests(unittest.TestCase):
    def test_portable_guide_matches_the_in_app_recipes(self):
        subprocess.run([sys.executable, "-B", str(ROOT / "scripts/build-builder-guide.py"), "--check"], check=True)

    def test_all_recipes_parse_through_the_contributor_adapter(self):
        for topic in GUIDE["topics"]:
            for example in topic["examples"]:
                with self.subTest(topic=topic["id"], expression=example["expression"]):
                    parsed = expression_tree(example["expression"])
                    self.assertIsNotNone(parsed["root"])
                    self.assertFalse(parsed.get("diagnostics"))

@unittest.skipUnless(HAS_ENGINE, "Selected corpus/engine required for recipe simulations")
class GuideEngineTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from authoring_runtime import configure, namespace_for
        corpus = configure(PARENT)
        cls.namespace = namespace_for(corpus, corpus / "historic/araujo_catecismo_1686.tu.py", 1)

    def value(self, raw):
        from authoring_runtime import interpret
        return interpret(ast.parse(raw, mode="eval").body, self.namespace)

    def test_reference_results_and_complete_evaluation(self):
        from authoring_runtime import realize
        for topic in GUIDE["topics"]:
            for example in topic["examples"]:
                with self.subTest(topic=topic["id"], expression=example["expression"]):
                    result = realize(example["expression"], self.namespace)
                    self.assertEqual(result["surface"], example["surface"])
                    self.assertEqual(result["failures"], [])

    def test_equal_be_surfaces_have_distinct_categories_and_arities(self):
        conjunction = self.value("abé.var(1) * ybaka * yby")
        postposition = self.value('Postposition("bé") * (ybaka + yby)')
        self.assertEqual(conjunction.eval(), postposition.eval())
        self.assertEqual(type(conjunction).__name__, "Conjunction")
        self.assertEqual(len(conjunction.arguments), 2)
        self.assertEqual(type(postposition).__name__, "Postposition")
        self.assertEqual(len(postposition.arguments), 1)
        self.assertFalse(self.value("abé * ybaka").is_valid())
        self.assertTrue(self.value("abé * ybaka * yby * abá").is_valid())

    def test_close_adjuncts_and_peripheral_adjuncts_use_distinct_slots(self):
        after = self.value('(Adverb("kori") + (ikó * ae)) << Adverb("eté")')
        before = self.value('Adverb("eté") >> ((ikó * ae) + Adverb("kori"))')
        self.assertEqual([x.verbete for x in after.v_adjuncts], ["eté"])
        self.assertEqual([x.verbete for x in after.pre_adjuncts], ["kori"])
        self.assertEqual([x.verbete for x in before.v_adjuncts_pre], ["eté"])
        self.assertEqual([x.verbete for x in before.post_adjuncts], ["kori"])

    def test_nominal_recipe_does_not_claim_universal_operation_order(self):
        before = self.value("(ikó * ae).base_nominal() + (esé * abá)")
        after = self.value("((ikó * ae) + (esé * abá)).base_nominal()")
        self.assertEqual(before.category, "noun")
        self.assertEqual(before.eval(), after.eval())
        self.assertFalse(self.namespace["ikó"].negated)
        self.assertEqual(self.value("--(ikó * ae)").eval(), self.value("ikó * ae").eval())
        self.assertTrue(self.value("+nde").pro_drop)
        self.assertFalse(self.namespace["nde"].pro_drop)

if __name__ == "__main__":
    unittest.main()
