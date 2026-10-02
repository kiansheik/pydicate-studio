# Contextual builder guide — 2026-10-02

## Goal and scope

Implement and deploy an approachable Portuguese cheatsheet informed by the
current corpus, engine simulations and Nambi/Marcílio's operator/order questions.
User extended scope to common unary operations and a better context menu.
Isolated branch `feat/builder-cheatsheet` from merged main `6e6351c`; original
unrelated work remains stash `b656f4c` and verified recovery bundle. No linguistic
rules, corpus records, approvals, credentials or source text edited.

## Inspected and changed files

Read AGENTS instructions, agent index/state/map/questions and local setup.
No `.agents` directory exists. Inspected current `ExpressionCanvas`, canvas
transforms, operation terms/catalog, `OperationPreview`, `LexicalInput`, browser
harness/tests, Python bounded interpreter, and read-only neighboring corpus/engine
sources: predicate, verb, noun/Conjunction, Adverb, Postposition, lexicon and Araújo.

Changed `ExpressionCanvas` for discoverability, scoped unary shortcuts, grouped
catalog, left/right cues, contextual guide and accessible circ mode selector.
Added `BuilderGuide` and CSS, shared JSON recipes, docs generator and portable
guide. Updated contributor guide and agent docs. Added executable recipe checks
and four browser cases in existing canvas suite. Guide uses a native modal with
focus restoration/Escape and scrollable layout; explicit example checks use the
existing evaluator/stale engine/revision guards. Only ordinary Apply creates a
canvas edit and undo history.

## Actual findings and representative evidence

Local Araújo AST has 41 base_nominal calls, 32 variants, 16 imperatives, 8 vocatives,
4 permissives, 2 reduplications and 2 circ calls. Counts describe inspected source,
not statistical language frequency. Lexicon's n helper calls base_nominal(True).

`*` dispatch depends on classes/arguments; it is not exclusively direct object.
Conjunction abé has minimum 2/unbounded arguments; its variant1 and literal
Conjunction("bé") realize bé. Postposition("bé") with one coordinated complement
can produce the same surface, retaining a distinct object/arity. One argument of
abé is structurally incomplete even if the engine can print a partial form.
The engine's category string for Conjunction is inherited classifier_noun, so
structural tests verify the actual class and arguments rather than guessing from
that string or the surface.

`Adverb("marã") + (ikó * ae)` -> `marã sekóû`; reversed -> `oîkó a'e marã`.
Explicit constructor matters: lexical marã in inspected corpus is Noun (work).
`(Adverb("kori") + (ikó * ae)) << Adverb("eté")` -> `kori sekóû eté`, storing
eté in v_adjuncts and kori in pre_adjuncts. The >> counterpart stores eté in
v_adjuncts_pre and kori in post_adjuncts, realizing `eté sekóû kori`.
`(ikó * ae).base_nominal() + (esé * abá)` -> `sekó abá resé`; nominalizing after
the PP gives the same result here. Recipe order is not a universal requirement.
`-(ikó * ae)` -> `noîkóî a'e`; negative imperative -> `emondarõ umẽ`.
Double negation restores positive; unary + keeps the pronoun, marks pro_drop and
does not mutate the shared lexical object. Nested PP recipe uses already saturated
`(esé * abá) + (supé * nde)`, yielding `abá resé endébo`.

The two Oito/Oporomöĩgobêbäe lines remain diplomatic lines in the guide. No exact
analysis is invented for them or “Abá marã sekoagûerĩ resé nherane’yma.”.

## Live verification provenance

Read-only `docker exec -i ... python3 -B -` in existing healthy Studio container;
no inference request. Live app `85ddedd`, corpus HEAD `c25c0e7`, engine HEAD `c55b3e4`
with pre-existing dirty work. Examples executed through deployed bounded adapter,
namespace before source line1300; local checks also pass from initial lexicon context.
All outputs used in the guide match locally and live. Raw receipts ignored under
`.local/live-example-probe.jsonl`; no private credentials read or published.

Live engine predicate SHA256 `30779a8d1ef13f230e17a1586e11b7f6dd84ec127480f4f980aef47dbb75883c`;
verb `8776e18c9b5302662bba26144bf2b33497ce6644117e8889cbafc056ce265a61`;
lexicon `9c2167695d37698bee3490b210d727ec74bc82aa8e34f35677219a23b2bd38cf`.
Corpus source changed between read probes (`9b4c4105...` then `d522b99d...`);
these are observations, not a frozen deployment snapshot or a claim of who changed
it. Our probes only read and evaluate; do not overwrite live work. Reference
outputs explicitly remain examples; current context may differ and failures are
shown by the normal evaluator without applying anything.

## Commands, results and limitations

`npm run format:check`, `npm run build`, focused domain operation tests (14 pass),
`PYDICATE_PROJECT_PARENT=/Users/kian/code python3 -B -m unittest python.tests.test_builder_guide`
and portable generator `--check`; focused browser command uses ignored dedicated
port5321 config, with existing canvas regressions plus guide/preview/apply/undo,
repeat/Escape/focus, 400px layout, engine-context interruption and mode choice.
Final focused browser run: 8 passed. Recipe suite: 6 passed, including 25 distinct reference expressions across 16 topics. Python simulations require selected corpus;
without it structural/syntax/alignment checks run and engine cases explicitly skip.

First browser run found a real focus-restoration problem on unmount, fixed by
closing the retained dialog and restoring the prior connected element. Another
assertion needed the canvas's preserved outer grouping parentheses. Sandbox
blocked loopback listen; authorized escalation enabled local QA. Narrow screenshot
visually inspected; no horizontal overflow. Existing Vite large chunk warning
remains. No paid provider calls, publication receipts/approvals or deployment yet.

## Safe release plan / remaining blocker

Publish focused feature only, verify exact-head checks; do not pop/publish unrelated
stash. Full image required to include already-merged runtime cleanup/workflow.
Before remote mutation: approved no-prune route because legacy deploy prunes
research provenance, capacity/mount inspection, named stopped full backup including
DB/app/workspace/config and complete analysis records/payload blobs. Preserve
current dirty grammar/corpus SHAs and byte hashes around deployment; normal
sync defers dirty repos. No legacy imports or auth replacement. New packed analysis
indices require complete pre-upgrade rollback state or a lossless unpack migration.
Actual deployed SHA/health/live guide interaction only after successful deployment.

Suggested next prompt: approve preservation-safe no-prune release, verify focused
feature CI, take full backup and deploy tested app while preserving live research.
