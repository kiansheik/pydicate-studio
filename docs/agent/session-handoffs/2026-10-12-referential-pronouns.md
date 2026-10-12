# Referential third-person pronouns

Goal: let a contributor turn a generic `+ae` (or any form) into a pronoun that
refers back to a marked antecedent anywhere in the same work. The realized form
stays exactly the same, and the tree draws a dashed link outside the hierarchy.
Contract: [coreference](../../design/coreference.md).

Inspected: nhe-enga `Predicate.__pos__`/`copy`, `Pronoun ae`;
`authoring_runtime` interpreter/namespaces, `studio_authoring` call cards,
`authoring_service._preview`, `active_lexicon`, `semantic_context`,
`shared_definition`, `lexical_publication`; `expression-tree.ts`, `canvas.ts`,
`ExpressionCanvas.tsx`, `TreeWorkspace`/`RuntimeTree`, `App.tsx` Projections,
canvas harness/spec.

Changed:
- Python: `studio_anchor`/`studio_ref` helpers, allowed in the bounded
  interpreter and registered in every evaluation namespace;
  `STUDIO_HELPER_SOURCE`/`coreference_call` in `studio_authoring`. Preview
  inserts only the helpers a file uses. The wrappers are transparent in Léxico
  (with a `coreference` field) and in the semantic context (with
  `coreference: {role, label}`).
- TS: `src/domain/coreference.ts` (labels, source writers, suggestion, a
  string/comment-aware scanner, a work index). `expression-tree` collapses the
  wrappers onto the visible node with `coreferenceAnchor`/`coreferenceReference`
  attributes and exports `coreferenceWrappers`. `replace` canvas actions accept
  a companion `add` piece. The operation terms are new.
- Canvas: menu actions (create pronoun, link/relabel, go to, unlink, remove
  anchor), a panel, badges, a dashed link layer, an external-passage chip and an
  inspector summary. `App.tsx` passes the work's other-passage links and
  passage navigation.
- AI prompt: one sentence explaining `coreference` in `definitionContext`.

Commands and results:
- `python3 -B -m unittest python/tests/test_coreference.py`: 7 pass, real engine
  (`+ae * ikó` and `studio_ref(+ae, "teko") * ikó` have equal surface and
  annotation).
- Related modules (`active_lexicon`, `semantic_context`, `node_definitions`,
  `shared_definition`, `lexical_planner`, `operation_tree`, coreference): 85 pass.
- `test_authoring` + `test_dictionary_authoring`: 44 run, 2 failures. Both fail
  identically on a copy of `python/` with this diff reversed, so they predate
  this work: the occurrence gloss now publishes a named `apiti_…` entry rather
  than `def studio_define`, and the reserved new passage ID is not kept on
  reopen.
- `npx vitest run`: 36 files / 300 tests pass, including 8 new coreference tests.
  `tsc -b` is clean, Prettier is clean, and `git diff --check` is clean.
- `npm run test:runtime`: 308 pass.
- Playwright, via a private port-5199 config because port 5173 was held by
  another checkout's Vite: the 2 new canvas tests pass, and screenshots confirm
  the dashed arc and the external chip. Canvas, expression-tree, runtime-tree,
  passage-lexicon and shared-tree-edit specs: 138/144 pass. The 6 failures
  (canvas.spec: dismissing visible search, moving a subtree, partial evaluation,
  shared reference object tree, local reference meaning, Araújo 60 highlighting)
  fail identically on a copy with this diff reversed.

Remaining questions: renaming an anchor together with its references
everywhere; whether the antecedent text from other passages should be the
anchored node's surface instead of the passage text; whether the MCP/agent
guide should teach `studio_ref` explicitly. No deployment or source publication
was performed. The engine and the corpus are unchanged.

Suggested next prompt: "Test referential pronouns on passage N's tree; then add
anchor rename with a reviewed cross-passage preview."
