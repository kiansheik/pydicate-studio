#!/usr/bin/env python3
"""Read-only Pydicate source-graph export and bounded structural-search probe.

The native matcher is a research baseline for the explicit query subset below,
not a Grew implementation. --grew requires grewpy and grewpy_backend and checks
all returned node bindings against that baseline. Nothing executes corpus code.
"""
from __future__ import annotations

import argparse
from collections import Counter
import hashlib
import importlib.util
import json
from pathlib import Path
import platform
import shutil
import statistics
import subprocess
import sys
import time

sys.dont_write_bytecode = True
STUDIO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(STUDIO / "python"))
from studio_authoring import expression_tree, source_entries


FIXTURES = {
    "aso": "(+ixé * só) + (pe * (ixé * oka))",
    "other_possessor": "(+ixé * só) + (pe * (nde * oka))",
    "imperative": "(nde * só).imp()",
    "negative_inside": "(-(nde * só)).imp()",
    "negative_outside": "-((nde * só).imp())",
    "nested": "ixé * (nde * oka)",
    "permissive": "(nde * só).perm()",
    "two_permissives": "(nde * só).perm() + (nde * só).perm()",
    "variant": "(ixé * oka).var(1).base_nominal()",
    "reversed": "oka * ixé",
    "same_reference": "ixé * ixé",
    "keyword_unicode": 'Noun("ok", definition="house 🏠")',
    "unsupported": "foo[0]",
    "opaque_alias": "possessed_house",
}


def query(name, description, nodes, edges=(), paths=(), equal=(), without=(), meta=None, expected=None):
    return dict(id=name, description=description, nodes=nodes, edges=list(edges),
                paths=list(paths), equal=list(equal), without=list(without),
                meta=meta or {}, expected_fixture_counts=expected or {})


QUERIES = [
    query("permissive", "Occurrences of the explicit .perm() operation",
          {"M": {"kind": "method", "method": "perm"}},
          expected={"permissive": 1, "two_permissives": 2}),
    query("nested_right_multiplication", "A * operation whose right child is another * operation",
          {"P": {"kind": "binary", "op": "*"}, "Q": {"kind": "binary", "op": "*"}},
          edges=[("P", "right", "Q")], expected={"aso": 1, "other_possessor": 1, "nested": 1}),
    query("ixe_oka_direct", "Explicit ixé * oka, with argument positions preserved",
          {"P": {"kind": "binary", "op": "*"}, "X": {"kind": "reference", "lex": "ixé"},
           "N": {"kind": "reference", "lex": "oka"}},
          edges=[("P", "left", "X"), ("P", "right", "N")], expected={"aso": 1, "variant": 1}),
    query("negative_inside_imperative", "Unary - occurs below .imp() in the source tree",
          {"M": {"kind": "method", "method": "imp"}, "N": {"kind": "unary", "op": "-"}},
          paths=[("M", "N")], expected={"negative_inside": 1}),
    query("negative_outside_imperative", "Unary - contains .imp() in the source tree",
          {"M": {"kind": "method", "method": "imp"}, "N": {"kind": "unary", "op": "-"}},
          paths=[("N", "M")], expected={"negative_outside": 1}),
    query("imperative_without_inner_negative", "An explicit .imp() with no unary - descendant",
          {"M": {"kind": "method", "method": "imp"}},
          without=[{"nodes": {"N": {"kind": "unary", "op": "-"}}, "paths": [("M", "N")]}],
          expected={"imperative": 1, "negative_outside": 1}),
    query("repeated_lexical_reference", "Two distinct reference occurrences with the same lexical name (ordered bindings)",
          {"X": {"kind": "reference"}, "Y": {"kind": "reference"}}, equal=[("X", "lex", "Y", "lex")],
          expected={"aso": 2, "same_reference": 2, "two_permissives": 4}),
    query("variant_then_nominal", "A .base_nominal() directly applied to .var(1)",
          {"B": {"kind": "method", "method": "base_nominal"},
           "V": {"kind": "method", "method": "var"}, "L": {"kind": "literal", "literal": "1"}},
          edges=[("B", "receiver", "V"), ("V", "arg0", "L")], expected={"variant": 1}),
    query("keyword_argument", "A named constructor argument, including non-BMP source text",
          {"C": {"kind": "call", "method": "Noun"}, "L": {"kind": "literal"}},
          edges=[("C", "kw:definition", "L")], expected={"keyword_unicode": 1}),
    query("araujo_permissive", "Restrict the permissive search to the Araújo source",
          {"M": {"kind": "method", "method": "perm"}}, meta={"source": "araujo_catecismo_1686"}),
    query("unsupported_source", "Find source preserved as opaque by the current Studio adapter",
          {"U": {"kind": "unsupported"}}, expected={"unsupported": 1}),
]


