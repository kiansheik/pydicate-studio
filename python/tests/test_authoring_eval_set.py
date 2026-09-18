"""Leakage controls are inspectable without any model inference or corpus mutation."""
import importlib.util
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("build_authoring_eval", ROOT / "scripts/build-authoring-eval.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class AuthoringEvaluationSetTests(unittest.TestCase):
    def test_duplicates_aliases_transitive_composites_and_merged_origins_are_withheld(self):
        rows = [
            {"ordinal": 1, "expression": "a * b", "surface": "abá", "structureFingerprint": "shape"},
            {"ordinal": 2, "expression": "(a * b)", "surface": "ABÁ ", "structureFingerprint": "shape"},
            {"ordinal": 3, "expression": "unrelated", "surface": "outro", "structureFingerprint": "other"},
        ]
        passages = {n: {"id": f"passage:{n}"} for n in (1, 2, 3)}
        def entry(identifier, raw, structure, surface="abá", origins=None, name=None):
            return {"id": identifier, "expression": raw, "_structure": structure, "surface": surface,
                    "sources": origins or [{"passageId": "lexicon:shared"}], **({"name": name} if name else {})}
        index = [
            entry("target-full", "a * b", "shape", origins=[{"passageId": "passage:1"}, {"passageId": "passage:3"}]),
            entry("duplicate", "(a * b)", "shape", origins=[{"passageId": "passage:2"}]),
            entry("named", "answer_alias", "shape", name="answer_alias"),
            entry("nested", "chained + c", "larger", surface="abá outro"),
            entry("primitive", "Noun('a')", "atomic", surface="a"),
        ]
        definitions = {"answer_alias": {"expression": "a * b"}, "chained": {"expression": "answer_alias"},
                       "larger": {"expression": "chained + c"}, "permitted": {"expression": "Noun('a')"}}
        result = module.exclusions(rows[0], rows, passages, index, definitions)
        self.assertEqual(result["excludePassageIds"], ["passage:1", "passage:2"])
        self.assertEqual(set(result["excludeLexicalNames"]), {"answer_alias", "chained", "larger"})
        self.assertTrue({"target-full", "duplicate", "named", "nested"}.issubset(result["excludeConstructionIds"]))
        self.assertNotIn("primitive", result["excludeConstructionIds"])
        self.assertNotIn("passage:3", result["excludePassageIds"], "an unrelated origin must not become a duplicate answer")

    def test_comparison_modes_preserve_diacritics_and_non_spacing_distinctions(self):
        a, b = module.comparison_keys("Abá "), module.comparison_keys("abá")
        self.assertNotEqual(a["exact"], b["exact"])
        self.assertEqual(a["spacingCase"], b["spacingCase"])
        plain = module.comparison_keys("aba")
        self.assertNotEqual(a["spacingCase"], plain["spacingCase"])
        self.assertEqual(a["accentFolded"], plain["accentFolded"])
        self.assertNotEqual(module.comparison_keys("a-b")["accentFolded"], module.comparison_keys("ab")["accentFolded"])
        self.assertEqual(module.syntax("a\n + b"), module.syntax("(a+b)"))

    def test_nested_answer_fields_never_enter_public_packets(self):
        for name in module.FORBIDDEN_PACKET_KEYS:
            with self.subTest(name=name), self.assertRaisesRegex(ValueError, "Answer-bearing"):
                module.ensure_answer_free({"context": [{name: "hidden"}]})
        module.ensure_answer_free({"diplomatic": "Nhemombëú.", "manifest": {"excludeLexicalNames": ["blocked_name"]}})

    def test_generated_actual_cases_are_separate_arms_and_answers_are_evaluator_only(self):
        output = ROOT / "docs/evaluation/araujo-authoring-v1"
        if not output.exists():
            self.skipTest("Generate the explicit real-data evaluation artifacts first.")
        reconstruction = [json.loads(line) for line in (output / "reconstruction.jsonl").read_text().splitlines()]
        assisted = [json.loads(line) for line in (output / "assisted.jsonl").read_text().splitlines()]
        answers = json.loads((output / "evaluator-only/answers.json").read_text())["cases"]
        provenance = json.loads((output / "provenance.json").read_text())
        self.assertEqual(len(reconstruction), 6)
        self.assertEqual(len(assisted), 6)
        self.assertEqual(provenance["auditCount"], 86)
        self.assertEqual(provenance["readOnlyVerification"]["before"], provenance["readOnlyVerification"]["after"])
        self.assertTrue(provenance["readOnlyVerification"]["unchanged"])
        for case in reconstruction + assisted:
            packet = case["input"]
            module.ensure_answer_free(packet)
            self.assertFalse(packet["context"], "legacy references are not silently certified as reviewed")
            self.assertEqual(packet["manifest"]["allowedSourceIds"], [module.SOURCE, "lexicon"])
            self.assertFalse(packet["evidence"]["images"])
            if packet["manifest"]["mode"] == "reconstruction":
                self.assertIn(packet["passageId"], packet["manifest"]["excludePassageIds"])
                self.assertTrue(packet["manifest"]["excludeConstructionIds"])
            else:
                self.assertEqual(packet["manifest"]["excludePassageIds"], [])
            key = next(answer for answer in answers if answer["caseId"] == case["caseId"])
            self.assertTrue(key["expression"])
            self.assertEqual(key["execution"]["providerRequests"], 0)
        by_ordinal = {case["ordinal"]: case["input"] for case in reconstruction}
        self.assertEqual(by_ordinal[85]["diplomatic"], "Nhemombëú.")
        self.assertEqual(by_ordinal[86]["diplomatic"], "Acé rëõ ianondé nhándy caräîba râra.")
        for ordinal in (2, 67, 81):
            self.assertEqual(by_ordinal[ordinal]["diplomatic"], "")
            self.assertEqual(by_ordinal[ordinal]["inputKind"], "known-modern-text-reconstruction")
            self.assertFalse(by_ordinal[ordinal]["inputProvenance"]["historicTranscriptionSupplied"])


if __name__ == "__main__":
    unittest.main()
