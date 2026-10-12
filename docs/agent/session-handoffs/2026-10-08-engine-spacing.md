# Engine spacing follow-up

Goal: explain why qualification rejects the space and fix the engine.
Files inspected: Studio authoring_runtime.py approval; nhe-enga nominal engine
and historic tests; oldtupicorpus record/expression118, dictionary/utils.py and
tokenizer/build_corpus_json.py; latex surface_consistency.py/corpus_appendices.py.
Changed: sibling nhe-enga tupi/tupi/verb.py, focused historic surface test,
grammar-navigation and 2026-10-08-nominal-spacing handoff; Studio current state,
log and this note. User explicitly requested engine work after the initial diagnosis.
Commands: fresh 160-expression before/after script in .local/spacing-fix-20261008;
unittest discover nhe-enga/pydicate/tests (82 pass); qualification focused gate
suite (4 pass); diff --check. Regression initially reproduced failure.
Result: only Araújo1686:118 plain/annotated output loses one space; dictionary
output unchanged. Exact qualification gate passes with that record corrected in
memory only. Saved record/corpus expressions and LaTeX checks were not changed.
Remaining: engine fix is local, uncommitted and not deployed. The approved record
still has the old double space. No full PDF build claimed. Next: review/deploy engine
fix, re-save the corrected approved passage, and run make qualification.