def digest(data):
    return hashlib.sha256(data).hexdigest()


def json_text(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True)


def to_graph(raw, meta):
    revision = digest(raw.encode())
    tree = expression_tree(raw, revision)
    if tree["root"] is None:
        raise ValueError(f"Cannot parse {meta}: {tree['diagnostics']}")
    graph = {"meta": {**meta, "expression_sha256": revision, "raw": raw,
                       "view": "pydicate-source-v1"}, "nodes": {}, "edges": [], "order": []}

    def visit(node):
        nid = f"n{len(graph['nodes'])}"
        features = {"kind": node["kind"], "source_id": node["id"], "code": node["code"],
                    "start": str(node["start"]), "end": str(node["end"])}
        for original, exported in [("operator", "op"), ("method", "method"), ("lexicalReference", "lex")]:
            if original in node:
                features[exported] = node[original]
        if "value" in node:
            features["literal"] = json_text(node["value"])
        graph["nodes"][nid] = features
        # Verify the actual Studio UTF-16 source address, including emoji fixtures.
        fragment = raw.encode("utf-16-le")[2*node["start"]:2*node["end"]].decode("utf-16-le")
        assert fragment == node["code"]
        for child in node["children"]:
            target = visit(child["node"])
            # Explicit edge features avoid UD/SUD shorthand interpretation of ':'.
            graph["edges"].append({"src": nid, "label": {"slot": child["slot"]}, "tar": target})
        return nid

    visit(tree["root"])
    return graph


def grew_request(q):
    def block(kind, spec):
        clauses = []
        for name, features in spec.get("nodes", {}).items():
            tests = ", ".join(f"{key}={json_text(value)}" for key, value in features.items())
            clauses.append(f"{name} [{tests}]")
        clauses += [f"{a} -[slot={json_text(slot)}]-> {b}" for a, slot, b in spec.get("edges", [])]
        clauses += [f"{a} ->> {b}" for a, b in spec.get("paths", [])]
        clauses += [f"{a}.{af} = {b}.{bf}" for a, af, b, bf in spec.get("equal", [])]
        return kind + " {\n  " + ";\n  ".join(clauses) + ";\n}"
    parts = [block("pattern", q)]
    parts += [block("without", spec) for spec in q["without"]]
    if q["meta"]:
        parts.append("global { " + "; ".join(f"{k}={json_text(v)}" for k, v in q["meta"].items()) + "; }")
    return "\n".join(parts)


