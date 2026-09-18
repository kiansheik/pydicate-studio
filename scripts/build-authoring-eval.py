#!/usr/bin/env python3
"""Build a read-only Araújo evaluation manifest; never run a provider or change a corpus.

The two public arms contain tasks, not the target Pydicate expressions. Answers
are emitted separately for a human evaluator and must not be loaded by an agent.
"""
from __future__ import annotations

import argparse
import ast
from contextlib import redirect_stdout
import copy
import hashlib
import json
import os
from pathlib import Path
import sys
import unicodedata

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "python"))
from studio_authoring import parse_ast
SOURCE = "araujo_catecismo_1686"
DEFAULT_ORDINALS = (2, 67, 81, 83, 85, 86)
FORBIDDEN_PACKET_KEYS = {
    "raw", "expression", "sourceExpression", "evaluation", "feedback", "history",
    "conversation", "messages", "checkpoint", "canvas", "tree", "annotated",
    "dependencyContext", "lexicalReferences", "typedDispatch", "structureFingerprint",
}
CONSTRUCTORS = {
    "Adverb", "Classifier", "Conjunction", "Demonstrative", "Deverbal", "Interjection",
    "Noun", "Number", "Particle", "Postposition", "Pronoun", "ProperNoun", "SizeSuffix", "Verb",
}


