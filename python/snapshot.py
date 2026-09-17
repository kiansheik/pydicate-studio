"""Record the verified authoring slice; writes only explicit Studio outputs."""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import itertools
import json
from pathlib import Path
import platform
import sys

sys.dont_write_bytecode = True
from adapter import ADAPTER_VERSION, ProjectAdapter


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--parent", type=Path, required=True)
    parser.add_argument("--output", type=Path, default=Path("src/domain/render-snapshots.json"))
    parser.add_argument("--manifest", type=Path, default=Path("docs/design/compatibility.local.json"))
    args = parser.parse_args()
    adapter = ProjectAdapter()
    project = adapter.open_project(str(args.parent))
    snapshots = []
    for hidden, mood, negated in itertools.product([False, True], ["imperative", "indicative"], [False, True]):
        analysis = {"kind": "imperative", "predicate": "apiti", "subject": "nde", "object": "moro",
                    "hiddenSubject": hidden, "mood": mood, "negated": negated}
        result = adapter.render({"revisionId": "compatibility-snapshot", "engineFingerprint": project["engineFingerprint"],
                                 "analysis": analysis})
        snapshots.append({"analysis": analysis, **{key: result[key] for key in ("expression", "surface", "annotated", "morphemes")}})
    repositories = [{**repository, "path": f"../{repository['name']}"} for repository in project["repositories"]]
    fixture = {"schemaVersion": 1, "engineFingerprint": project["engineFingerprint"],
               "repositories": repositories, "snapshots": snapshots}
    manifest = {"schemaVersion": 1, "observedAt": datetime.now(timezone.utc).isoformat(),
                "capability": ADAPTER_VERSION, "engineFingerprint": project["engineFingerprint"],
                "repositories": repositories, "runtime": {"python": platform.python_version(),
                    "implementation": platform.python_implementation(), "workerDependencies": "Python standard library",
                    "engineDependenciesObserved": "Python standard library plus local pydicate and tupi modules and their checked-in data"},
                "verification": {"scope": "Eight apiti / nde / moro authoring combinations; AST source inspection; no full corpus import or regeneration",
                    "passagesRead": len(project["passages"]), "renderedCombinations": len(snapshots),
                    "sourceExpression": "-(+nde * apiti * moro).imp()", "expectedSurface": "eporoapiti umẽ"},
                "limitations": ["Dirty working-tree content is required to reproduce these fingerprints; repository HEAD alone is insufficient.",
                    "Fingerprints cover revision plus tracked and nonignored untracked content under pydicate/, tupi/, historic/, authoring/, and ground_truth/records/historic/; bytecode caches excluded.",
                    "This is an observed local compatibility record, not a clean distributable engine/corpus lock or full grammar validation.",
                    "Corpus source and engine repositories were read only; saved references retain legacy/unknown reviewer provenance."]}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.manifest.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(fixture, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    args.manifest.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Saved {len(snapshots)} actual-engine render snapshots and local compatibility record.")


if __name__ == "__main__":
    main()