class NativeGraph:
    """Small exact-match reference implementation; no Grew code is copied."""
    def __init__(self, graph):
        self.graph = graph
        self.edges = {(e["src"], e["label"]["slot"], e["tar"]) for e in graph["edges"]}
        adjacency = {n: [] for n in graph["nodes"]}
        for src, _, tar in self.edges:
            adjacency[src].append(tar)
        self.reachable = set()
        for src in adjacency:
            pending, seen = list(adjacency[src]), set()
            while pending:
                tar = pending.pop()
                if tar in seen:
                    continue
                seen.add(tar)
                self.reachable.add((src, tar))
                pending.extend(adjacency[tar])

    def bindings(self, spec, seed=None):
        nodes = self.graph["nodes"]
        seed = dict(seed or {})
        domains = {name: [nid for nid, f in nodes.items() if all(f.get(k) == v for k, v in tests.items())]
                   for name, tests in spec.get("nodes", {}).items()}
        if any(name in seed and seed[name] not in values for name, values in domains.items()):
            return
        variables = sorted((name for name in domains if name not in seed), key=lambda n: (len(domains[n]), n))

        def constraints(binding):
            for a, slot, b in spec.get("edges", []):
                if a in binding and b in binding and (binding[a], slot, binding[b]) not in self.edges:
                    return False
            for a, b in spec.get("paths", []):
                if a in binding and b in binding and (binding[a], binding[b]) not in self.reachable:
                    return False
            for a, af, b, bf in spec.get("equal", []):
                if a in binding and b in binding:
                    left, right = nodes[binding[a]], nodes[binding[b]]
                    if af not in left or bf not in right or left[af] != right[bf]:
                        return False
            return True

        def extend(index, binding):
            if not constraints(binding):
                return
            if index == len(variables):
                yield dict(binding)
                return
            variable = variables[index]
            for nid in domains[variable]:
                if nid not in binding.values():
                    binding[variable] = nid
                    yield from extend(index+1, binding)
                    del binding[variable]

        yield from extend(0, seed)

    def search(self, q):
        if any(self.graph["meta"].get(k) != v for k, v in q["meta"].items()):
            return []
        return [binding for binding in self.bindings(q)
                if not any(next(self.bindings(negative, binding), None) is not None for negative in q["without"])]


def canonical(rows):
    return sorted((row["sent_id"], tuple(sorted(row["matching"]["nodes"].items()))) for row in rows)


def native_search(index, q):
    return [{"sent_id": sid, "matching": {"nodes": binding}}
            for sid, graph in index.items() for binding in graph.search(q)]


def summarize(rows, graphs):
    historical = [r for r in rows if graphs[r["sent_id"]]["meta"]["origin"] == "historical"]
    fixture_counts = Counter(r["sent_id"].removeprefix("fixture:") for r in rows
                             if graphs[r["sent_id"]]["meta"]["origin"] == "synthetic")
    examples = []
    for row in historical[:3]:
        graph = graphs[row["sent_id"]]
        examples.append({"sent_id": row["sent_id"], "raw": graph["meta"]["raw"],
                         "bindings": {variable: {k: graph["nodes"][nid][k] for k in ("source_id", "code", "start", "end")}
                                      for variable, nid in row["matching"]["nodes"].items()}})
    return {"historical_bindings": len(historical), "historical_expressions": len({r["sent_id"] for r in historical}),
            "fixture_counts": dict(sorted(fixture_counts.items())), "historical_examples": examples}