def sha(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def stable(value) -> str:
    return "sha256:" + sha(json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode())


def comparison_keys(value: str) -> dict:
    # These are explicit comparisons, never editorial or structural equivalence.
    exact = unicodedata.normalize("NFC", value)
    folded = "".join(exact.casefold().split())
    accents = "".join(char for char in unicodedata.normalize("NFD", folded) if not unicodedata.combining(char))
    return {"exact": exact, "spacingCase": folded, "accentFolded": accents}


def syntax(raw: str) -> str:
    return ast.dump(parse_ast(raw), include_attributes=False)


def names(raw: str) -> set[str]:
    try:
        return {node.id for node in ast.walk(parse_ast(raw)) if isinstance(node, ast.Name)}
    except (SyntaxError, ValueError):
        return set()


def atomic(raw: str) -> bool:
    try:
        node = parse_ast(raw)
    except SyntaxError:
        return False
    if isinstance(node, (ast.Name, ast.Constant)):
        return True
    if isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
        if node.func.id in CONSTRUCTORS:
            return all(isinstance(item, ast.Constant) for item in [*node.args, *(keyword.value for keyword in node.keywords)])
        if node.func.id == "studio_define" and node.args:
            return atomic(ast.unparse(node.args[0]))
    return False


def declarations(paths: list[Path]) -> dict[str, dict]:
    result = {}
    for path in paths:
        text = path.read_text(encoding="utf-8")
        for statement in ast.parse(text).body:
            if not isinstance(statement, ast.Assign) or isinstance(statement.value, (ast.List, ast.Tuple, ast.Dict, ast.Lambda)):
                continue
            for target in statement.targets:
                if isinstance(target, ast.Name) and not target.id.startswith("_") and target.id not in {"l", SOURCE}:
                    raw = ast.get_source_segment(text, statement.value)
                    result[target.id] = {"expression": raw, "sourceId": path.name.removesuffix(".tu.py"), "line": statement.lineno}
    return result


def duplicate_answers(target: dict, rows: list[dict]) -> list[dict]:
    key = comparison_keys(target["surface"])
    result = []
    for row in rows:
        reasons = []
        if row["ordinal"] == target["ordinal"]:
            reasons.append("target")
        if syntax(row["expression"]) == syntax(target["expression"]):
            reasons.append("same-source-ast")
        if row.get("structureFingerprint") and row["structureFingerprint"] == target.get("structureFingerprint"):
            reasons.append("same-engine-structure")
        if comparison_keys(row.get("surface", ""))["spacingCase"] == key["spacingCase"]:
            reasons.append("same-surface-spacing-case")
        if reasons:
            result.append({"ordinal": row["ordinal"], "reasons": reasons})
    return result


def exclusions(target: dict, rows: list[dict], passages: dict[int, dict], index: list[dict], declared: dict) -> dict:
    duplicates = duplicate_answers(target, rows)
    passage_ids = {passages[entry["ordinal"]]["id"] for entry in duplicates}
    derived = [entry for entry in index if any(source.get("passageId") in passage_ids for source in entry.get("sources", [entry.get("source", {})]))]
    structures = {entry["_structure"] for entry in derived if not atomic(entry["expression"])}
    subtree_syntax = {syntax(entry["expression"]) for entry in derived if not atomic(entry["expression"])}
    answer_key = comparison_keys(target["surface"])["spacingCase"]
    aliases = {entry["name"] for entry in index if entry.get("name") and (entry.get("_structure") in structures or comparison_keys(entry.get("surface", ""))["spacingCase"] == answer_key)}
    aliases.update(name for name, entry in declared.items() if syntax(entry["expression"]) in subtree_syntax)
    # Include aliases of aliases and larger compounds using a hidden construction.
    changed = True
    while changed:
        before = set(aliases)
        aliases.update(name for name, entry in declared.items() if names(entry["expression"]) & aliases)
        changed = aliases != before
    ids = {entry["id"] for entry in derived}
    ids.update(entry["id"] for entry in index if entry.get("_structure") in structures or entry.get("name") in aliases or names(entry["expression"]) & aliases)
    return {
        "excludePassageIds": sorted(passage_ids),
        "excludeConstructionIds": sorted(ids),
        "excludeLexicalNames": sorted(aliases),
        "duplicateAnswers": duplicates,
    }


def ensure_answer_free(value, at="$", forbidden=FORBIDDEN_PACKET_KEYS):
    if isinstance(value, dict):
        for key, item in value.items():
            if key in forbidden:
                raise ValueError(f"Answer-bearing field escaped into agent input: {at}.{key}")
            ensure_answer_free(item, f"{at}.{key}", forbidden)
    elif isinstance(value, list):
        for i, item in enumerate(value):
            ensure_answer_free(item, f"{at}[{i}]", forbidden)


def make_case(target, rows, passages, index, declared, provenance, mode):
    passage = passages[target["ordinal"]]
    metadata = target.get("metadata") or {}
    diplomatic = metadata.get("diplomatic") or ""
    input_kind = "historic-transcription-directive" if diplomatic else "known-modern-text-reconstruction"
    restriction = exclusions(target, rows, passages, index, declared)
    packet = {
        "version": 1,
        "id": f"eval:{mode}:araujo:{target['ordinal']:04d}",
        "projectId": provenance["projectId"],
        "sourceId": SOURCE,
        "passageId": passage["id"],
        "baseRevisionId": f"eval:{mode}:{target['ordinal']}:frozen",
        "sourceFingerprint": passage["sourceFingerprint"],
        "engineFingerprint": provenance["engineFingerprint"],
        "inputKind": input_kind,
        "inputProvenance": {
            "historicTranscriptionSupplied": bool(diplomatic),
            "source": "@diplomatic source directive" if diplomatic else "current engine surface from audited source; NOT a historic transcription",
            "independentWitnessCheck": "not-performed",
        },
        "diplomatic": diplomatic,
        "tentativeReading": "" if diplomatic else target["surface"],
        "reviewedTarget": metadata.get("normalized_target"),
        "targetProvenance": "source @target directive; independent editorial approval not certified" if metadata.get("normalized_target") else "none",
        "meaning": "",
        "constraints": "Use registered local evidence. Expose unsupported roles, senses, alignments and engine limitations. No opaque literal shortcut for unexplained text.",
        "notes": "",
        "locators": copy.deepcopy(metadata.get("locations") or []),
        "evidence": {"revision": 0, "regions": [], "images": [], "imagesSelected": False},
        "context": [],
        "manifest": {
            "version": 1, "mode": mode,
            "allowedSourceIds": [SOURCE, "lexicon"],
            "dictionary": provenance["dictionary"],
            "excludePassageIds": restriction["excludePassageIds"] if mode == "reconstruction" else [],
            "excludeConstructionIds": restriction["excludeConstructionIds"] if mode == "reconstruction" else [],
            "excludeLexicalNames": restriction["excludeLexicalNames"] if mode == "reconstruction" else [],
            "maxContextPassages": 0, "maxSearchPage": 40,
            "contextPolicy": "No human-reviewed preceding context certified in these legacy records. None supplied. Saved legacy references are not silently promoted to reviewed context.",
            "referencePolicy": "Araújo and its shared lexicon only. Existing corpus constructions are preserved source analyses, not independently certified linguistic facts; cite their provenance. No Bettendorf, web, unrelated files or prior agent hypotheses.",
        },
        "task": "analyze", "scope": "passage", "includeImages": False,
        "description": "Reconstruct a supported analysis from the supplied text without the held-out Pydicate answer." if mode == "reconstruction" else "Find and reuse existing structures for this text; verify the destination namespace and explain lexical/structural evidence.",
        "budgets": {"maxSteps": 32, "maxRounds": 33, "maxOutputTokens": 4096, "timeoutMs": 300000},
    }
    ensure_answer_free(packet)
    packet["digest"] = stable(packet)
    answer = {
        "caseId": packet["id"], "ordinal": target["ordinal"],
        "warning": "Evaluator-only baseline, never agent input. Current source is a comparison answer, not a certificate of linguistic correctness.",
        "passageId": passage["id"], "identityKind": "explicit-source-note" if passage["id"].startswith("passage:") else "deterministic-provisional-source-identity; resolve ordinal and fingerprint in another profile",
        "expression": target["expression"], "surface": target["surface"],
        "annotated": target.get("annotated"), "structureFingerprint": target.get("structureFingerprint"),
        "comparisonKeys": comparison_keys(target["surface"]),
        "sourceStatus": metadata.get("status"), "savedReference": passage.get("acceptedReference"),
        "referenceProvenance": passage.get("referenceProvenance"),
        "leakageControls": restriction,
        "lexicalDefinitions": {name: declared[name] for name in target.get("lexicalReferences", []) if name in declared},
        "execution": {"status": "not-run", "providerRequests": 0, "linguisticUsefulness": "unmeasured"},
    }
    return {"caseId": packet["id"], "ordinal": target["ordinal"], "input": packet}, answer


def build(parent: Path, coverage: Path, output: Path, ordinals=DEFAULT_ORDINALS):
    from adapter import ProjectAdapter, repository_snapshot, CORPUS_ROOTS, ENGINE_ROOTS
    from authoring_runtime import configure, namespace_for
    from rendered_structures import VERSION as index_version, build as build_index
    corpus, engine = parent / "oldtupicorpus", parent / "nhe-enga"
    source = corpus / "historic" / f"{SOURCE}.tu.py"
    lexicon = corpus / "historic/lexicon.tu.py"
    records = corpus / f"ground_truth/records/historic/{SOURCE}.jsonl"
    dictionary = engine / "docs/dict-conjugated.json.gz"
    paths = {"source": source, "sharedLexicon": lexicon, "savedReferences": records, "navarroWebsiteDataset": dictionary}
    before = {key: sha(path.read_bytes()) for key, path in paths.items()}
    report = json.loads(coverage.read_text())
    if report["sourceSha256"] != before["source"]:
        raise ValueError("Coverage source hash is stale. Re-run npm run audit:araujo before building this set.")
    snapshots = [repository_snapshot(corpus, CORPUS_ROOTS), repository_snapshot(engine, ENGINE_ROOTS)]
    signatures = lambda values: [(item["name"], item["revision"], item["fingerprint"]) for item in values]
    if signatures(snapshots) != signatures(report["repositories"]):
        raise ValueError("Coverage dependency snapshots are stale. Re-run the audit against the selected dependencies.")
    adapter = ProjectAdapter()  # No identity sidecar or project mutation.
    with redirect_stdout(sys.stderr):
        project = adapter.open_project(str(parent))
        configure(parent)
    passages = {p["ordinal"]: p for p in project["passages"] if p["sourceId"] == SOURCE}
    rows = report["rows"]
    if len(passages) != report["count"] or len(rows) != len(passages):
        raise ValueError("Coverage/cardinality mismatch.")
    if any(n not in passages for n in ordinals):
        raise ValueError("Requested evaluation ordinal is not in the current source.")
    declared = declarations([lexicon, source])
    # Reuse the existing index implementation on only Araújo and its lexicon.
    # Draft-mode collection produces the same syntax/structure/surface IDs and
    # avoids importing or indexing unrelated historic sources such as Bettendorf.
    drafts = [{"sourceId": SOURCE, "passageId": p["id"], "ordinal": n, "line": p["sourceLine"], "raw": p["sourceExpression"]} for n, p in passages.items()]
    with redirect_stdout(sys.stderr):
        namespace = namespace_for(corpus, source, 10**9)
    for name, declaration in declared.items():
        if not callable(getattr(namespace.get(name), "eval", None)):
            continue
        for suffix, raw in [("name", name), ("definition", declaration["expression"])]:
            drafts.append({"sourceId": SOURCE, "passageId": f"eval-lexical:{name}:{suffix}", "line": 10**9, "raw": raw})
    with redirect_stdout(sys.stderr):
        indexed = build_index({"includeSources": False, "drafts": drafts}, corpus)
    index = indexed["entries"]
    provenance = {
        "version": 1, "projectId": project["id"], "engineFingerprint": project["engineFingerprint"],
        "auditCount": report["count"], "auditGeneratedAt": report["generatedAt"], "coverageSha256": sha(coverage.read_bytes()),
        "corpusHashes": before,
        "repositories": [{k: v for k, v in entry.items() if k != "path"} for entry in snapshots],
        "dictionary": {"dataset": "navarro-website", "fingerprint": "sha256:" + before["navarroWebsiteDataset"], "identity": "compressed website row index + exact dataset hash; not SQLite vid"},
        "index": {"entries": len(index), "algorithm": f"rendered_structures.build VERSION{index_version}, Araújo+lexicon-only candidate collection", "fingerprint": stable(sorted((entry["id"], entry["_structure"]) for entry in index)), "diagnostics": indexed["diagnostics"]},
        "providerExecution": "not-run; zero generation requests", "selectedOrdinals": list(ordinals),
    }
    arms = {"reconstruction": [], "assisted": []}; answers = []
    for mode in arms:
        for ordinal in ordinals:
            row = next(row for row in rows if row["ordinal"] == ordinal)
            case, answer = make_case(row, rows, passages, index, declared, provenance, mode)
            arms[mode].append(case); answers.append(answer)
    after = {key: sha(path.read_bytes()) for key, path in paths.items()}
    snapshots_after = [repository_snapshot(corpus, CORPUS_ROOTS), repository_snapshot(engine, ENGINE_ROOTS)]
    if after != before or signatures(snapshots_after) != signatures(snapshots):
        raise ValueError("Source or dependency changed during generation; do not use these evaluation artifacts.")
    provenance["readOnlyVerification"] = {"before": before, "after": after, "unchanged": True}
    output.mkdir(parents=True, exist_ok=True)
    for mode, cases in arms.items():
        (output / f"{mode}.jsonl").write_text("".join(json.dumps(case, ensure_ascii=False, sort_keys=True) + "\n" for case in cases), encoding="utf-8")
    evaluator = output / "evaluator-only"
    evaluator.mkdir(exist_ok=True)
    (evaluator / "answers.json").write_text(json.dumps({"warning": "WITHHELD ANSWER KEY: evaluator only; never register as agent context or MCP evidence.", "cases": answers}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (output / "provenance.json").write_text(json.dumps(provenance, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    result = {"schemaVersion": 1, "runs": [{"caseId": answer["caseId"], "status": "not-run", "inputDigest": next(case["input"]["digest"] for cases in arms.values() for case in cases if case["caseId"] == answer["caseId"]), "provider": None, "model": None, "attemptIds": [], "evidenceQuality": [], "structuralSupport": [], "morphemeCoverage": {"supported": [], "unresolved": []}, "surfaceComparisons": {"exact": None, "spacingCase": None, "accentFolded": None}, "residualMismatches": [], "humanCorrections": [], "toolFailures": [], "resourceUse": {"providerRequests": 0, "inputTokens": None, "outputTokens": None, "toolCalls": 0, "elapsedMs": None}, "editorialApproval": None} for answer in answers]}
    (output / "results-template.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"sourceCount": len(rows), "reconstructionCases": len(arms["reconstruction"]), "assistedCases": len(arms["assisted"]), "indexEntries": len(index), "hashesUnchanged": True, "providerRequests": 0, "output": str(output)}, ensure_ascii=False))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--parent", type=Path, default=Path(os.environ.get("PYDICATE_PROJECT_PARENT", ROOT.parent)))
    parser.add_argument("--coverage", type=Path, default=ROOT / "docs/coverage/araujo.json")
    parser.add_argument("--output", type=Path, default=ROOT / "docs/evaluation/araujo-authoring-v1")
    parser.add_argument("--ordinals", type=int, nargs="+", default=list(DEFAULT_ORDINALS))
    args = parser.parse_args()
    build(args.parent.resolve(), args.coverage.resolve(), args.output.resolve(), tuple(args.ordinals))
