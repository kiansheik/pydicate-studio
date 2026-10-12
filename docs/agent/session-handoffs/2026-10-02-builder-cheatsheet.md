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

## Publication outcome

Pushed focused commit `cc958a4644b47c2abee8be7d02a35be0fcfcecb1` and opened
[PR20](https://github.com/kiansheik/pydicate-studio/pull/20) as a draft against main.
Exactly 13 intended files were committed; dependency symlink and private probes
remain untracked/ignored and were not published. Local final format/build checks,
14 domain tests, 6 recipe checks and 8 browser flows pass. Exact-head GitHub CI
started (push Checks run37075810661); terminal result remains to be verified.
Review patch: ignored `.local/builder-cheatsheet.patch`. No merge or deployment
occurred. Preserve-safe no-prune approval remains pending. This final publication
note is local, after the reviewed code commit, so it does not alter deployed code.

## Terminal CI and authorized rollout

The user subsequently authorized deployment with legacy pruning skipped. PR20
merged at 2026-10-02T23:11:24Z into main
`921b502fd076e86f9a44ea4836e4b93c458ec298`; its tree exactly matches `cc958a4`.
Both [main Checks](https://github.com/kiansheik/pydicate-studio/actions/runs/37076364453)
and [main hosted gates](https://github.com/kiansheik/pydicate-studio/actions/runs/37076364513)
finished with success. Feature Checks and hosted CI also finished successfully:
289 domain tests; browser gate 294 passed/109 explicit optional skips; hosted
119 passed/9 optional skips plus actual Python, two-browser and compiled-editor
gates. The new corpus-enabled guide cases were verified in the local focused run,
rather than being counted as executed when skipped in the generic CI harness.

Published release prepared using official Remote.prepare_release and full
Host.deploy, under deployment and operations locks. An ignored one-time wrapper
skipped both legacy prune calls and supplied a stopped full checkpoint after image
build. No auth installation/replacement, legacy import or source reset occurred.
Dirty dependency synchronization was deferred by the existing deployment guards.

Backup: `/srv/pydicate-studio/backups/manual-main-guide-20261002T232050-e89c57`.
Report: `/srv/pydicate-studio/storage-maintenance/guide-deployment-20261002T232050-fcd281`.
Manifest payload hashes were checked; the full `analysis/records` directory was
streamed back from the workspace archive and compared exactly, including the
67,108,817-byte legacy record. `pg_restore --list` read the dump; no database
restore was attempted. Provenance archives remain intact (614 files); no prune
was run. Original checkout is main at the deployed SHA; stash `b656f4c` and the
unrelated build/electron/release artifacts remain preserved.

## Reported example access error and observed recovery

User saw Git128 on `abé * ybaka * yby * abá`. The actual stderr was
`.git/index: index file open failed: Permission denied` under container uid1000.
Both indices were root:root 0600; all other Git metadata already belonged to
uid1000. This came from our one-time wrapper's post-deployment `git status`, run
as root after the official ownership-restoration boundary. It was an operations
verification error, not an engine rule failure or a safe-directory trust error.

Prepared a narrowly guarded index-only ownership repair, but it made no mutation:
ownership had already changed to uid1000 before execution. Journal records the
existing `pydicate-studio-upstream.service` at 23:30:30–23:30:31 UTC; its normal
`workspace_writes` cleanup restores application ownership even when dirty sources
defer updates. No new permissions, trust exemptions or secrets were introduced.
Corrected ignored `.local/full-deploy-preserve.py` and `.local/deploy-preflight.py`
to set `GIT_OPTIONAL_LOCKS=0`, preventing read-only status probes from replacing
the live index. These are private one-time scripts, not a new application release.

Verification used SSH with the existing documented identity and strict host-key
checking, then `docker exec` as the container's normal node user. Both exact Git
reads succeed. `ProjectAdapter()` with no persistent state directory opened the
actual deployed project; `evaluate_expression` returned `ybaka yby abá abé` twice,
origin engine, no failures, in 0.871/0.851 seconds. Project open took 0.724 seconds;
all timings are observed application/engine wall time, with zero provider calls.
Deliberately stale fingerprint is rejected as `STALE_ENGINE`.

Public `https://studio.academiatupi.com/healthz` reports healthy release `921b502`;
Docker image and release.json agree. Post-check source verification confirms:

- Corpus HEAD `9db10988f542ef1f7d94cfdb245a4bcb13933227`: 181 files unchanged.
- Engine HEAD `4723f706d677435082c65d95aab1ac9b77e3e513`: 157 files unchanged.
- Both dirty statuses and index bytes/ownership unchanged during read-only checks.
- All 614 provenance hashes and existing configuration metadata unchanged.

Receipts remain ignored under `.local/full-deploy.log`, `post-guide-preservation.log`
and the remote private report. Latest agent docs are local follow-up changes and
do not alter deployed code. No further push/merge is needed for the access recovery.
Successful retry in the user's authenticated cloud browser remains unobserved here;
closing/reopening the guide remounts the existing example preview, while pressing
the same already-selected check button alone does not rerun it.

Suggested next prompt: observe the repaired guide example in the existing cloud
session, then exercise a real scoped grammar correction only with a separately
authorized provider budget; preserve full records and archives on future rollout.
