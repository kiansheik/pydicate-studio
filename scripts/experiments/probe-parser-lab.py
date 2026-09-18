#!/usr/bin/env python3
"""Bounded research probe; not the production parser or a historical benchmark.

Use disposable dependencies prepared with docs/design/dependencies.md. This
script reads them, reuses Studio's interpreter, and writes only --output.
No model, provider, source publication, or ground-truth approval is involved.
"""
from __future__ import annotations

import argparse
import ast
from collections import Counter, defaultdict
import hashlib
import json
from pathlib import Path
import random
import sqlite3
import sys
import time
import unicodedata

sys.dont_write_bytecode = True
STUDIO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(STUDIO / "python"))

from authoring_runtime import configure, namespace_for, interpret, evaluation_snapshot, realize
from rendered_structures import isolated_namespace, normalize
from studio_authoring import parse_ast, expression_tree


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--parent", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    parent = args.parent.resolve()
    corpus = configure(parent)
    namespace = namespace_for(corpus, corpus / "historic/araujo_catecismo_1686.tu.py", 10**9)

    def evaluate(raw, annotated=False):
        syntax = parse_ast(raw)
        value = interpret(syntax, isolated_namespace(namespace, syntax), {})
        return str(evaluation_snapshot(value).eval(annotated=annotated))

    def key(text):
        # Existing Studio comparator, not a new linguistic normalization engine.
        return normalize(text, relaxed=True)

    people = ["ixé", "nde", "ae", "oré", "îandé"]
    verbs = ["só", "ur", "ikó", "kanhem", "ikobé"]
    nouns = ["oka", "taba", "kaa", "era", "îara", "apé"]
    postpositions = ["pe", "pupé", "suí", "esé"]
    fragments = []
    skipped = []

    def add(kind, raw):
        try:
            surface = evaluate(raw)
            if key(surface):
                fragments.append({"kind": kind, "raw": raw, "surface": surface, "key": key(surface)})
        except Exception as error:
            skipped.append({"raw": raw, "error": f"{type(error).__name__}: {error}"})

    started = time.perf_counter()
    for person in people:
        for verb in verbs:
            add("verb_clause", f"(+{person} * {verb})")
    for person in people:
        for noun in nouns:
            for postposition in postpositions:
                add("postpositional_phrase", f"({postposition} * ({person} * {noun}))")
    build_seconds = time.perf_counter() - started

    indexes = {kind: defaultdict(list) for kind in ("verb_clause", "postpositional_phrase")}
    for fragment in fragments:
        indexes[fragment["kind"]][fragment["key"]].append(fragment)

    def parse(text):
        observed = key(text)
        candidates = []
        # Deliberately tiny grammar: a dropped-subject verb clause followed by a
        # possessive PP. No complete sentence is stored or looked up here.
        for split in range(1, len(observed)):
            for clause in indexes["verb_clause"].get(observed[:split], []):
                for phrase in indexes["postpositional_phrase"].get(observed[split:], []):
                    raw = f"{clause['raw']} + {phrase['raw']}"
                    surface = evaluate(raw)
                    if key(surface) == observed:
                        candidates.append({"raw": raw, "surface": surface, "split": split})
        return sorted(candidates, key=lambda row: (len(row["raw"]), row["raw"]))

    original = "Asó xe rokype"
    input_variants = [original, "ASOXEROKYPE", "a so xé ró kŷ pe", unicodedata.normalize("NFD", original)]
    normalization = [{"input": value, "key": key(value)} for value in input_variants]
    assert len({row["key"] for row in normalization}) == 1
    probes = []
    for value in input_variants + ["ereso nde rokype", "zzzz", "Açó xe rokîpe"]:
        started = time.perf_counter()
        candidates = parse(value)
        probes.append({"input": value, "key": key(value), "candidate_count": len(candidates),
                       "candidates": candidates[:5], "seconds": time.perf_counter()-started})
    assert all(row["candidate_count"] for row in probes[:4])
    assert probes[-2]["candidate_count"] == 0

    clauses = [row for row in fragments if row["kind"] == "verb_clause"]
    phrases = [row for row in fragments if row["kind"] == "postpositional_phrase"]
    pairs = [(left, right) for left in clauses for right in phrases]
    sample = random.Random(20260918).sample(pairs, 60)
    sample_report = []
    for left, right in sample:
        raw = f"{left['raw']} + {right['raw']}"
        surface = evaluate(raw)
        started = time.perf_counter()
        candidates = parse(surface)
        sample_report.append({"raw": raw, "surface": surface, "candidate_count": len(candidates),
            "source_expression_recovered": raw in {row['raw'] for row in candidates},
            "seconds": time.perf_counter()-started})

    example = parse(original)[0]
    syntax = parse_ast(example["raw"])
    result = realize(example["raw"], isolated_namespace(namespace, syntax))
    tree = expression_tree(example["raw"])
    def nodes(root):
        yield root
        for child in root["children"]:
            yield from nodes(child["node"])
    node_count = len(list(nodes(tree["root"])))
    assert tree["capabilities"]["edit"] and result["evaluationStatus"] == "complete"
    assert result["surface"] == "asó xe rokype"

    # Reuse the actual tree-edit transaction primitive, then parse/render again.
    # A UI gesture is NOT claimed here: the agent must verify that in Electron.
    from studio_authoring import replace_node
    possessive = next(node for node in nodes(tree["root"]) if node["code"] == "ixé * oka")
    edited = replace_node(example["raw"], possessive, "nde * oka")
    assert evaluate(edited) == "asó nde rokype"
    from pydicate.predicate import parse_annotated_morphs
    morphs = [{"surface": item.surface, "tags": item.tags} for item in parse_annotated_morphs(result["annotated"])]

    from pydicate.compiler import decompile, parse_annotated
    inverse = decompile(parse_annotated(result["annotated"]), emit="pydicate", lexicon_modules=["historic.lexicon"],
                        rerank_top_k=32, rerank_fn=lambda code: evaluate(code, annotated=True))
    inverse_surface = evaluate(inverse.code)

    collision_examples = []
    for kind, index in indexes.items():
        for folded, rows in index.items():
            if len(rows) > 1:
                collision_examples.append({"kind": kind, "key": folded, "candidates": rows})

    # Real headwords demonstrate information lost by the requested accent fold.
    # These are dictionary collisions, not claims that the tiny parser supports
    # either lexical family. Keep stable dictionary identities in the evidence.
    dictionary_path = parent / "nhe-enga/pydicate/pydicate/tupi_only.db"
    connection = sqlite3.connect(dictionary_path.as_uri() + "?mode=ro", uri=True)
    try:
        lexical_rows = connection.execute(
            "SELECT DISTINCT vid, first_word FROM tupi_only WHERE vid IN (2452,2453,2454,2456)"
        ).fetchall()
    finally:
        connection.close()
    lexical_groups = defaultdict(list)
    for vid, headword in lexical_rows:
        lexical_groups[key(headword)].append({"vid": vid, "headword": headword})
    lexical_collisions = [{"key": folded, "entries": rows}
                          for folded, rows in sorted(lexical_groups.items()) if len(rows) > 1]
    assert {row["key"] for row in lexical_collisions} == {"agua", "aguai"}

    hashes = {}
    for relative in ["python/studio_authoring.py", "python/authoring_runtime.py", "python/rendered_structures.py",
                     "docs/design/dependency-patches/nhe-enga.patch", "docs/design/dependency-patches/oldtupicorpus.patch"]:
        hashes[relative] = hashlib.sha256((STUDIO/relative).read_bytes()).hexdigest()
    report = {
        "schema_version": 1,
        "description": "Bounded synthetic compositional probe, not historical parser accuracy",
        "python": sys.version.split()[0],
        "studio_base": "8d21298c41ac5e5a66877b64ed96e02f00d31e56",
        "dependencies": {"nhe-enga": "348686045bf0791c847be3cba1b15eaae7312a11 + Studio documented patch",
                         "oldtupicorpus": "292a28722a1790abf3f3b93083c29fbd47b4ffd0 + Studio documented patch"},
        "source_hashes": hashes,
        "grammar": {"people": people, "verbs": verbs, "nouns": nouns, "postpositions": postpositions,
                    "root_rule": "verb_clause + postpositional_phrase", "indexed_full_sentences": 0},
        "fragment_count": len(fragments), "by_kind": dict(Counter(row['kind'] for row in fragments)),
        "fragment_build_seconds": build_seconds, "skipped": skipped,
        "normalization": normalization, "probes": probes,
        "synthetic_composition": {"combinations":len(pairs), "sample_size":len(sample_report),
            "original_expression_in_candidates":sum(row['source_expression_recovered'] for row in sample_report),
            "mean_candidate_count":sum(row['candidate_count'] for row in sample_report)/len(sample_report),
            "mean_parse_seconds":sum(row['seconds'] for row in sample_report)/len(sample_report),
            "cases":sample_report},
        "normalization_collision_groups":len(collision_examples), "collision_examples":collision_examples[:3],
        "dictionary_normalization_collisions": lexical_collisions,
        "example": {"raw":example['raw'],"surface":result['surface'],"annotated":result['annotated'],
            "source_tree_nodes":node_count,"editable":tree['capabilities']['edit'],"morphemes":morphs,
            "tree_span_edit": {"replacement":"nde * oka","raw":edited,"surface":evaluate(edited)}},
        "existing_decompiler_gold_annotation_probe":{"raw":inverse.code,"surface":inverse_surface,
            "matches":inverse_surface == result['surface']},
        "limits":["One manually declared composition family; five pronouns, five verbs, six nouns, four postpositions.",
            "Sampled full sentences were absent from the reverse index but their fragments and composition rule were available.",
            "Recovering a generating expression in a candidate set does not establish correct top-1 analysis.",
            "No trained neural model, historical/OCR benchmark, paid inference, or native UI interaction was run.",
            "Studio typed parse, bounded interpretation, evaluation, morphology extraction and source span edit were exercised."]
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2)+"\n", encoding="utf-8")
    print(json.dumps({"fragments":len(fragments),"sample":len(sample_report),
        "source_recovered":report['synthetic_composition']['original_expression_in_candidates'],
        "example":report['example'],"decompiler":report['existing_decompiler_gold_annotation_probe'],
        "collision_groups":len(collision_examples),"output":str(args.output)},ensure_ascii=False))


if __name__ == "__main__":
    main()
