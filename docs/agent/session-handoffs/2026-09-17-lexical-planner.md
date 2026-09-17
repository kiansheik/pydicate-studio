# Shared lexical publication planner

## Goal

At source review, replace inline literal predicate constructors with readable shared lexical names while preserving exact sense, grammatical state, and passage operations. The planner writes no source files; the parent service owns review and the joint source/lexicon transaction.

## Inspected and changed

Inspected the agent guide/current state/map/questions, the runtime interpreter and namespace loader, rendered structure identity/isolation, concrete AST spans, dictionary conversion, and actual shared lexicon exports.

Changed `python/lexical_publication.py` (new planner), `python/authoring_runtime.py` (private child action), and `python/tests/test_lexical_planner.py` (new tests). The root agent owns service integration, runtime fingerprint inclusion, transaction handling, and main documentation.

## Contract

`prepare_lexical_publication` accepts `sourceId`, contextual `line`, and `raw`. It returns rewritten `raw`, `declarations`, `reused`, concrete `replacements`, `diagnostics`, and `unpromoted`. Each declaration includes `name`, original constructor `expression`, `headword`, and `lexicalFingerprint`; a literal `studio_define` wrapper additionally supplies `definitionOverride` for a following `name.definition = ...` assignment in the shared file.

The fast `contains_lexical_candidates(raw)` helper avoids spawning the runtime for ordinary reference-only passages. Names use a readable ASCII headword slug and stable hash when occupied. Engine/shared bindings and all existing historical names, including future declarations and unresolved references, are reserved. Same spelling never establishes identity; runtime class/state, full definition and dictionary ID remain part of the proof. Reuse also checks the actual destination binding.

Literal constructor leaves move; methods, operators, comments, grouping and surrounding source text stay in the passage. Repeated exact leaves share one declaration. Context-dependent leaves can be compared by their exact state and matching isolated failure. A previously failed whole analysis remains publishable under the existing policy, with explicit diagnostics. Unsafe constructor-context differences remain `unpromoted` for service-level reporting or rejection.

## Validation and findings

`python3 -B -m unittest python.tests.test_lexical_planner -v`: 11 tests passed (about 7.3 seconds), covering all 13 current constructors, exact shared reuse, homographs/meaning/class differences, source-local shadowing, future names in another source, duplicate leaves, full definitions, actual verbal IDs/classes, literal definition wrappers, standalone nouns, multiline Unicode/comments, and failed outer analyses. `git diff --check` passed.

The first canonical proof exposed an internal `Noun.copy()` self-link difference caused by the Studio interpreter's optional UI occurrence tagging. The planner now uses the uninstrumented interpreter, matching actual published source semantics, with isolated snapshots. This avoids changing grammar or weakening structural identity. The integration agent subsequently reported all 9 service transaction tests passing.

No actual neighboring source/lexicon writes, provider requests, commits or pushes. Corpus fixture changes were temporary; source hashes were checked unchanged. The planner's initial real-engine probe took about 0.36 seconds.

## Remaining / suggested next prompt

Finish native reviewed publication and restart verification through the root agent's integrated source/lexicon transaction. Report any unpromoted literal constructors explicitly; do not describe them as registered shared entries. Keep ground-truth approval separate.