def git_head(path):
    return subprocess.check_output(["git", "-C", str(path), "rev-parse", "HEAD"], text=True).strip()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--corpus", required=True, type=Path, help="Read-only oldtupicorpus checkout")
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--export", type=Path, help="Optional JSON dictionary: sent_id -> Grew graph")
    parser.add_argument("--grew", action="store_true", help="Require actual Grew execution; exit nonzero if unavailable or different")
    args = parser.parse_args()
    graphs, files = {}, []
    started = time.perf_counter()
    for name in ["araujo_catecismo_1686", "bettendorff_compendio"]:
        path = args.corpus / "historic" / (name + ".tu.py")
        checksum = digest(path.read_bytes())
        entries = source_entries(path)
        files.append({"path": str(path.relative_to(args.corpus)), "sha256": checksum, "expressions": len(entries)})
        for row in entries:
            sid = f"{name}:{row['ordinal']}"
            graphs[sid] = to_graph(row["expression"], {"sent_id": sid, "source": name, "origin": "historical",
                "line": str(row["line"]), "ordinal": str(row["ordinal"]), "file_sha256": checksum})
    for name, raw in FIXTURES.items():
        sid = "fixture:" + name
        graphs[sid] = to_graph(raw, {"sent_id": sid, "source": "fixture", "origin": "synthetic"})
    export_ms = 1000*(time.perf_counter()-started)
    started = time.perf_counter()
    index = {sid: NativeGraph(graph) for sid, graph in graphs.items()}
    index_ms = 1000*(time.perf_counter()-started)
    historical_nodes = [n for g in graphs.values() if g["meta"]["origin"] == "historical" for n in g["nodes"].values()]
    report = {"schema": 1, "scope": "Source AST search, not linguistic accuracy, semantic equivalence, or a UI test",
        "python": platform.python_version(), "corpus_commit": git_head(args.corpus),
        "adapter_sha256": digest((STUDIO / "python/studio_authoring.py").read_bytes()),
        "sources": files, "historical_expressions": sum(f["expressions"] for f in files),
        "historical_nodes": len(historical_nodes), "historical_node_kinds": dict(Counter(n["kind"] for n in historical_nodes)),
        "synthetic_fixtures": FIXTURES, "export_ms": export_ms, "native_index_ms": index_ms,
        "grew": {"status": "not_requested", "bindings_compared": False}, "queries": []}
    grew_corpus = None
    if args.grew:
        if shutil.which("grewpy_backend") is None or importlib.util.find_spec("grewpy") is None:
            report["grew"] = {"status": "unavailable", "bindings_compared": False,
                "reason": "Install both the OCaml grewpy_backend executable and the Python grewpy package."}
        else:
            from grewpy import Corpus, Graph, Request, set_config
            from grewpy.network import send_and_receive
            from importlib.metadata import version
            set_config("basic")
            started = time.perf_counter()
            grew_corpus = Corpus({sid: Graph(graph) for sid, graph in graphs.items()})
            report["grew"] = {"status": "running", "bindings_compared": False, "grewpy": version("grewpy"),
                "backend": send_and_receive({"command": "get_version"}), "load_ms": 1000*(time.perf_counter()-started)}

    try:
        for q in QUERIES:
            durations = []
            for _ in range(3):
                started = time.perf_counter()
                rows = native_search(index, q)
                durations.append(1000*(time.perf_counter()-started))
            summary = summarize(rows, graphs)
            assert summary["fixture_counts"] == q["expected_fixture_counts"], (q["id"], summary["fixture_counts"])
            result = {"id": q["id"], "description": q["description"], "grew_request": grew_request(q),
                      "native_median_ms": statistics.median(durations), "fixture_check": "passed", **summary}
            if grew_corpus is not None:
                request = Request(grew_request(q))
                # Tiny fixed corpus/query suite; no truncation so complete bindings can be compared.
                started = time.perf_counter()
                grew_rows = grew_corpus.search(request)
                result["grew_ms"] = 1000*(time.perf_counter()-started)
                result["same_bindings"] = canonical(grew_rows) == canonical(rows)
                if not result["same_bindings"]:
                    raise AssertionError(f"Grew/native bindings differ for {q['id']}")
            report["queries"].append(result)
        if grew_corpus is not None:
            report["grew"]["status"] = "passed"
            report["grew"]["bindings_compared"] = True
    finally:
        if grew_corpus is not None:
            grew_corpus.clean()

    for file in files:
        assert digest((args.corpus / file["path"]).read_bytes()) == file["sha256"]
    report["source_files_unchanged"] = True
    report["source_span_checks"] = sum(len(g["nodes"]) for g in graphs.values())
    report["graph_sha256"] = digest(json_text(graphs).encode())
    if args.export:
        args.export.parent.mkdir(parents=True, exist_ok=True)
        args.export.write_text(json.dumps(graphs, ensure_ascii=False, indent=2) + "\n")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json_text({"expressions": report["historical_expressions"], "nodes": report["historical_nodes"],
        "fixture_queries_passed": len(report["queries"]), "grew": report["grew"], "output": str(args.output)}))
    return 2 if args.grew and grew_corpus is None else 0


if __name__ == "__main__":
    raise SystemExit(main())
