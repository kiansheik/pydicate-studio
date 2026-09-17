from __future__ import annotations

import itertools
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from adapter import (AdapterError, CORPUS_ROOTS, ProjectAdapter, expression_for,
                     parse_analysis, repository_snapshot, source_expressions, validate_analysis)
from worker import dispatch


ANALYSIS = {"kind": "imperative", "predicate": "apiti", "subject": "nde", "object": "moro",
            "hiddenSubject": True, "mood": "imperative", "negated": True}


class AdapterTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.corpus = self.root / "oldtupicorpus"
        self.engine = self.root / "nhe-enga"
        for directory in (self.corpus / "historic", self.corpus / "ground_truth/records/historic",
                          self.engine / "pydicate/pydicate", self.engine / "tupi/tupi"):
            directory.mkdir(parents=True)
        self.source = self.corpus / "historic/example.tu.py"
        self.source.write_text("l = []\nl += -(+nde * apiti * moro).imp()\nl += mysterious(foo, variant=7)\n", encoding="utf-8")
        self.records = self.corpus / "ground_truth/records/historic/example.jsonl"
        self.records.write_text(json.dumps({"ordinal": 1, "surface": "saved reference", "status": "approved"}) + "\n", encoding="utf-8")
        (self.engine / "pydicate/pydicate/__init__.py").write_text("# test fixture\n", encoding="utf-8")
        for repo in (self.corpus, self.engine):
            self.git(repo, "init", "--quiet")
            self.git(repo, "add", ".")
            self.git(repo, "-c", "user.name=Studio Test", "-c", "user.email=studio@example.invalid", "commit", "--quiet", "-m", "fixture")

    def git(self, repo, *args):
        return subprocess.run(["git", "-C", str(repo), *args], capture_output=True, text=True, check=True).stdout

    def adapter(self):
        return ProjectAdapter(self.root / "studio-state")

    def test_open_preserves_source_and_unknown_expressions_without_execution(self):
        marker = self.root / "must-not-exist"
        original = f"from pathlib import Path\nPath({str(marker)!r}).touch()\nl = []\nl += -(+nde * apiti * moro).imp()\nl += mysterious(foo, variant=7)\n"
        self.source.write_text(original, encoding="utf-8")
        before_records = self.records.read_bytes()
        project = self.adapter().open_project(str(self.root))
        self.assertFalse(marker.exists())
        self.assertEqual(self.source.read_text(encoding="utf-8"), original)
        self.assertEqual(self.records.read_bytes(), before_records)
        first, unknown = project["passages"]
        self.assertEqual(first["acceptedReference"], "saved reference")
        self.assertEqual(first["referenceProvenance"], "legacy")
        self.assertEqual(first["status"], "analysis")  # Never manufacture approval.
        self.assertIsNone(unknown["acceptedReference"])
        self.assertIsNone(unknown["analysis"])
        self.assertEqual(unknown["sourceExpression"], "mysterious(foo, variant=7)")
        self.assertTrue(any("sem referência salva" in message for message in project["diagnostics"]))

    def test_expression_source_preserves_parentheses_unicode_and_internal_comments(self):
        expression = "(\n    -(+nde * apiti * moro).imp()  # observação\n)"
        self.source.write_text("l = [((foo)), (bar('î'))]\nl += " + expression + "\nl += [((a)), b(c, d)]\n", encoding="utf-8")
        expressions = [entry["expression"] for entry in source_expressions(self.source)]
        self.assertEqual(expressions, ["((foo))", "(bar('î'))", expression, "((a))", "b(c, d)"])

    def test_initial_comments_and_multiline_list_are_preserved(self):
        self.source.write_text("l = [\n # @note keep this\n ((foo)),\n bar, # trailing comment\n]\n", encoding="utf-8")
        entries = source_expressions(self.source)
        self.assertEqual(len(entries), 2)
        self.assertIn("# @note keep this", entries[0]["expression"])

    def test_one_broken_source_does_not_block_other_sources(self):
        (self.corpus / "historic/broken.tu.py").write_text("l = [\n", encoding="utf-8")
        project = self.adapter().open_project(str(self.root))
        self.assertEqual(len(project["passages"]), 2)
        self.assertTrue(any("broken.tu.py" in diagnostic for diagnostic in project["diagnostics"]))

    def test_contextual_lexical_override_keeps_expression_read_only(self):
        self.source.write_text("apiti.definition = 'changed sense'\nl = []\nl += -(+nde * apiti * moro).imp()\n", encoding="utf-8")
        passage = self.adapter().open_project(str(self.root))["passages"][0]
        self.assertEqual(passage["sourceExpression"], "-(+nde * apiti * moro).imp()")
        self.assertIsNone(passage["analysis"])

    def test_empty_or_unreadable_project_preserves_active_project_and_registry(self):
        adapter = self.adapter()
        original = adapter.open_project(str(self.root))
        registry = next((self.root / "studio-state").glob("*.ids.json"))
        original_registry = registry.read_bytes()
        for source in ("l = []\n", "l = [\n"):
            with self.subTest(source=source):
                self.source.write_text(source, encoding="utf-8")
                with self.assertRaises(AdapterError) as caught:
                    adapter.refresh_project()
                self.assertEqual(caught.exception.code, "NO_PASSAGES")
                self.assertIs(adapter.project, original)
                self.assertEqual(registry.read_bytes(), original_registry)

    def test_uuid_survives_restart_and_insertion_without_ordinal_identity(self):
        adapter = self.adapter()
        first = adapter.open_project(str(self.root))["passages"][0]
        self.assertTrue(first["id"].startswith("passage:"))
        self.source.write_text("l = [new_unknown]\nl += -(+nde * apiti * moro).imp()\nl += mysterious(foo, variant=7)\n", encoding="utf-8")
        current = self.adapter().open_project(str(self.root))["passages"][1]
        self.assertEqual(first["id"], current["id"])
        self.assertNotEqual(first["legacyId"], current["legacyId"])
        self.assertEqual(first["sourceFingerprint"], current["sourceFingerprint"])

    def test_external_rewrite_retains_old_registry_instead_of_reassigning_draft(self):
        adapter = self.adapter()
        before = adapter.open_project(str(self.root))["passages"][0]
        self.source.write_text("l = []\nl += (+nde * apiti * moro).imp()\n", encoding="utf-8")
        after = adapter.refresh_project()["passages"][0]
        self.assertNotEqual(before["id"], after["id"])
        registry = json.loads(next((self.root / "studio-state").glob("*.ids.json")).read_text())
        self.assertIn(before["id"], registry["ids"].values())

    def test_duplicate_identity_does_not_follow_an_ordinal_across_source_changes(self):
        self.source.write_text("l = [same, same]\n", encoding="utf-8")
        adapter = self.adapter()
        before = adapter.open_project(str(self.root))["passages"]
        self.assertNotEqual(before[0]["id"], before[1]["id"])
        self.source.write_text("l = [new, same, same]\n", encoding="utf-8")
        after = adapter.refresh_project()["passages"]
        self.assertTrue(set(p["id"] for p in before).isdisjoint(p["id"] for p in after))

    def test_dirty_and_untracked_relevant_content_changes_fingerprint(self):
        before = repository_snapshot(self.corpus, CORPUS_ROOTS)
        self.source.write_text(self.source.read_text() + "# external edit\n", encoding="utf-8")
        edited = repository_snapshot(self.corpus, CORPUS_ROOTS)
        self.assertNotEqual(before["fingerprint"], edited["fingerprint"])
        self.assertTrue(edited["dirty"])
        (self.corpus / "historic/new.tu.py").write_text("l = []\n", encoding="utf-8")
        untracked = repository_snapshot(self.corpus, CORPUS_ROOTS)
        self.assertNotEqual(edited["fingerprint"], untracked["fingerprint"])

    def test_stale_fingerprint_rejected_before_engine_execution(self):
        adapter = self.adapter()
        project = adapter.open_project(str(self.root))
        (self.engine / "pydicate/pydicate/__init__.py").write_text("# engine changed\n", encoding="utf-8")
        with self.assertRaises(AdapterError) as caught:
            adapter.render({"revisionId": "draft-1", "engineFingerprint": project["engineFingerprint"], "analysis": ANALYSIS})
        self.assertEqual(caught.exception.code, "STALE_ENGINE")

    def test_state_cannot_write_inside_source_repository(self):
        with self.assertRaises(AdapterError) as caught:
            ProjectAdapter(self.corpus / "state").open_project(str(self.root))
        self.assertEqual(caught.exception.code, "STATE_ERROR")

    def test_strict_analysis_validation_and_unsupported_syntax(self):
        for value in ({**ANALYSIS, "hiddenSubject": 1}, {**ANALYSIS, "negated": "false"},
                      {**ANALYSIS, "predicate": "arbitrary"}, {**ANALYSIS, "expression": "run()"},
                      {**ANALYSIS, "mood": "subjunctive"}, [], None):
            with self.subTest(value=value), self.assertRaises(AdapterError):
                validate_analysis(value)
        for expression in ("arbitrary()", "-(+nde * apiti * moro).imp(arg)", "(+nde * apiti * moro).other()", "nde * (apiti * moro)"):
            self.assertIsNone(parse_analysis(expression))

    def test_eight_supported_expressions_round_trip_analysis_and_scope(self):
        for hidden, mood, negated in itertools.product([False, True], ["imperative", "indicative"], [False, True]):
            analysis = {**ANALYSIS, "hiddenSubject": hidden, "mood": mood, "negated": negated}
            with self.subTest(analysis=analysis):
                self.assertEqual(parse_analysis(expression_for(analysis)), analysis)
        self.assertEqual(expression_for(ANALYSIS), "-(+nde * apiti * moro).imp()")

    def test_worker_rejects_extra_parameters_and_unknown_methods(self):
        for request in ({"id": 1, "method": "exec", "params": {}},
                        {"id": 1, "method": "refresh_project", "params": {"source": "unexpected"}},
                        {"id": 1, "method": "open_project", "params": {"parentPath": str(self.root)}, "extra": 1}):
            with self.assertRaises(AdapterError):
                dispatch(self.adapter(), request)

    def test_worker_jsonl_recovers_after_invalid_message(self):
        worker = Path(__file__).resolve().parents[1] / "worker.py"
        messages = "not json\n" + json.dumps({"id": 2, "method": "open_project", "params": {"parentPath": str(self.root)}}) + "\n"
        result = subprocess.run([sys.executable, "-B", str(worker)], input=messages, text=True, capture_output=True, check=True)
        responses = [json.loads(line) for line in result.stdout.splitlines()]
        self.assertIn("error", responses[0])
        self.assertEqual(responses[1]["id"], 2)
        self.assertEqual(len(responses[1]["result"]["passages"]), 2)


if __name__ == "__main__":
    unittest.main()
