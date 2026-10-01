# Current state

## Insertion past unrelated unresolved references (live)

The live insertion error came from Araújo reference records 55/60 retaining older
UUIDs than their unpinned source rows. The insertion guard checked even reference
rows before the new passage, although those rows never move. It now preserves
those records unchanged and checks identity only for relocated rows. It does not
reassociate or approve either older reference. Live in-memory reproductions at
both actual insertion targets (72/113) fail under old code and pass with the fix,
with exact reference bytes preserved. See
[handoff](session-handoffs/2026-09-30-insertion-unrelated-references.md).
Release `0c67322f489f15cff0841b7157d68d42e93111eb` is live. Full source-new
previews of both actual saved drafts passed: 155 expressions checked, 153
references retained, zero failures, one proposed new row each; nothing applied.
The rollout hit a full disk and stalled its heartbeat; six explicitly named unused
old Studio images were removed (current/rollback images and all data retained),
restoring 2.6 GB free. Verify space before another image build. All 145 research
files and six evidence/PDF files retain exact before/after parity.


## URL navigation and shareable locations (live)

Root query parameters now identify passages/sources, views/projections, selected
source nodes, shared declaration tabs, lexical entries/occurrences/note scope,
dictionary entries/searches, passage filters/searches, catalog and learning views.
History API navigation preserves the mounted editor and unsaved drafts. Explicit
links override latest-passage startup after project/draft restoration; published
pending UUID aliases canonicalize with replaceState. Missing/malformed targets
remain visible errors without creating passages. Search typing replaces its
history entry, while navigation pushes; Alt+arrows retain browser history behavior.
The header's **Copiar link** copies the current location.

Hosted password/Neo login returns to the validated root query destination. Neo
uses a short-lived HttpOnly cookie bound to the existing flow, with no migration.
Dictionary restores are read-only, dataset-pinned and cannot trigger imports;
iframe searches feed parent history. Shared-tree links require exact declaration
identity and preserve existing tab drafts. Node restoration waits for parsing
without repeatedly taking control of the canvas. See
[handoff](session-handoffs/2026-09-30-url-navigation.md) for checks and rollout.
Release `335de372a78c57d48f3a0623aff482fdb3c5e670` is live after a 52.9-second
light deployment. Actual production Chrome checks passed login return, refresh,
same-document Back/Forward and dictionary search restoration, with no page errors
or attempted research mutations. All 145 research files and six evidence/PDF
files retain exact parity. Fresh health: 154 lines, zero divergences/failures,
seven pending, 321 morphemes, no active repairs (2.708 seconds).


## Grammar repair transport, streaming and repeated work (live)

The reported pluriform repair repeatedly rolled back with malformed Python JSON
during `open_project`. Unbuffered Python output can legally write only a prefix;
the old `print()` then terminated that truncated response. A real signal/slow
reader reproduction produced invalid 65 KB output from a 2 MB response. The
worker now finishes the UTF-8 byte frame, with bounded parser diagnostics and
replacement of failed workers even at an unchanged project fingerprint.

Streaming detail reads newer than their compact list snapshot are retained,
preventing the last-20-events tail from replacing the full response. Unfinished
Markdown preserves its characters; separate assistant messages retain paragraph
breaks. Reverted edits and wrapped tool failures are
labelled explicitly. Fresh linguistic contrasts no longer reopen the worker;
edit/final corpus checks remain intact and tool instructions avoid duplicate checks.
Successful tool results and replay receipts commit together, eliminating one
whole-history rewrite per call. Cancelling repairs complete their drained final
check under the same lease while rejecting late tool results.

The exact proposed `pûera * eo` correction was tested only in disposable live-code
copies: `te'õmbûera`, full tree `te'õmbûeratyma`, both possessive orders unchanged,
154 corpus expressions unchanged. No shared linguistic correction or new provider
attempt was applied. Final release `771344f629326e44bd3f1db3d0a9e40b91a6a49b`
is live (52.5s follow-up), with exact parity for 145 research files and all six
evidence manifests/PDFs. The real interrupted-write reproduction also passes
inside the deployed container. Fresh health: 154 lines, zero divergences/failures,
seven pending, 321 morphemes, no active repairs. See
[handoff](session-handoffs/2026-09-30-repair-transport-streaming.md).

## Automatic region saves (live)

Implemented automatic PDF region/view saves with a 400 ms debounce; the manual
**Salvar regiões** button is removed. Completed draw/move/resize, deletion and
reading-order edits remain editable while writes run. Outgoing passage saves
retain their original identity; delayed acknowledgements cannot replace another
passage's regions. Failure retains local data with retry/export/reload feedback.
Loading an inherited guide creates no owned regions and performs no save.

Passage fingerprints let unrelated passages save concurrently while preserving
same-passage/PDF guards. Analysis preparation flushes pending region edits and
checks exact own evidence, so another passage's autosave does not cancel capture.
Validation: 27 actual PDF browser cases, 13 domain cases, 16 filesystem evidence
cases and five focused analysis capture cases; typecheck and Vite build pass.
Release `374232ee725fc3cbbc02969a72dec2a66e83e522` is live; the light deployment
took 52.7 seconds. Read-only browser verification confirms the button is absent,
drawing remains enabled, saved feedback and the own-passage baseline are present,
and clean navigation attempts no research writes. All three evidence manifests
and three PDF assets retain identical checksums. Fresh health: 154 lines, zero
divergences/failures, seven pending, 321 morphemes and no active repairs; see
[handoff](session-handoffs/2026-09-30-region-autosave.md).

## Revision publication identity and ordering (live)

The reported `oîkotebẽba'emoapysyka` duplicate is one UUID left under both
pending and canonical identities after publication raced another browser's
autosave. Both expressions have identical complete surfaces and annotations;
the corpus contains only one source record. Fresh inspection: 154 source lines,
zero divergences/failures. Reservations were already disabled in production.

Hosted publication now migrates draft identity and retains the visible order
inside the server write transaction before sending source-change events.
Clients adopt returned versions instead of attempting a second migration;
retired pending identities cannot be revived by stale tabs. Admins override
reservations using their current database role, with attributed history.
Real stale-version guards remain. Focused PostgreSQL, HTTP and browser checks
cover the publication/autosave race and exact-version legacy recovery.
Release `865d7adbb738b867b9c0bd2e49021a32fb15455a` is live; its small server
follow-up took 14.7 seconds. Exact recovery retired only the reported pending
identity, retained the canonical tree/history, and preserved the complete
visible order. The single entry is at 118. Live browser verification confirms
that row and its output with no API/page errors or research mutations. Fresh
health: 154 lines, zero divergence/failures, seven pending, 321 morphemes, 2.646s.
Every unrelated draft's authored content and all source rows are unchanged; see
[handoff](session-handoffs/2026-09-30-revision-identity-race.md).

## Definition reuse, persistent tabs and passage accordions (live)

Release `3aee95d10afacec596179d28039885a910fbd79c` is live from PR #16.
The feature rollout took 51.6s; a compact-screen tab stacking follow-up took 62.7s
after unused build-cache cleanup. Fresh live health: 153 lines, zero divergences
or execution failures, no active grammar repairs. Exact live alias review checked
all 153 references successfully; research sources were not applied by verification.

Shared definition tabs now survive passage changes, with bordered tab styling
and independent draft/camera/undo state. Their evaluation and grammar correction
retain the originating passage context. **Substituir por peça existente** searches
the complete shared léxico and offers a named reference or a copied tree. The
resolver follows dependencies in memory; serialization preserves valid Python
for existing corpus tools. Circular/ambiguous references and unsafe module effects
remain explicit errors. Exact variable names rank first in search.

The navigator groups passages by source, section and subsection, preserving
administrator order and reflecting current draft labels/status. Initial load opens
the final passage in the restored source, including pending rows, and reveals its
section path. Filters reveal matches; subsequent navigation remains explicit.
Live browser checks preserve tabs, variant and zoom between passages and find the
exact newer definition for reuse. Tabpanels isolate canvas overlay layers so the
sticky tabs remain clickable after keyboard focus scrolls the compact editor.
This was verified on the deployed follow-up at 800×600 with actual tab hit tests
and switching; no research writes occurred during the browser checks.

A production snapshot and deployed preview confirm `enosem_26169d1f.copy()` preserves all
153 surfaces when replacing old `enosem`. Araújo58 changes only its annotation to
`eno[CAUSATIVE_PREFIX:ERO]sem[ROOT]`. Shared-definition review now shows annotated
before/after rows and requires acknowledgement bound to that exact preview.
Surface/reference/coverage/execution regressions remain blocked; this does not
approve saved references. Imported definitions also retain complete meaning and
structure: indirect alias mutations fail before reuse. See
[handoff](session-handoffs/2026-09-30-definition-reuse-navigation.md).

The ordinary tree operation menu exposes **Verbo de 2ª classe (estativo)** via
`v(…)`, using `.base_nominal()` first when required by the selected engine.
The original compound remains editable; `bae * v((tekó / kuab).base_nominal())`
produces `itekokuaba'e` with incorporation annotations. Domain, actual-engine,
browser preview/apply/undo and final app build checks pass. An isolated engine
proposal extends `v()` to remaining predicate categories: five tests pass and
153 saved outputs/annotations are unchanged. Applying that neighboring-engine
patch awaits the requested AGENTS.md exception. Separately, live `ba'e` currently
drops argument negation; this finding has not been repaired here.

## Shared pieces in main tree tabs (live)

Release `e5852d84fb0f0256a4548f02fab844942af9a77c` is live from PR #16;
the light rollout completed in 54.6 seconds. Running image, bundled tab UI and
exact-declaration refresh backend were independently checked.

The actual `imomiaûsupyrarenosema` passage (Araújo ordinal 112) references
`enosem_26169d1f`, whose saved expression is `(((ero) * (sem)).var(1)).copy()`.
The variant survives publication; the former runtime-object view hid its authored
steps. This is distinct from the older literal `enosem = Verb("enosem")`.

**Abrir peça em aba** now opens the saved definition beside **Passagem**, above
the main canvas, with the same editable operations and variant arguments. Tabs
retain independent selection, camera and undo history while switching; closed
tabs recover browser-session drafts. Shared review/repair controls are above the
canvas; passage save controls clearly give way to the active shared definition.
Inactive tabs pause reads. Shared morphology uses the declaration namespace.

Reviewed saves refresh the exact declaration with stale-source guards intact.
Unique definitions retain draft identity when earlier source lines shift;
ambiguous bindings stay separate. A changed proposal or loose piece invalidates
an in-flight review. Focused actual-engine, browser, domain and build checks pass.
Authenticated live verification opened the exact published piece, canceled an
inline variant edit, switched tabs and closed/reopened it with no research writes
or browser/API errors. Fresh health: 153 lines, zero divergences/failures, 2.573s.
See [handoff](session-handoffs/2026-09-30-shared-tree-tabs.md).

## Shared definition trees and scoped grammar repair (live)

Release `020f0ea195e8ce9eb6182f1bbd73ddb8eef3efd3` is live from PR #16.
Rollout took 175.8 seconds because Docker filled the host disk and stalled the
idle heartbeat. Cleared only unused build cache; 5.3 GB available afterward,
with research, backups and running/rollback images retained.

Imported source variables expose **Editar árvore compartilhada**. A separate
canvas edits the declaration while retaining its name in every parent passage;
source review evaluates the entire corpus before guarded application. The exact
declaration namespace excludes later names and passage shadows. Helpers and
ambiguous assignments explain why they cannot be edited directly.

**Corrigir gramática** can target an existing subtree or an unsaved replacement
definition. Each grammar edit checks that target, its enclosing tree, the saved
passage where applicable, and the corpus. New execution errors roll back; unexpected
output/reference/coverage changes prevent a clean completion. Definition publication
remains a separate explicit source review. Draft definitions stay in tab storage.

Actual-engine, focused repair, browser and build checks pass. Live inspection and
scoped evaluation confirm `enosem` resolves its original declaration and yields
`enosem`; its shared editor opens with grammar repair enabled. Fresh health:
153 lines across three sources, zero divergence or execution failures, 2.6 seconds.
Twenty-nine authenticated invokes had no HTTP/page errors or blocked mutations.
See [handoff](session-handoffs/2026-09-30-shared-tree-editing.md).

## Instant contribution capture (live)

Release `6258328650bab1224f91d0600b8cf314205aa2f3` deployed in 14.6 seconds.
The actual `make collab-publish-all` completed in 12.68 seconds, including first
partial-cache fill and creation of nhe-enga PR #20; corpus had no changes. Live
diff captures took 0.155 / 0.330 seconds alongside 25 browser invokes with no
HTTP errors. Container start time remained the deployment time.

`collab-publish-all` now captures saved source bytes without a maintenance lease,
restart or wait for AI jobs. A change during capture fails promptly; changes saved
after capture remain working edits. The private Git index preserves sparse flags;
review hashes bind content and executable mode. Incremental bundles and laptop
upstream reconciliation remain. 30 operation tests and eight bridge/idle tests pass.

The previous `7d5c2dc` release still froze browser calls while waiting for work;
its deployed-file/health checks missed this. The stalled export was cancelled and
its exact maintenance request removed, without cancelling research jobs. Subsequent
idle state reported no work. Maintenance 503 polling now honors Retry-After, and
long maintenance leases renew correctly. See the
[handoff](session-handoffs/2026-09-30-instant-git-capture.md) for the verification
gap and completed deployment evidence.

## Submission feedback and checked batch review (live)

Release `42158ebea7a008ea3cad106c28b862c657103d64` is live (50.5 seconds),
including the initial-list loading guard.
The read-only live check verified the queue/filter UI and all 25 mounted controls
opted out of autofill, with login intact. Fresh health: 151 lines, no divergences
or execution failures; 2.492 seconds.

Invites and submissions have persistent adjacent sending/success/error messages.
The navigator shows durable submission status and filters awaiting review, ready
to incorporate and requested corrections across all sources. Admins can open
**Revisar envios em lote**, compare each engine result with saved PDF crop pixels
or a chosen physical PDF page, check reviewed lines, then incorporate selected
lines with approved references. See
[handoff](session-handoffs/2026-09-30-submission-review-queue.md).

## Workspace autofill suppression (live)

Release `a784d1cc1617b540c6facbfd20a527687827e6cd` is live (50.3 seconds).
Authenticated checks found all 24 mounted controls opted out and login tokens intact.

All React workspace inputs, textareas, selects and forms use shared
`workspaceAutofill` props before insertion: autocomplete off plus password-manager
ignore hints. Hosted collaboration/account/admin fields and history filters use
the same hints. Login/reset retain their credential semantics on separate pages.
See [handoff](session-handoffs/2026-09-30-workspace-autofill.md).

## Browser request pressure (live)

Release `1bb0c22c9840107afa93544e7668652949120512` is live from PR #16;
the light rollout completed in 49.8 seconds.

Streamed AI refreshes now run one at a time, coalesce updates over 1.5 seconds,
and retain a trailing refresh. Hosted engine requests share identical pending
reads, allow three concurrent calls per tab, and respect 429 cooldowns. Writes
are neither deduplicated nor retried. See
[handoff](session-handoffs/2026-09-30-browser-request-pressure.md).

## Repair completion and whole-corpus health (live)

Release `bee3ba1e2a38a81676cd2d3e06f45fa53d7a9d71` is live from PR #16.
The rollout acquired its private drain lease and completed in 50.5 seconds.
Live authenticated health checks cover 151 source lines across three sources:
zero reference divergences or execution failures, three pending drafts, and
312 distinct annotated surface/tag forms. The check takes about 2.4 seconds;
the dark-mode dialog was visually checked at 800×600.

The reported interrupted repair finished at 10:58:07Z on its third attempt:
target matched, all 151 corpus lines unchanged, no verification failures.

Grammar repairs no longer stop at the ordinary five-minute deadline. Resume
compacts provider context while preserving full saved history; in-flight edits
finish checking before writer release, and failed syntax/import or new execution
errors are rolled back with hash guards. **Saúde do corpus** in the top bar runs a
read-only whole-source check with divergences, per-source counts, pending drafts,
annotated morpheme forms and interrupted repair history. Light rollout now waits
for a private drained-work lease before restart. See
[handoff](session-handoffs/2026-09-30-repair-completion-corpus-health.md).

## Admin passage list organization (live)

Release `d8776184ab7a7511c0db34b248b7b77880eea983` is live from PR #16.
The final light rollout took 49.1 seconds. Authenticated read-only browser checks
passed at 1024×768 and 800×600; the manager matches all 114 source entries, with
reference labels visible and dark-mode text readable. No production content was
changed by verification.

Hosted admins now have **Organizar passagens** beside the source selector: move
up/down or to a numbered position, duplicate, exclude from the list, and restore.
Order and exclusions are shared draft metadata, with admin authorization,
optimistic revision checks and immutable before/after history. Source files and
approved references are retained. Duplicates receive new pending identities and
copy authored content/tree/locators, without completion, AI acceptance or PDF crops.
New unranked drafts still follow their insertion anchors. Ordinary autosaves cannot
change organization or overwrite deleted entries. The last active project entry
cannot be excluded until another is created.
See [handoff](session-handoffs/2026-09-30-admin-passage-list.md).

## Reservations disabled; 18-second light deployment (live)

Release `290da542827bf9909e238c97b17c0b9f3deb556d` is live from PR #16's
reviewable `unlocked-light-deploy` branch. Main remains unchanged pending CI/review.
Reservations default off: existing rows cannot block saves or appear in presence,
and reserve/release controls are removed. Identity, role, optimistic-version and
immutable-history checks remain. Read-only production checks passed for both
Kian and Emerson on the formerly blocked passage.

The new light command took 18.1 seconds including preflight; server rollout was
13.4 seconds. It reused the frontend/dependencies, took a small DB snapshot,
restarted only Studio, and verified health. No full CI wait, workspace archive,
dependency sync or PostgreSQL restart. Installation/schema changes require full
deploy; unhealthy app startup restores the previous image. Until PR #16 merges,
use `STUDIO_REF=unlocked-light-deploy make collab-deploy-light`.
See [handoff](session-handoffs/2026-09-30-unlocked-light-deploy.md).

## Studio production release 21d6035

PR #15 is merged and deployed as `21d60355767a1a4a105fdcc440d4f5d2e59bcb2e`.
Both full CI jobs and hosted CI passed. Public health reports this exact release.
Live authenticated browser checks passed at 1024×768 and 800×600: every pane
remains reachable, the passage list scrolls, Fonte ends at transcription, and
basic mode has no pane-close controls. The smoke blocked content/AI mutations
and reported no browser errors. Production grammar regression still covers all
150 corpus rows unchanged; the focused suite now passes 30 tests, including a
concurrent contributor addition. Both backup checksums are verified; all 153
checked files and all 254 drafts match the pre-deploy backup exactly. See the
[deployment handoff](session-handoffs/2026-09-30-contributor-ui-deployment.md).

## Nasal mo production correction (live)

The production AI repair changed only `/` composition. Kian explicitly requested
moving the variant to causative `*` and correcting Emerson's saved subtree.
The live fix passes 29 focused tests and unchanged-output comparison for all
150 corpus rows. Draft version 36 preserves the prior state in history revision
922; only the operator and revision/timestamp fields changed. Kian explicitly
authorized overriding the renewing claim; the temporary lock was released after
verification. The full draft realizes `atara oîmombytá`; sentence argument
choices remain editorial. See the
[audit](../research/2026-09-30-mo-causative-production.md) and
[handoff](session-handoffs/2026-09-30-mo-causative-production.md).

## Blank new passages and consolidated source view (live)

New passages and navigation into an empty existing passage inherit only source
locators (page/folio/line/section/subsection/prayer), never transcription, normalized
reading, translations, meaning or AI instructions. Fonte ends at diplomatic
transcription; the extra reading/translation/AI fields and Salvar e analisar action
are removed. Autosave remains; existing stored data is preserved. Translation
editing stays in the editor’s Tradução tab, and AI generation requires an explicit
IA/correction/translation action. Eight domain tests and all 57 affected browser
cases passed across the initial run and targeted fixture-correction rerun. See
[handoff](session-handoffs/2026-09-29-blank-passages-source-consolidation.md).

## Contributor feedback and cramped-screen navigation (live)

Basic mode keeps every pane reachable and hides close/docking controls. Compact
widths (up to 1100 px) expose explicit pane navigation; passage lists scroll
vertically within the available height, with wrapped readings and compact controls.
Operator editing is named and revealed directly; grammar/tree and variant choices
have explanations. Login copy distinguishes Neo access from local password rules.
Hosted telemetry now retains allowlisted tab destinations and search outcome counts
for future reviews, without search text. Existing history cannot recover those fields.

Read-only production aggregates show search/add/combine workflows for Lauro and
Emerson and frequent passage navigation for Kian. They do not establish task
success, active time or unused features. Apostrophe lookup succeeds in the current
local engine; the reported hosted failure remains unreproduced. See the
[feedback review](../research/2026-09-29-contributor-feedback.md) and
[handoff](session-handoffs/2026-09-29-contributor-feedback.md).

## Claude Code sign-in with a contributor's own subscription

Anthropic's Claude Code policy forbids a third-party application from offering
Claude.ai login, routing requests through Free/Pro/Max credentials on a user's
behalf, or collecting, storing or intermediating Claude credentials or session
tokens. It does permit an end user signing in to the **unmodified** binary with
their own subscription on a platform that hosts it, under the Commercial Terms.

The collaboration panel now offers that sign-in. `server/claude-auth.cjs` runs
the binary's own `claude auth login --claudeai`, returns the authorization URL
it prints, and writes the contributor's pasted code to that child's stdin and
nowhere else; `claude auth status --json` is the only sign-in signal, so no code
path reads a credential file. Each account gets a private `CLAUDE_CONFIG_DIR`
under `<root>/credentials/claude`, outside the `data/`, `workspace/` and
`config/` trees that backup, restore and research export walk. The child
environment drops `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`,
`CLAUDE_CODE_OAUTH_TOKEN` and `ANTHROPIC_PROFILE` so credential precedence
cannot substitute a server-wide credential for the contributor's own.

Tests cover sign-in, rejection, expiry, invalid codes, a missing binary and a
filesystem sweep proving neither the pasted code nor the credential appears
outside the binary's own directory, plus the HTTP flow end to end. A check
against the real installed binary returns the genuine authorization URL and
rejects a wrong code without completing any login. The runtime half is **not**
done: `server/ai.cjs` still accepts Codex only, so a sign-in stores a credential
the job queue does not yet use. See the
[design](../design/claude-subscription-login.md) and
[handoff](session-handoffs/2026-09-29-claude-subscription-login.md).

## Scanned PDFs render instead of showing blank pages

PDF.js loads its image decoders and font data at runtime, and Studio supplied
none of those URLs. JBIG2, JPEG 2000 and ICC colour are WebAssembly modules, and
both content security policies also blocked WebAssembly. A page whose picture
cannot be decoded is skipped and the render still completes, so a scanned
witness attached in a live demonstration loaded, reported itself ready and then
showed white pages. The build now copies `wasm`, `cmaps`, `standard_fonts` and
`iccs` from `pdfjs-dist` into `dist/pdfjs`; the dev server, the hosted server and
the `studio://app` handler serve them; both policies allow `'wasm-unsafe-eval'`;
and the Node crop renderer reads the same decoders, so an analysis crop of a
scan is the actual imagery. When an image still cannot be decoded, the page
reports it instead of leaving the reader with a blank sheet.

Regression coverage uses a scan-shaped fixture (JPEG 2000 page, JPEG page) in
place of the vector-only fixtures that let this through: the hosted workflow test
creates a source, uploads the scan through the browser and measures drawn pixels
in the same session, and the evidence specs cover both the desktop bridge and the
hosted range transport, undecodable-image reporting, and the served support
files. The desktop smoke compiles all three decoders at the packaged origin.
See the [handoff](session-handoffs/2026-09-29-scanned-pdf-blank-pages.md).

## Faster Portuguese reference publication

The reference action and review/save messages now use **Salvar como referência**.
Profiling found the main delay in review preparation: publication regression
rebuilt the same lexical contexts once per passage. Snapshots now reuse each
declaration context with isolated values/helpers/defaults per evaluation; every
proposed passage is still realized and compared. Exact engine/corpus fingerprints
bind a one-entry baseline cache. Approval keeps full-output, canonical surface,
human target, identity, source-byte and atomic-write guards in one fresh process.
Hosted source-change events carry their fingerprint so a publishing tab can use
its returned project immediately; other clients still refresh.

Same-server disposable benchmark: preview 18.02→3.11 seconds cold,
17.92→1.76 seconds warm; reference approval 1.98→1.32 seconds. Diff application
is about 0.68 seconds. A real compiled-browser/PostgreSQL/Python test saves through
the Portuguese controls with zero redundant refreshes and preserves unrelated
research. These are measured operation timings, not a promise of instantaneous
end-to-end network response. PR #14 is merged and release `0b6be8b` is live.
Both final Checks runs and hosted CI passed. Authenticated live QA confirms the
Portuguese save control, with no API/browser errors or draft changes. The full
backup hashes verify; all 178 drafts/versions, both PDF evidence documents, corpus
and grammar bytes, recovery data and import receipts match the predeploy state.
See the [handoff](session-handoffs/2026-09-28-fast-reference-save.md).

## Deployed hosted grammar-repair compatibility fix

The failed `sete abá reté reséndûara nã e'i` attempt reached MCP but read a
sparse-excluded guide, then hit UNKNOWN_TOOL without recording the rejected name.
Installed Codex with a fake API reproduces that error when opening Studio's
advertised guide through its standard MCP resource helpers. The provider now
accepts only explicitly scoped Studio guide reads, records bounded rejected tool
identities, and preserves tool failures that Codex reports through item status.
Activity labels distinguish failed reads from completed grammar work.

Deployment expands existing grammar sparse checkouts after backup/shutdown,
preserving dirty work and custom paths; grammar_files lists only readable allowed
files. A real compiled hosted-browser regression edits a disposable grammar,
observes automatic Python/UI refresh, and verifies unchanged drafts/source and a
surviving job. No hosted reload implementation change was needed.

PR #13 is merged and runtime `4384e8b` is live. Both final PR Checks runs,
hosted CI and deployed-merge Checks/hosted CI passed. Resumed the exact original
failed job through the production UI with its saved input and existing limits:
new attempt completed ready-for-review, with receipts for Number dispatch,
regression tests and grammar notes. It produces exactly
`sete abá reté reséndûara nã e'i`, recognizes the third-person subject, and reports
146 corpus passages checked with no changed surfaces or new reference issues.
All 17 tests in the modified grammar test file pass. All 178 saved drafts/versions,
both PDF documents, recovery data and import receipts remain byte-equivalent.
The full predeploy backup hashes are independently verified.

The first live QA script blocked its own `/api/refresh` requests; that run cannot
prove automatic browser refresh. After permitting that normal read endpoint,
fresh-browser QA displayed the exact form and review result with no API/browser
errors. Automatic refresh is verified separately by the compiled real-Python
browser regression. The resumed model's claim that the guide is absent is stale:
it exists as a regular 11,437-byte file after deployment. Grammar edits remain
uncommitted server work, available for human review; no upstream grammar or
corpus publication was performed. See the
[fix handoff](session-handoffs/2026-09-28-hosted-grammar-repair.md) and original
[investigation](session-handoffs/2026-09-28-grammar-failure-investigation.md).

## Deployed prepared search, hosted Navarro and shared Codex

The rendered-form index now warms on worker/project opening and draft changes in
one bounded background worker, with independent durable source/draft caches and
exact engine/content keys. The UI retries a cold index without reporting a false
empty result. Navarro's real website is available through authenticated routes,
with allowlisted assets and dataset/origin/iframe validation preserved.

Hosted Codex is explicitly enabled by server configuration and advertised through
capabilities. Invited users can run bounded analyses, translations and hash-checked
grammar repairs; administrators configure the shared model. Candidate acceptance
uses the desktop receipt contract inside PostgreSQL transactions/claims, retaining
author attribution and later edits on replay. Active AI work blocks idle updates.
Deployment installs only local `auth.json` over SSH when absent, keeps refreshed
server tokens, and offers `make collab-codex-auth` for explicit replacement. The
private persistent Codex home is excluded from images/Git/browser responses.

PR #12 is merged. Runtime release `ebabf87` is live with a full verified backup.
Authenticated production browser QA passed real Navarro search (45 entries),
rendered searches (1,177 / 468 ms, no preparation response), the grammar-repair
dialog and Codex authentication/model discovery. A Linux-container connectivity
request succeeded with six output tokens, without research data/tool writes.
All 178 draft/version records, both PDF evidence documents, recovery and import
receipts match the predeploy snapshot exactly. Backup excludes only Codex's
recreated temporary executable cache; credentials/history remain protected.

Both original full Checks runs and hosted CI passed; final startup-fix hosted CI
also passed. The delayed-script compiled-editor regression, six dictionary service
tests, three warmup tests, eleven real rendered-structure tests, 19 focused browser
tests, 250 domain/273 desktop tests and deployment fixtures passed. The additional
full local real-corpus suite was not clean (implementation changed mid-run; older
corpus-dependent failures also reproduce on baseline main). Do not report that
extra suite as passed. Final broad Checks rerun was still running at handoff.
See the [handoff](session-handoffs/2026-09-28-demo-readiness.md).

## Canonical desktop PDF corrections

The first research restoration archived PDF working copies but left older saved
rectangles active. The user's Salve Rainha examples (Araújo 18/19) proved that
persisted desktop corrections had removed page-37 boxes. The stopped-server
import now reconciles verified working copies against their exact saved baseline,
including removals/empty regions. A durable content-based receipt prevents later
deployments from replaying them over subsequent online edits. Pristine browser
caches adopt corrected server geometry; actual local edits remain protected.
Real-data rehearsal applies 26 corrections (18 remove page 37); two historical
buffers and one legacy buffer without a baseline remain archived. PR #11 is
deployed as `d711aba`; live checks verified all 26 corrections, 86 unchanged
other entries and unchanged drafts. Both named examples render only page 38 even
with an old page-37 browser cache; the new full backup hashes are verified. See the
[handoff](session-handoffs/2026-09-27-canonical-pdf-evidence.md) for validation and
live rollout results. The earlier 1,167-field parity check covered passage drafts,
not PDF working-copy precedence, and was insufficient to establish full fidelity.

## Desktop research restoration and passage continuity

The previous deployment migrated PDFs and Git sources but omitted desktop draft
and research stores; hosted seeds therefore showed `Em análise` despite saved
desktop completion. Deployment now snapshots allowlisted research and browser
buffers read-only, verifies every file, and reconciles current drafts only after
a full backup with Studio stopped. Original histories, old identities and
conflicting desktop versions remain accessible in an administrator history
viewer; provider queues never restart during historical reads. Credentials and
browser authentication are excluded. Existing hosted contributions win conflicts.

PR #9 merged as `6ceb2cbe29e657b578ffdbc4868f5b711db297cd`; ordinary
`make collab-deploy` succeeded. Both main workflows and final PR head `94508a9`
passed, including 205 browser tests (102 optional tests skipped, no failures).
Live verification checked every file in the 202-file / 107,494,830-byte archive
and 1,167 saved fields, with no skipped conflict fields: 105 current Araújo
completion flags, 137 mapped drafts, one pending draft, 22 historical drafts and
30 canvases. Nine stale fingerprints remain explicit; no draft conflicts occurred.
Three lexical notes are active and four remain historical. All 67 preexisting
revisions, one comment and one submission kept their exact hashes; both backup
file hashes were verified. Live browser checks passed completion labels, history
details and actual Bettendorff PDF/crop rendering, with original selection,
drafts and evidence preserved. Exact release, archive and QA evidence are in the
[handoff](session-handoffs/2026-09-27-desktop-restoration.md).

Empty next passages inherit diplomatic/revised readings, translations, analysis
instructions and location fields, including the exact `Linhas no texto` value
and prayer name, without inheriting analysis trees, completion or approval.
The previous PDF page/region remains a guide; existing next-passage work is
preserved. Optional `prayerName` round-trips in Studio metadata and is shown as
`Oração (opcional)`.

The history readability follow-up (PR #10, deployed `4602f57`) numbers candidate
revisions and shows saved expressions, rationale and annotated results directly.
Six reader tests and four browser tests pass; all 73 actual revisions were already
individually flattened. The final release is healthy and its new full backup
has independently verified hashes; the verified archive was reused without
another import. Final live checks repeated all 1,167 field comparisons and
verified 73 individually numbered history revisions, readable recorded results,
unchanged drafts/selection and no browser/API errors.

## PDF range cache and idle upstream updates

The hosted viewer now fetches original PDF byte ranges, keeps the document open
across same-source passages, and stores visited chunks in account/project/source/
SHA-scoped IndexedDB for seven days (256 MiB LRU cap). No raster conversion or
lossy compression is used. Cache corruption/storage failure falls back to checked
network ranges; stalled loading has bounded progress timeouts and retry. The
server streams authenticated ranges with per-request authorization and verified
asset identity, using bounded file hashing rather than allocating the full scan
on each evidence-status request.

Deployment installs a 15-minute dependency timer. A fresh private idle handshake
requires ten minutes without interaction and no work in flight before a short
maintenance lease. One full checkpoint precedes fast-forward updates of both
public dependency repositories; dirty/diverged work defers the update. Restart
and health checks refresh the engine and corpus. The collaboration panel shows
status and an explicit reload when repository revisions change, preserving open
edits. Fresh-install dependency pins match the user's newly published clean local
revisions: oldtupicorpus `e707610a`, nhe-enga `c43c83ec`.

Local verification: production build, 19 PDF/cache browser scenarios, authenticated
HTTP/range/abort checks, real-source upload/restore, and the compiled contributor
source/PDF/crop/restart/submission workflow pass. PR #8 (`a24f874`) is deployed; both repositories are current and the timer
is active. Current-page rendering readiness is explicit before drawing. The
remaining crop-import mismatch was traced to Python 3.14 versus 3.11 AST dump
formatting, despite identical source files. A narrow full-file SHA/source/ordinal
match restores portability while preserving changed-file and collision checks.
The final import added 61 links, preserved four existing server entries, left two
historical entries unmatched and no unmatched guides. Final real-source/PDF smoke
passed with original selection and shared drafts preserved; the full backup
checksums and the successful active timer were independently verified.
Live rollout and measurements are recorded in the [handoff](session-handoffs/2026-09-27-pdf-cache-upstream.md).

## Main merge and deployment repair

PR #2 merged into `main` as `02851f6` after all four GitHub checks passed.
`make collab-deploy` successfully validated that release, uploaded the complete
84,734,099-byte PDF, verified SHA-256, took a full backup, migrated/imported and
started healthy. The follow-up source-switch guard merged as `91707c0` (PR #4) and was deployed
successfully. Public HTTPS reports that release; both final backup manifest
hashes were independently verified. Live browser smoke renders the actual scan
and saved region, switches Araújo/Bettendorff and back, opens/cancels **Nova fonte**,
sees no queue calls/API/browser errors, restores selection and preserves drafts. A test-only crop-readiness correction and handoff were
merged through PR #5 after its focused compiled contributor workflow passed. See the
[handoff](session-handoffs/2026-09-27-main-deployment.md).

The initial hosted import matched 39 entries and retained 63 entries/four guides.
The earlier attribution to 59 changed expressions was incorrect: cross-version
Python AST serialization changed those fingerprints without proving text changes.
After the user's corpus publication, exact file hashes/ordinals prove 100 of 102
evidence entries match. The portable importer repair is described above. Complete
PDFs and original evidence remain preserved; no reference approval is inferred.

## Deployment upload progress and cancellation

The laptop deploy command now streams uploads with a dependency-free terminal
bar (bytes, percent, rolling speed, elapsed time and transfer ETA), or periodic
lines when redirected. It identifies SSH connection/checksum phases, exits
cleanly on Ctrl-C, times out after 180 seconds without byte progress and bounds
SSH connection setup/keepalives. Server setup/build/backup/sync/migration/import/
health phases print flushed labels. Transfer completion still requires SSH exit
success and the remote checksum; there is no invented ETA for the whole deploy.
The user's interruption traceback was in upload, before application deployment.
All 39 deployment operation tests passed, including real throttled local transfer,
failure, stall, startup/active cancellation and release preflight checks. Two live
Make deployments and actual PDF uploads completed successfully. See
[handoff](session-handoffs/2026-09-27-deploy-progress.md).

## Multiple sources, contributor PDFs and deployment evidence

The left pane now selects among readable corpus `.tu.py` sources (including
Bettendorff), creates an empty named source with title/year, opens its first
draft and appends/inserts within the selected source. Empty-source restoration
and navigation preserve pending work. Hosted contributors can attach a first
PDF, mark regions and use **Enviar para revisão**; direct source/ground-truth
publication remains reviewer-only. Immutable submissions include the source
description and saved own-crop evidence; the local importer recreates missing
scaffolds and preserves the PDF pointer. Hosted source panes no longer poll the
unsupported desktop AI queue. Saved PDF pointers survive reload/source return
and clear on replacement instead of carrying the previous witness.

`make collab-install/redeploy/deploy` snapshots all managed attached/retained PDFs
for the desktop profile's selected project and imports them during the stopped
deployment window, preserving hosted uploads/regions. Overrides are
`LOCAL_STUDIO_STATE` and `LOCAL_PROJECT_PARENT`. Changed or ambiguous historical
associations remain in a retained archive/report. Local real-PDF roundtrip:
84,734,099 bytes, 100 evidence entries mapped, two retained unmatched. The
initial live deployment matched 39 and retained 63. Cross-version AST fingerprints
caused most mismatches; the exact-file portability fix is documented above. App changes are now
merged into main and deployed; see the main-deployment section above. See the
[source workflow handoff](session-handoffs/2026-09-27-multiple-sources-pdfs.md)
and [browser contributor guide](../collab-contributor.md).

## Neo consent browser repair

The user's first invited sign-in exposed browser policy failures missed by the
earlier HTTP-only contract. Neo `d47e009` permits the configured Studio callback
in consent HTML's `form-action` and uses `Referrer-Policy: same-origin` there so
Chrome preserves the required POST Origin. Code/API responses keep `no-referrer`;
strict origin, PKCE, invitation and one-use-code checks remain. Studio `ba52715`
adds the real Chromium invitation/consent/callback regression, pinned by Neo CI.
The test reproduces the old CSP block and passes with both corrected headers,
including a real Studio cookie and password-revision revocation. Neo's 64
identity/API checks and the final seven identity checks passed. Deployment and
new CI results are being verified; personal sign-in needs a fresh invitation
attempt. See [browser repair handoff](session-handoffs/2026-09-27-neo-consent-browser.md).

## Hosted VPS installed and live QA verified

On 2026-09-27, Studio `871de34` deployed successfully to
`https://studio.academiatupi.com`; HTTPS health remained OK after the first full
backup. Neo identity release `20260927133536-23ad031` remains healthy. The original
migration failure was a Docker DNS collision with Neo's `postgres` alias; Studio
now uses its own database hostname. A second failure came from root-owned Git
metadata after host operations; ownership is now restored before application use,
including failure paths. No database reset was needed.

Recovery login, real Araújo loading/evaluation, autosave/reload, comments,
presence/reservations, immutable submission, authorship/history and activity all
passed live QA. Two isolated browser sessions used the same recovery account;
distinct-user collaboration passed in the disposable integration suite. Original
draft content was restored and the reservation released; labeled technical QA
comment/submission records remain. The first private full backup passed outer
and manifest checksum validation. Neo SSO is configured and the administrator
invitation was accepted by the SMTP relay; the user's own Neo login is still
awaiting confirmation. The disposable real-Neo identity contract and the live
authenticated identity introspection endpoint passed. Collaboration CI now has
PostgreSQL and a repaired full-editor fixture (`30d8120`); all four collaboration
and general Checks runs passed. See the
[repair handoff](session-handoffs/2026-09-27-vps-repair.md) for evidence and private
artifact locations. Neither PR has been merged.

## Optional hosted collaboration

PostgreSQL-backed hosted state now keeps research events and every changed saved revision without
automatic expiry. Immutable author-specific submissions export from laptop-restored DB snapshots
into new main-based corpus/grammar worktrees; reviewed Git receipts and opt-in merge digests are
separate from editorial approval. Makefile commands cover clean remote install, safe redeploy,
backup/restore and contribution review. Optional Neo identity uses one-use codes/PKCE, not copied
password hashes; it requires the companion Neo PR and explicit private configuration. Desktop is
unchanged. Provider key preferences are encrypted but hosted AI execution still fails closed.
See [current contract](../design/collab-server.md), [deployment guide](../../deploy/collab/README.md)
and [handoff](collab-server-handoff.md). Consult new CI; older SQLite results do not validate
the PostgreSQL version.
## Expand all restores the complete tree layout

Bottom-up branches now pack against their occupied widths at each depth, so
short leaf branches sit close to deep siblings instead of reserving unused
columns beside their descendants. Parents remain centered over immediate inputs;
wrapped-result heights and the 70-unit minimum sibling gap remain intact. See
[spacing handoff](session-handoffs/2026-09-27-compact-tree-spacing.md).

**Expandir tudo** now expands, restores automatic node placement and fits the
result in one action. Previously it revealed every branch while keeping saved
coordinates that could overlap leaves and cross parent/child connections;
the separate **Organizar árvore** fix did not repair that workflow. Source,
results, loose pieces and orientation remain intact. Resetting saved positions
is one undoable edit; repeated expansion adds no redundant edit. Individual
branch expansion retains manual placement. See the
[follow-up handoff](session-handoffs/2026-09-27-expand-all-layout.md).

## Tree camera regression review and layout recovery

Initial framing now waits for a visible, measured viewport and settled piece
evaluation. Hidden mounted panes cannot lock in a tiny frame. Fullscreen reads
its actual drawing area and restores the previous camera on exit; navigation
during initial evaluation prevents a late camera takeover. Ordinary selection,
zoom, resizing and structural edits retain the steady-camera behavior.

The reported crossed/overlapping branches matched saved manual node positions,
with corresponding position-edit events in the local profile; source connections
were intact. **Organizar árvore** restores automatic node placement as one
undoable layout edit. Alt-drag or middle-button drag pans even from a node without
moving that subtree. Existing drafts are not silently rearranged. See the
[review handoff](session-handoffs/2026-09-26-canvas-regression-review.md).

## Steady tree-editor camera

The canvas frames a ready tree once in its measured viewport and then leaves the camera to the contributor.
Viewport resizes, scrollbars and sub-pixel reflows no longer refit; fullscreen
and **Ajustar** are the deliberate ways to reframe. Adding, detaching or
combining a piece, and jumping to a search match, pan by the smallest amount that
brings the target into view and keep the current zoom. `src/domain/canvas-camera.ts`
holds those rules with unit checks. Node and edge elements are built from the
layout alone behind a stable handler façade, so panning and zooming reuse them
instead of rebuilding every card, and morpheme evidence is looked up through one
map rather than a scan per node. See
[handoff](session-handoffs/2026-09-26-canvas-camera-stability.md).

## Native installers, managed setup and startup updates

Installers bundle SHA-256-pinned CPython 3.13.15 and Git 2.53.0, with precompiled
shared authoring transforms and no host runtime requirement. The first-launch
dialog can prepare `Documents/Pydicate Studio` from both public `main` branches,
or open an existing contributor workspace. Sparse engine checkout excludes the
multi-gigabyte scan archive; fresh remote setup occupies about 43 MB plus 4.6 MB
for the corpus. Core evaluation and dictionary access work on clean remote main.

Application updates run before editable state opens, with finite timeouts and
offline/manual fallback. Managed repositories fast-forward only clean main
branches without local commits. Mac previews without Developer ID use manual
application updates. CI builds Mac ARM64/x64, Windows x64 and Linux x64, runs
packaged startup probes, validates update checksums, then publishes a complete
release. [Version 0.2.10006](https://github.com/kiansheik/pydicate-studio/releases/tag/v0.2.10006)
is published for all four targets. Native runners prepared fresh public-main
workspaces and opened/evaluated them in the actual packaged applications with
host Python/Git absent from PATH. Full hosted Checks also passed. Windows
Unicode, storage, source-publication and MCP portability fixes are included.
Signing credentials, manual installer acceptance on users' machines and a real
upgrade between published versions remain open. See [installation guide](../installing.md)
and [release handoff](session-handoffs/2026-09-24-published-desktop-release.md).

## Complete wrapped results and synchronized current-result highlights

All source-node result boxes show the full form with word wrapping and dynamic
height, including root, intermediate operations and reference leaves. Bottom-up
layout reserves subtree widths and depth heights. **Resultado atual** reuses the
canvas's main-root morpheme ranges, guarded by passage/expression/revision/engine
and exact surface; loose selection and stale/hidden trees clear them. The saved
reference stays plain. See
[handoff](session-handoffs/2026-09-24-wrapped-results-current-highlight.md).

## Ground-truth save confirmation and usage logging

Approval emits the allowed `review.status` event with categorical approval/source
details. Success identifies the source and passage ordinal. A renderer-event
contract test checks literal tracking calls against the IPC allowlist.
Read-only diagnosis of the reported Araújo failure found the last approval was
passage 60; passage 55 still has its older reference. Saves remain passage-specific.
See [handoff](session-handoffs/2026-09-24-ground-truth-save-diagnosis.md).

## Morphemes styled directly in existing node results

Selection automatically highlights attributable morphemes through ancestor output
labels. The experimental toggle, summary panel and duplicate sentence are removed;
there are no new visible controls or diagnostics. Operations highlight their delta.
Annotations retain original engine text plus exact UTF-16 display segments, so
annotation-only whitespace differences (reported Araújo 60) no longer discard the
whole tree. Sibling evidence supports occurrence matching. Missing or ambiguous
parts remain ordinary text, without altering analysis or approval.
See [contract](../design/morpheme-tracing.md) and
[handoff](session-handoffs/2026-09-24-inline-morpheme-highlighting.md).

## Prevent carried source rectangles

Unmarked existing passages now receive only a separate visual guide from the preceding passage, as pending passages already do. A two-page predecessor cannot silently donate both images to its successor. Own saved and cached regions remain intact; existing bad saved copies require explicit review. Eight real PDF browser checks, five domain checks, ten evidence-service checks and TypeScript pass in an isolated copy. See [handoff](session-handoffs/2026-09-24-source-region-inheritance.md).

## Formatting does not create passage conflicts

Editorial fingerprints now compare Python AST structure and retained comment text,
plus scholarly metadata, instead of raw expression layout. Black-only whitespace,
parentheses, quote-style and trailing-comma changes retain source identity and
leave drafts intact. Older editorial hashes migrate when proved; an existing
formatting-only conflict can clear through a parse-only syntax comparison when
all human fields agree. Source-file write guards remain byte-exact.
See [handoff](session-handoffs/2026-09-24-formatting-reconciliation.md).

## Inspect and copy shared references from the canvas

Selecting a named reference exposes its actual runtime object tree, declaration
and cross-source dependency candidates in **Ver estrutura e usos**. A verified
local copy expands nested compounds where their current objects can be reproduced,
keeping intermediate definitions. Copying is one undoable occurrence edit.
The inspector edits meanings locally or opens the existing shared/source review;
local meanings preserve grammar. Late edits are discarded after context changes.
See [contract](../design/reference-inspection.md) and
[handoff](session-handoffs/2026-09-24-reference-inspection.md).

## Independent passage order and automatic navigation

Passages can be inserted before/after the current item, skipped with their draft
saved, and published or approved without completing earlier items. The review
checkbox allows source-only saving. Stable source IDs preserve neighbors across
insertion; sparse approvals use a portable companion while legacy JSONL keeps
its contiguous approved prefix. **Concluir passagem** advances to the next
visible item and stays at the end. Opening PDF evidence centers region 1;
clicking a region navigates and centers it, including repeated clicks.
See [workflow contract](../design/next-passage.md) and
[handoff](session-handoffs/2026-09-24-independent-passage-order.md).

## Ordered evidence across PDF pages

**Adicionar região na próxima página** preserves existing crops, advances the
same passage's PDF view and enables drawing immediately. The region list shows
physical pages covered (a range for consecutive pages), reading-order controls
and clickable page locations. Saving, recovery and analysis preparation retain
this explicit order; image capture already consumes the saved region array in
order. Printed-page metadata stays independent. See
[handoff](session-handoffs/2026-09-24-multipage-evidence.md).

## Independent Portuguese and English translations

Passages now retain optional `translations.pt` and `translations.en` separately
from the existing unlabelled `translation`. Editors, draft persistence, source
review and portable `studio:v1` comments preserve each language and exact text.
Known-language accepted suggestions update only their recorded language. No
existing corpus text is relabelled. See [source-text contract](../design/source-text.md)
and [handoff](session-handoffs/2026-09-24-independent-translations.md).


## Remove an operation and reconnect its child

Right-click an operation and choose **Retirar só a operação…**. The dialog
previews the containing tree with the chosen child in the operation's place.
Unary operations and ordinary method chains keep their operand/base; operations
with multiple structural branches let the contributor choose which stays
connected. Other branches become loose pieces in the same undoable transaction.

The retained child keeps its own meanings. Definitions belonging to the removed
operation are removed with that node. Comments and unrelated source/forest work
are preserved; stale or unsupported edits are rejected. Existing whole-subtree
removal remains separate. Validation: 61 focused domain tests, eight browser
checks, typecheck and production build pass. See [Canvas contract](../design/canvas-editor.md) and
[handoff](session-handoffs/2026-09-20-remove-operation.md).

## Rendered previews before tree edits

Combination and operation dialogs show **Prévia do resultado** while selecting
the operator, order, variant or argument. The imperative shortcut now opens the
same confirmation dialog. Optional argument selection allows a complete preview;
leaving a required operand empty retains the existing empty-connection workflow.
Detailed scope edits preview the containing piece with the proposed change too.

The shared evaluator uses the exact candidate source and selected local engine,
with a short debounce and expression/revision/engine guards. Changed proposals
immediately hide old results; cancellation/context changes discard delayed
responses. Partial, empty and failed results are explicit. Previewing preserves
the draft, loose pieces and undo history until the contributor applies the edit.
See [Canvas contract](../design/canvas-editor.md) and
[handoff](session-handoffs/2026-09-20-tree-operation-previews.md).

**Definir significado do conjunto…** now uses the same exact-node definition
editor as Léxico. Verified literal `studio_define` annotations occupy their
value's existing visible node, not an additional operation level. Repeating a
definition updates it in place. Operator/inline argument edits preserve its
wrapper and meaning; Léxico follows the same visible inventory. The portable
source annotation remains available in code.

When the primary expression is empty (or a bare reserved slot) and only one
nonempty loose tree remains, Canvas makes it principal within the structural
edit. Existing saved single roots are promoted once when their source is parsed;
undo is not immediately reversed by the promotion effect. Nonempty primary
source, including malformed work, and multiple loose candidates are preserved.

## Dictionary meanings for existing compositions

**Consultar Navarro** is available inside the tree's composition definition
dialog and Léxico's occurrence/general meaning editor. It starts with the
rendered form and can search **Forma** or **Significado**. Choosing an exact
sense supplies its full definition while preserving the existing tree, grammar
and constituent meanings. Local changes enter undoable drafts; shared changes
use the existing diff review. Publication registers the defined composition
through the normal lexical planner.

Form matches inside another entry show their excerpt and full verbete separately.
In the current local Navarro, `tekate'yme'yma` appears in an example under
`ekate'yma`, whose headword definition is “avareza”; the example translation
supports the contributor's “liberalidade” interpretation. That consultation does
not automatically copy “avareza” onto the compound. Explicit meaning searches
allow choosing the named full sense. Row/checksum identity is validated before
and after preparation; cancelled, unmounted or changed revision/engine contexts
cannot receive late edits. Full definitions persist in source; row/checksum
remain preparation-time evidence. See [dictionary contract](../design/dictionary.md)
and [handoff](session-handoffs/2026-09-20-composite-dictionary-meanings.md).

## Every tree node in Léxico, scoped definitions and AI notes

Léxico now inventories each visible source node, including the whole expression,
intermediate operations and repeated leaves, with rendered forms and separate
occurrences. **Editar significado** can change one occurrence in the undoable
draft, restore its inherited meaning, or open a reviewed shared/source definition
edit. Meaning-only edits preserve engine morphology and constructor grammar;
local senses survive reviewed publication without replacing the original entry.
Expanded dependencies require a visible copied expansion for local editing.

Every node supports general and occurrence interpretation notes. Stable subtree
identities retain notes through formatting, unrelated sibling edits and local
definition wrappers; genuinely changed constructions keep historical notes.
Translation, analysis and explicit grammar-repair prompts receive only applicable
scoped notes, original meanings and explicit overrides. Pending note edits are
saved before capture. Resumed jobs retain their original snapshot; changed
relevant notes invalidate translation adoption and visible prompt previews.

The actual desktop/Python `obaîxûara` regression verifies a local “oposto,
contrário” sense beside the unchanged “mão de pilão” sense, unchanged morphology,
preserved note attachment and constituent-only context. No live inference or real
corpus edits were made. Restart the desktop main process for the new RPC/context
path. See [contract](../design/node-interpretations.md) and
[handoff](session-handoffs/2026-09-20-node-interpretations.md).

## One confirmation for source and ground truth

**Commit to Ground Truth** opens the passage/lexicon diff review directly.
**Salvar fonte e ground truth** accepts the displayed changes and records the
reviewed form in one action. New passages use their returned stable identity;
unchanged sources offer **Salvar ground truth** without another source write.
One operation lock covers source publication and reference approval. The
existing revision, engine, target and fresh realization guards remain.
If source publication succeeds but reference approval fails, the app states both
outcomes and supports reopening the review to retry only the missing reference.
Lexicon-only edits and recovery do not approve a passage. Source/reference writes
remain separate recoverable backend operations, not a cross-file transaction.
See [handoff](session-handoffs/2026-09-20-combined-ground-truth.md).

## Multiline source text, AI continuation and direct translation

Diplomatic text, reviewed readings, translations, analysis and notes can be
published with exact line breaks, blank lines and whitespace. Studio writes a
content-bound JSON-string encoding in ordinary source comments and decodes it
on import, reopen and explicit reference approval; unchanged legacy strings
remain literal. Approval copies explicit scholarly source metadata into the
reviewed record and preserves all other JSONL record bytes. Native corpus
readers outside Studio do not yet decode the source extension. See the
[source-text contract](../design/source-text.md).

**Retomar** continues paused/failed/cancelled/needs-input jobs with their saved
conversation, candidates, questions and checkpoint. Each explicit continuation
gets fresh attempt budgets; confirmed tool receipts are reused and unconfirmed
interrupted tool writes are not replayed. Budget stops appear as **Pausada**;
partial text survives an owner crash. Changed project evidence requires a fresh
submission; continuation does not silently replace the original input.

**Traduzir** beside the current result and in the translation view opens a
compact current-tree translator. The language is selectable/free text, default
Portuguese. **Gerar prompt** and copying run locally without provider inference;
**Traduzir** uses the same prompt and a fresh local evaluation, with no new
analysis search or corpus MCP import. Results keep their language, scope,
revision and engine provenance; applying a reviewed translation preserves the
tree and rejects stale draft/grammar evidence. Constituent requests get their
own evaluation and separately labeled whole-passage context.

Prompts retain nested lexical/composite meanings, distinguish grammatical roles
from intermediate forms, expose ambiguity and avoid copying prior translations.
Restart the desktop main process to load the service changes. Validation and
boundaries: [handoff](session-handoffs/2026-09-20-source-resume-translation.md).

## Decomposed readings and scoped meanings

Suggestions preserve direct dictionary readings and also explore bounded
generic/reflexive/reciprocal nominalizations and causative constructions.
`moropotara` now has a deeper `(potar * moro).var(1).base_nominal()` reading,
wrapped with `studio_define(..., full_Navarro_definition)`. The noun conversion
is required: the unnominalized expression gives `poropotar`. Component meanings
and the matched dictionary sense remain separate; opaque and decomposed trees
cannot merge merely because nominal annotations match. Both suggestion views
label the surface-linked decomposition as a hypothesis.

`python/semantic_context.py` projects base meanings and explicitly scoped
composite meanings through the source tree, including verified shared aliases.
The selected-node inspector and Studio translation/agent prompts receive this
hierarchy. Nested definitions survive portable lexical publication and reload;
publication identity checks their source scopes as well as engine evidence.
Helpers, stale dependency histories, cycles and expansion limits are explicit
diagnostics, never invented constituent meanings. Hidden-answer reconstruction
withholds the new semantic context too.

The selected engine gives **xe moropotara** for the derived nominal but **xe
poropotara** for the dictionary pluriform noun. Surface linking is not proof of
etymology or full-paradigm equivalence. Standalone Pydicate `semantic()` and
`translation_prompt()` remain unchanged; Studio supplies the scoped context.
Restart the desktop and rebuild its index to load the new search/runtime
fingerprints. See [handoff](session-handoffs/2026-09-19-decomposition-meanings.md).

## Manual predicates and hypothetical roots

The canvas exposes **Criar peça** beside search; an empty search also offers
manual creation. Noun/Verb forms accept an unknown meaning, explicit
pluriformity, stative/intransitive/transitive class and **Hipotética, não
atestada** status. Raw constructor properties and code remain available.

Hypothetical status travels in the predicate's existing `tag` field, separate
from its definition. The noun's grammar header initializes morphology while
`studio_define(..., '')` leaves its meaning genuinely empty. Ordinary reviewed
lexical publication preserves the constructor, definition override and status;
the tree, reuse search, lexical panels and source review identify the hypothesis.
Conversions that drop tags inherit private status from their operands; saved
derived entries recover it from static source dependencies without changing
engine output. Helper branches are treated conservatively for uncertainty.
Saved hypotheses and adopted suggestion hints remain partial in later solver
results, including retrieval and verbal annotations that omit custom tags.

Selected-engine checks reproduce `tekata`, `xe rekata` and `tekate'yma` from
hypothetical pluriform `ekat`; they verify grammar, not historical attestation
or a meaning reconstructed from negation. Rebuild existing solver indices after
updating. See [handoff](session-handoffs/2026-09-19-manual-hypothetical-roots.md).

## Navarro-backed analysis suggestions

**Preparar índice / Repreparar índice** now snapshots the supported Navarro
inventory regardless of the training profile. The checked local dictionary has
8,293 Tupi senses: 7,066 supported and 1,227 explicitly skipped for unclassified
headers or unmatched engine verb senses. Exact definitions/sense identities and
portable Pydicate constructors are retained. Dictionary bytes participate in
artifact freshness; old indices require rebuilding.

Query-time productive morphology uses engine-derived stems and paradigm aliases,
including pluriform nouns, locative stem changes and opaque imperatives. The
reported `tekate'yma` is recovered from Navarro `ekate'yma`, with the engine's
`PLURIFORM_PREFIX:T:ABSOLUTE` annotation. Possession, nominal negation, verbal
arguments, imperatives, selected derivations and dictionary-only postpositions
feed the existing full-input validator. Homonymous dictionary senses remain
separate; all search/result limits are disclosed.

Both suggestion entry points offer optional root/category hypotheses for missing
vocabulary and proper nouns. Engine-valid syntax using those leaves remains
provisional (`partial`), with empty definitions and retained judgment evidence;
it does not become a complete historical evaluation example. Input changes and
delayed feedback cannot resurrect old suggestions. Rebuild polling follows the
new job, and draft adoption respects editability.

Verification includes focused Python, desktop transport, domain and browser
checks plus an actual desktop-service/Python run in a temporary profile: the
dictionary target, altered roots, proper-name syntax, unfamiliar verb syntax and
unknown input pass. No providers, corpus/grammar edits or approval writes.
Historical accuracy and unrestricted grammar coverage remain unmeasured. See
[contract](../design/parser-lab.md) and
[handoff](session-handoffs/2026-09-19-navarro-morphology.md) for exact results.

## Hidden Tupi → Pydicate laboratory

**Sugerir** is a tab in the editor beside Árvore: a projection of the passage being worked on, prefilled with its transcription, whose proposed readings can be taken into the draft with **Usar esta análise no rascunho** — an ordinary undoable edit that touches neither source nor reference and records which reading was chosen. With no index the tab offers one **Preparar índice** button; the full laboratory (Dados, Treinar, Avaliar, Execuções) opens from it. The earlier hidden-by-default switch is gone, superseding that part of the brief; what it guarded is kept without it, since the module is a separate lazy chunk, reading state is a filesystem listing, and the Python worker starts only on the first request that needs the engine. From that tab, `asó xe rokype`, `ASOXEROKYPE`, `a so xé ró kŷ pe` and `Asó, xe rokype.` all become `asoxerokype` and compose `(+ixé * só) + (pe * (ixé * oka))` with the engine's own morpheme tags and the real editable tree. `zzzz` and `Açó xe rokîpe` return unknown rather than a fabricated parse. `ereso nde rokype`, absent from the recorded-expression index, is composed and labelled as such. Editing the possessor to `nde` gives `asó nde rokype`, and a real context-menu gesture on the same editor rewrites the laboratory source and re-evaluates it; undo and redo work in both directions. The open draft, source, human translation and reference are untouched.

The laboratory context loads the shared lexicon only, so no saved passage expression can supply its own answer. Every candidate is accepted only when the engine realizes it completely and its form normalizes to the whole observation; retrieval from the corpus is labelled and reported apart from reconstruction. Artifacts carry reproducible manifests with recipe, seed, normalizer profile, schema versions, context fingerprint, split policy, counts, checksums and metrics; an engine change invalidates them and activation is always explicit. Jobs are cancellable, and a job interrupted by a restart is recovered as interrupted and never replayed.

Readings are separated by the engine, not by us. Sources the grammar annotates identically are merged into one answer, keeping the other spelling: `(+nde * ikó)` and `ikó * +endé` become one. Sources that annotate differently stay apart and are all shown with the exact tag that separates them — `sapépe` offers `(pe * apé)` and `(pe * (ae * apé))`, differing only by `PLURIFORM_PREFIX:S:ABSOLUTE` versus `PLURIFORM_PREFIX:S` — and the contributor picks. Co-generating readings are presumed mutually acceptable, never scored as errors against each other and never trained against.

Choosing one of the readings on screen is a preference over the others: a passed-over reading is `not-preferred`, still possible and weaker evidence than an explicit rejection, so one click already produces usable supervision without calling the alternative ungrammatical. The decision takes effect immediately — the next analysis of that observation orders confirmed, presumed, not-preferred, rejected, each labelled, before any training. Every analysis, judgment and derived preference is kept locally, so the laboratory improves with use. Confirmed and corrected readings become reviewed examples on real input (`lab-reviewed`, never editorial approval) and populate the otherwise-empty `frozen_reviewed_historical` suite; unanalysable inputs become a coverage-gap list that names which pieces were recognized. Because the validator is sound, a generating expression is not evidence the alternatives are wrong, so only contributor-decided pairs are trained on — a fresh laboratory trains on nothing and says so, and the deterministic ordering stays active until judgments exist. The byte-level ByT5 recipe is documented with a dependency check and was not trained; agent escalation requires explicit initiation and did not run. Both report their real state.

Verification: 66 focused Python laboratory checks, 10 desktop service checks, 11 renderer domain checks, 12 browser scenarios and an 11-stage native Electron run with an isolated profile, a disposable corpus copy and no provider call. The [native report](../coverage/parser-lab-native.json) and screenshots record the evidence. Broader accuracy on historical text is unmeasured; see [the contract](../design/parser-lab.md) for the declared limits and [the assignment](../design/tupi-parser-lab-implementation.md) for the research that preceded it.

The separate [structural search research](../design/pydicate-structural-search.md) below is not wired into this laboratory; its retrieval route remains a proposal.

## Structural search research

The [Grew investigation](../design/pydicate-structural-search.md) and
[read-only probe](../../scripts/experiments/probe-structural-search.py) export the
existing source trees as custom feature graphs without a UD conversion. The
selected public corpus contains 122 expressions and 1,895 nodes. Eleven native
query checks over 14 synthetic controls pass; real source matches include eight
`.perm()` occurrences, seven unary-minus ancestors of `.imp()`, and four explicit
`.var(1).base_nominal()` constructions. All 1,964 source spans including controls
were verified, and both source files remained unchanged.

The [report](../evaluation/structural-search-probe.json) explicitly records Grew
as unavailable: this environment has no OCaml backend and system package setup
failed on user/group permissions. The `--grew` comparison path is prepared but
unexecuted; there is no Grew/native equivalence or speed claim. No UI, grammar or
dependency configuration changed. See the [handoff](session-handoffs/2026-09-18-structural-search.md).

## Tupi parser lab research and implementation plan

Branch `codex/tupi-parser-lab` contains a [complete implementation assignment](../design/tupi-parser-lab-implementation.md) for a hidden experimental normalized-Tupi → Pydicate workspace. No product tab or training service is implemented by this research commit. The plan reuses the current isolated learning workspace, shared source/tree editor, bounded interpreter, structure retrieval, durable job ownership and existing MCP/provider loop.

A [bounded offline probe](../evaluation/parser-lab-probe.json) generated 145 fragments and recovered the original expressions for 60/60 sampled combinations in one declared grammar family, with no full sentences indexed. `asoxerokype` produced `(+ixé * só) + (pe * (ixé * oka))`, complete engine morphology and an editable ten-node source tree. The actual source-span edit primitive changed the possessor to `nde` and rendered `asó nde rokype`. This is synthetic composition evidence, not historical accuracy or native UI verification. Dictionary accent collisions were recorded; the existing gold-annotation decompiler still loses the relational `r` in this example.

Only disposable dependency copies received the existing documented patches; sibling repositories, corpus references and product code were unchanged. No training or provider inference was run. See the [research handoff](session-handoffs/2026-09-18-parser-lab-plan.md) for reproducibility and the next task.

## Guided learning and source-generated reference

**Aprender** opens five Brazilian Portuguese lessons, budgeted at ten minutes: lexical reuse/arguments, nested possession and permissive, omission/imperative/negation, variant/nominal base, and larger postpositional/compositional constructions. The actual tree editor runs in isolated practice state, with saved progress/loose pieces, hints, confirmed stage-model replacement, undo and comprehension questions. **Próxima etapa** keeps the attempt while advancing guidance; each step reports whether its structure, surface, annotation and evaluation status match. Completion requires a complete evaluation and correct comprehension answer. Corpus drafts, source publication and reference approval are untouched.

**Referência** has a direct header entry and searches 25 source-authored guides, 235 engine/helper signatures and 129 expressions from both historic sources at this snapshot. **Comece aqui** explains the beginner sequence and follow-on topics. Each guide links concepts, UI actions, code and implementation. `npm run build` regenerates from JSDoc, standalone Python comments and module/class/function docstrings in the engine and historic `.tu.py` files (including the lexicon), plus approved records. Invalid metadata, duplicate IDs and missing related guides fail with file/line diagnostics. `docs:check` detects stale artifacts. Desktop reads the selected project afresh and retries a stale library read once after project refresh; browser-only mode explicitly presents compiled examples. Changed/unapproved/mismatching lesson sources are disabled and fail the build. See [maintenance contract](../design/learning.md).

Two intermediate steps in lesson 4 are deliberately partial. There is no automatic grammar conversion: the actual MCP probe yields different nominal forms with default vs variant 1. Prompts now describe their own stage targets; hints explicitly explain isolated `arobiar` realizing `xererobîar` and omission of `+nde` only becoming visible in the verbal construction. MCP confirms all 129 current approved references (Araújo 89, Bettendorff 40). No neighboring grammar changes were made.

Verification for the source/tutorial audit: production build, deterministic docs check, 15 focused domain/recovery tests, 11 Python curriculum/source-comment tests and five real-engine browser scenarios pass across the suite and focused reruns. The first lesson is also built through search and mouse connectors without code/model replacement. Desktop and 390px screenshots inspected; source/reference hashes unchanged. Tutorial questions reuse the existing explanation provider with isolated lesson context; tests simulate providers and spend no inference. Ten-minute usability and live AI answer quality remain unmeasured. See [initial handoff](session-handoffs/2026-09-18-guided-learning.md) and [source/tutorial audit](session-handoffs/2026-09-18-learning-source-audit.md).

## Grammar corrections in their own AI conversations

**Corrigir gramática / árvore** now prefills the intended form from the current result. Contributors edit the form, add ordinary linguistic notes, and use **Enviar ao Codex**. Submission saves the draft, captures the exact expression and an automatic corpus baseline, and opens a new independent conversation in IA. Existing threads are selectable, with up to three concurrent conversations and one writer per selected grammar directory. Follow-ups retain the original expression, intended form, baseline and conversation; delayed composer saves are bound to their original thread.

Repair jobs use only dedicated MCP tools: inspect the selected grammar, replace a unique excerpt guarded by its content hash, reload and evaluate the identical expression, and compare every corpus source. Files are limited to existing grammar/test Python files and named grammar notes; corpus, references, symlink/hardlink escapes and AGENTS edits are excluded. Before-images and edit receipts are persisted. Broken intermediate edits remain repairable. General shell access stays disabled. The final check is host-enforced, and the AI pane shows actual/expected forms, changed corpus lines and exact edits. Matching output never grants editorial approval. Copy/export and manual regression controls remain under **Detalhes e diagnóstico**.

Routine verification uses disposable files, real Python reload probes, simulated providers and browser fixtures; no real grammar or corpus correction was submitted. Restart Studio's desktop process to load the new service. See [handoff](session-handoffs/2026-09-18-integrated-grammar-corrections.md).

## Inspecting a proposal opens the working tree; old grammar is rechecked locally

**Inspecionar na árvore** now adopts the selected source/forest directly into the normal draft editor. It preserves human reading/translation fields and records undo; repeated inspection of the same structure keeps the contributor's layout without another receipt. The current editor tree is immediately available to ordinary source and Ground Truth review. Old saved preview selections still restore with the legacy use-and-review action.

`analysis_accept` no longer rejects reusable source because the original AI job used a different engine or human input revision. It evaluates the exact source locally against the current project, saves a distinct revalidation receipt, and preserves original model evidence. Changed/failed/partial output remains editable and requires current publication checks. Current draft CAS, source identity, atomic engine guards and receipt replay remain enforced. An undelivered disk change triggers one renderer refresh/retry with the same command ID and no AI submission.

Complete actual saved mendara replay through AnalysisService → DraftStore → PythonWorker → publication preview passes with 128 expressions/127 references and zero failures; 13 original files unchanged, six AI jobs before/after, zero provider calls. Build, 27 service/persistence, five domain and 22 browser scenarios pass across focused runs. This closes the earlier proof gap, which exercised Python preview but skipped acceptance. See [handoff](session-handoffs/2026-09-17-inspect-local-recheck.md). Restart the desktop process once to load the service change; no new analysis is needed.

## Visible-proposal publication and editable translations

The reported `mendara` noun was valid: its AI proposal was displayed while the human draft still had empty raw text. The earlier **Usar e revisar proposta** fix remains available for saved legacy previews; direct inspection now opens the working draft as described above. The hook captures the latest draft after acceptance; navigation, edits or engine changes discard delayed previews. Empty drafts get a specific message. Source application and reference approval remain explicit.

Fonte exposes **Tradução em português** before and after analysis. New complete evaluated candidates must register a tentative Portuguese translation in the same AI run, bound to exact expression/revision/engine/output; candidate edits invalidate it. Human text is preserved until an explicit translation-copy action. Old candidates remain inspectable without fabricated translations or automatic reruns.

Verified the actual saved mendara candidate through PythonWorker: named `mendara`, 128 corpus expressions checked against 127 references, zero failures, 12 protected files unchanged. Build, one new Python publication test, 43 desktop/service tests, five domain tests and 15 related browser scenarios passed across focused runs. No paid inference. Restart the desktop process to load the updated service and reopen review. See [handoff](session-handoffs/2026-09-17-noun-review-translations.md).

## Existing malformed draft repaired by ordinary review

The prior compound feature required a manual tree action and therefore left the reported saved draft producing the same bad diff. Ordinary source/new-passage review now detects an exact compound dictionary meaning misplaced on a literal base when the entire expression realizes that dictionary headword. It restores only that base, verifies unchanged grammar before copying and unchanged surface/annotations after copying, then promotes the named full composition. Custom definitions, explicitly scoped meanings, and mismatching whole forms are not inferred to be this legacy error. The review visibly lists the semantic repair; original drafts remain intact until explicit publication.

Verified against the actual saved pending `dbb1dab7` draft through a fresh PythonWorker: `l += nhemoabare`, separate `abare` and `nhemoabare` declarations, 127 evaluated rows and all 126 existing references matching. Draft/source/reference hashes stayed unchanged. Closing an already prepared review and generating a fresh one is required; restart the desktop process to load the complete updated review UI/service. See [handoff](session-handoffs/2026-09-17-legacy-composite-review.md).

## Composite meanings and automatic publication regression

**Definir significado do conjunto…** on a tree node creates an explicit `studio_define(full_expression, definition)` draft wrapper. Optional checked base restoration reuses a shared predicate with identical grammar and an unambiguous meaning, or a verified exact dictionary sense when no shared base exists. Publication extracts dependencies, then names the full evaluated composition from its surface and sets that composite's definition. Shared definition edits update an existing override instead of inserting an ineffective earlier assignment. The malformed abaré example now previews `abare` with its Navarro padre meaning and `nhemoabare` with the sacrament meaning; no original profile/corpus was rewritten.

Every changed source/lexicon/recovery preview runs before/after corpus evaluation against a disposable staged copy. New evaluation failures and changed surface/annotation output on unedited expressions block publication. Saved reference comparisons, existing baseline issues and intentionally edited references are reported separately; preview generation never approves ground truth; accepting a passage review also requests reference approval. The check is bound to the complete project fingerprint and rechecked for freshness on apply. Per-keystroke work still evaluates the draft; full regression happens at publication review. Native Python bridge proof evaluated 127 rows with all 126 existing references matching and originals unchanged. See [handoff](session-handoffs/2026-09-17-composite-lexicon-regression.md).

## Editable AI proposal canvas and vertical defaults

Proposal inspection now uses ExpressionCanvas instead of the legacy read-only tree. Layout/position inspection stays local; an explicit structural gesture copies the candidate through revision-guarded acceptance and applies the edit with undo. **Editar no rascunho** also opens normal editing. Trees without a saved layout default bottom-up; explicit existing layouts remain respected. Mismatching candidates show actual/expected readings as incomplete, and the provider strategy investigates supported inflection/nominalization before stopping. The saved compositional `nhe * (mo * abaré)` was verified locally: `.var(1).base_nominal()` changes `onhemoabaré` to `nhemoabaré`. No real drafts, source files or paid requests changed. See [handoff](session-handoffs/2026-09-17-proposal-tree-editing.md).

## AI conversation history and readable activity

**Nova conversa** archives the current thread and starts with empty provider conversation context; drafts, evidence, jobs and proposals remain preserved. **Histórico** opens older exchanges separately. The default pane shows the latest exchange once, formats basic response emphasis/code and groups tool activity into friendly unique steps; full events remain in **Registro técnico**. Late completions stay attached to their original archived thread. Build/typecheck, 14 service tests and 12 workspace browser tests pass with no paid requests. Restart the desktop main process to load the new command. See [handoff](session-handoffs/2026-09-17-ai-chat-history.md).

## Resubmitting unchanged AI input

The submit button no longer treats every future send of unchanged text as the same command. A terminal result now marks a new submission generation; queued/running requests retain their stable operation ID. This also applies to batch items and existing saved request keys. The backend's durable command deduplication remains intact. The browser fixture now mirrors that backend behavior, and a regression reproduces the old needs-input result, sends unchanged input anew, then confirms active repeats return the existing job. Build/typecheck pass; no real AI request or profile write. See [handoff](session-handoffs/2026-09-17-analysis-resubmission.md).

## Codex tool transport repair

The real `Nhemöabaré.` attempt reached Codex but made zero Studio tool calls: `gpt-5.6-terra` requires code-mode while Studio disabled its host. Codex also imported only the first eight discovery schemas. The host now stays enabled with external capabilities still individually disabled, and the gateway exposes the full compact catalog. Actual thread inventory is checked before any generation; missing/foreign tools block the job with an explicit setup error. Prior requests/drafts are preserved and never automatically replayed.

Build/typecheck and78 focused provider/MCP regressions pass. `npm run test:codex-tools` reproduces the disabled-host failure and verifies the corrected four-tool path through installed Codex against a local fake Responses endpoint, with zero paid requests. See [handoff](session-handoffs/2026-09-17-codex-tool-transport.md). Restart the desktop main process to load this repair; live linguistic behavior remains a separate user-initiated request.

## Persistent AI authoring workspace

Fonte and IA now share the existing support pane while the builder remains central. Workspace v1→v2 migration preserves pane arrangement; separate tentative Navarro/meaning/constraint fields never repurpose the reviewed `normalized`/@target field. Saving an analysis awaits the actual draft and own evidence revision. Conversations, queues, attempts, tool checkpoints and competing scratch candidates persist in the main-process profile. Candidate preview is read-only; explicit acceptance is a revision-checked atomic draft+receipt command with undo. Source/lexicon publication and ground-truth approval share one explicit human review confirmation; accepting an AI candidate alone still changes only the draft.

The same TypeScript builder operations run headlessly through a strict scratch service and authenticated scoped MCP. External clients contact the same Electron owner, including via `npm run mcp:analysis -- --passage <saved-id>` without renderer navigation. Iterative Claude tool rounds and Codex app-server sessions use only registered local research tools. Saved PDF regions can supply actual bounded crop pixels; inherited positioning guides are excluded. One active attempt, durable input/tool activity and explicit retry of interrupted calls avoid silent paid replay. Stale renderer envelopes cannot overwrite newer accepted work.

Integrity review fixed shared Araújo/lexicon retrieval losing merged entries, reconstruction answer leakage at nested/provider boundaries, legacy surfaces incorrectly certifying current expressions, and obsolete dictionary evidence appearing current. The latest audit discovers **86 passages**, all passing source/span round-trip and actual-engine surface/annotation/structure comparisons. That is not per-expression native UI certification or linguistic approval. The historical doctor baseline intentionally reports later corpus/grammar changes; no sibling repository was altered to match it.

Contributor review fixed exact question/alternative binding, consistent batch preparation and image consent, disappearing conversation turns and misleading unloaded evidence. Failure review fixed cross-client MCP command collisions, replayed cancellation affecting newer attempts, and external retries completing from old results. Publication preserves conversation/candidate visibility under the new passage identity while immutable input stays unchanged. Acceptance receipt replay acknowledges the existing decision after later edits/publication without applying it again.

Verification: production build, 129 domain, 167 desktop, 152 Python and 17 relevant browser checks pass, including recovery after killing an actual fixture process. A real Electron/MCP/PDF/dictionary/engine workflow completes acceptance, undo, restart and actual reviewed publication in disposable repositories, with original hashes unchanged and zero paid calls. See [native evidence](../reviews/ai-native-evidence.json), [three review reports](../reviews/) and the [consolidated handoff](session-handoffs/2026-09-17-ai-authoring-workflow.md) for exact commands, dirty dependency fingerprints and remaining limits.

See the [contributor guide](../contributor-guide.md), [MCP/shared-builder guide](../design/mcp-agent-guide.md), [provider contract](../design/ai-agent-providers.md) and [real-data evaluation set](../evaluation/README.md). Routine fixtures perform no generation. Installed Codex0.153.4 scoped initialization and Claude model discovery (11 models) were verified without inference; live linguistic usefulness and the earlier Claude credit limit remain untested by those checks. The six reconstruction and six assisted evaluation cases are explicitly **not run** against a provider.

## Inline function arguments

Number and string call arguments now appear inside the operation, for example `.var(1)`, instead of as separate tree cards. Clicking a value or double-clicking empty parentheses opens an inline textbox. Blur/Enter saves, Escape cancels, numeric decimal commas normalize, and text becomes a quoted string. Predicate/expression arguments remain branches. Edits preserve exact source comments/grouping, keyword order, main/loose-piece identity and one-step undo; an unchanged field adds no draft revision, and passage/revision changes discard stale input.

The complete source AST still controls evaluation and validation. Build/typecheck, 43 domain checks and 52 related browser scenarios pass across the combined run and focused reruns. Visual checks at 1440px and 720px found and resolved Enter losing canvas focus; immediate keyboard undo is now covered. See [canvas contract](../design/canvas-editor.md) and [handoff](session-handoffs/2026-09-17-inline-call-arguments.md).

## Direct ground-truth review

**Commit to Ground Truth** sits beside **Verificar** and **Salvar rascunho** and opens the passage/lexicon review from either workspace entry. **Salvar fonte e ground truth** is the single confirmation. Opening or cancelling does not apply source or approve a reference. Revision freshness, complete engine evaluation, source conflicts, declared targets still gate approval. The former standalone ground-truth panel remains only for legacy regression fixtures.

The native modal contains Cancelar, Escape and close controls; pending saves prevent dismissal and duplicate submission. A required source review closes the reference dialog before opening the ordinary source preview. Two focused browser regressions pass with a simulated backend, including delayed status, cancellation, dirty fields, failed approval/retry and concurrent requests. The combined production build passes. Browser screenshots confirm the footer and modal layout. No provider calls or historical corpus writes. See [handoff](session-handoffs/2026-09-17-ground-truth-shortcut.md).

## Named lexical publication and primary add field

The main tree toolbar is now the add/reuse textbox. Composition-only search is secondary; the redundant add button and floating + bubble are gone. **⌘K / Ctrl+K** focuses and selects the current query from elsewhere in the visible workspace, including repeated use while already focused. Hidden trees and unrelated modal dialogs do not capture it. **Tipos de peça e código** opens the constructor tab; connection/context palettes retain reuse search.

Reviewing a new or edited passage promotes its literal predicate leaves into shared `historic/lexicon.tu.py` declarations and replaces them with names in the passage. Readable headword slugs are used when free; stable identity suffixes resolve collisions. Exact equivalents reuse existing names only when the target namespace still has the same binding. Definitions, verb IDs/classes, operation order and source comments survive. An unsafe literal promotion fails clearly instead of silently publishing it inline. Existing unsaved drafts need only a fresh review, with no re-entry of their pieces.

The review defaults to the current Tupi result, words/concise meanings and ordinary field changes. Long content expands separately; **Mostrar diff técnico** reveals the proposed variable names and both complete file diffs. Application checks both snapshots, journals their original bytes, writes the lexicon before the passage, and rolls back completed members if a later write fails. Recoverable interruption states and earlier single-file records share the recovery UI. The saved draft adopts the published named expression; the same passage-review confirmation then saves its ground truth. Unchanged historical passages are not bulk-refactored, and unused loose pieces stay local.

Verification: build/typecheck; 11 lexical planner tests across all 13 constructors, 32 service/source regression checks, and the canvas/passage/review browser scenarios pass. A temporary-profile production run verifies the plain-language default, optional exact diff, named publication, repeated keyboard addition and undo; original corpus/reference hashes stay unchanged. See [publication contract](../design/lexical-publication.md) and [handoff](session-handoffs/2026-09-17-named-publication-and-add-field.md).

## Inline insertion and automatic search recovery

The tree now has an always-visible **Adicionar peça** textbox. Choosing a verified reusable result immediately inserts the main expression or a loose piece, with undo; Navarro fallback shares the same exact-sense conversion. Suggestions overlay the canvas. Manual constructor/code and connection-slot palettes remain available. Clicking outside a floating add/operation/combination panel closes it while the same pointer gesture can still pan or select. Escape/outside dismissal invalidates pending insertion, and refreshed context preserves the typed query while discarding stale choices.

Stale corpus/grammar reads now trigger one coalesced project refresh and one search retry. The Electron bridge preserves structured service codes through its message-only error boundary. Refresh keeps current drafts, pending shells, loose pieces, notes, selection and undo; local typing can continue during the reload. External source notifications also refresh automatically. A changed source fingerprint still requires explicit reconciliation, and selected candidates/source writes are never silently replayed. Applying a reviewed source diff during an ongoing refresh rejects without closing it as a false success.

Verification includes build/typecheck, focused domain/desktop/Python/browser checks, and a native production run that changes only a disposable grammar copy: search recovers with the query and draft revision intact, then exact-sense insertion and undo work. No AI calls or original source/reference changes. See [handoff](session-handoffs/2026-09-17-inline-search-recovery.md).

## Size suffix pieces

The Navarro picker now recognizes the augmentative senses `-ûasu`, `-gûasu`, `-usu` and the diminutive senses `-'ĩ`, `-ĩ` as `SizeSuffix` pieces. It also offers `mirĩ` as an explicit compositional choice while retaining its ordinary noun reading. These pieces attach to noun or verb bases with `/` through the selected `nhe-enga` engine. Other homographic senses keep their own choice path. See [handoff](session-handoffs/2026-09-17-size-suffixes.md).

Version 0.2 is a developer-run daily authoring application, continuing Studio `0af3937` in place. Start with `npm ci`, `npm run doctor`, then `npm run desktop`; see [README](../../README.md). No commit or push was made for this work.

## Embedded dictionary and unified piece search

**Dicionário** embeds the actual selected `nhe-enga/index.html`, styles and search script from the local checkout. The app serves a bounded set of dictionary/data/citation assets on its isolated dictionary origin, adding sense-specific headword/**+ Árvore** insertion. Search, definitions, conjugations and local citation scans stay inside Studio. Normal tab changes preserve the iframe/query; explicit refresh handles changed data. No live-site request or provider call is required.

**Adicionar peça** now starts with one natural search box: reusable project structures first, then **Dicionário Navarro · criar peça**. Both dictionary surfaces share exact-sense conversion and constructor choice. Confirmed entries become a main tree in an empty draft or an undoable loose piece beside existing work. Ambiguous classes ask for a choice; partial results require explicit insertion with diagnostics. Manual constructors and code remain secondary options.

Selection uses the exact compressed website dataset's row index and SHA-256, not the differently numbered SQLite dictionary. Verbs additionally match their selected-engine sense/class before pinning its actual ID. Full definitions survive in source expressions. Pieces remain local until review, which now includes their new shared lexical declarations with the passage.

Verification: final build/typecheck and whitespace/format checks; 15 desktop checks, 11 Python checks and 34 related browser scenarios pass. Production Electron tests use a temporary profile/disposable corpus to verify distinct senses, in-app citation scans, insertion/undo/restart, existing-compound reuse and dictionary fallback. Development-mode local-host insertion also passes. Actual site requests made no HTTP/S calls; original source/lexicon/reference/site/data hashes are unchanged. See [dictionary contract](../design/dictionary.md) and [handoff](session-handoffs/2026-09-17-dictionary.md).

## One-click next passage and bottom-up composition

**Adicionar próxima passagem** now opens a local shell directly in the ordinary passage list and Árvore editor. It carries the last effective draft's printed page/folio and section/subsection, clears line/readings/analysis, and retains predecessor identity. **Seção e localização** edits the hierarchy beside Fonte. The previous PDF page/view and last box become a separate noninteractive guide; new evidence starts empty, persists independently, and does not overwrite or claim the previous box. Repeated pending lines, local undo, and selected-shell restart are covered.

The secondary **Tipos de peça e código** control opens the actual selected-engine predicate catalog, with Portuguese labels, field forms, rendered-Tupi reuse and optional code. New shells default to bottom-up geometry with the result above its inputs; horizontal layout remains available and persists without changing the expression. Dragging independent roots together chooses an operator/order, while explicit swapping and nested rewiring remain available. Context actions support `.var` and `.imp` chaining. Pending expressions evaluate in the real source append context; lexical/assistant context never invents a published reference.

**Revisar nova passagem** produces the actual source diff and only explicit application migrates the local draft to its reserved source identity. Pending lines publish independently at stable insertion anchors. The review can save source alone or source with explicit ground-truth approval. Section/subsection directives round-trip through source comments; clearing an inherited subsection re-emits its section, while clearing an inherited section is rejected because upstream comment inheritance cannot encode it.

Verification: build/typecheck, 54 focused domain checks, 21 desktop checks, 44 Python checks, and 22 browser scenarios pass. Native production checks with a temporary profile, disposable repositories and a vector PDF create/combine predicates, compare output with independent Python, preserve previous evidence, and restore the selected shell/metadata/tree/PDF after restart. No AI calls or original historical source/reference changes. See [workflow contract](../design/next-passage.md) and [handoff](session-handoffs/2026-09-17-next-passage.md).

## Canvas editing and localized failures

The primary tree is now a source-backed canvas with context menus, draggable subtrees, connection points, operand swapping, duplicate/remove/detach actions and persistent loose pieces. Empty connections remain explicit draft nodes. Source and forest edits form one undo transaction; passage/revision guards reject stale gestures. Add-piece lookup reuses rendered Tupi and unnamed structures, including successful stages of loose draft pieces. The advanced inspector starts collapsed; keyboard shortcuts, focused wheel zoom, search, fullscreen and SVG remain available.

Failed final realization now preserves independently evaluated source steps. Direct errors, dependency-blocked operations and missing connections are distinct; successful sibling results stay visible. Loose pieces evaluate asynchronously with bounded concurrency and fingerprinted caching. Moving pieces reuses existing results. A diagnostic dialog copies/exports exact source, successful steps, failure dependencies and real engine frames for a local coding agent; it starts no AI request. Partial main results cannot become translations or approved ground truth, and empty connections cannot enter source previews.

See [canvas contract](../design/canvas-editor.md) and [handoff](session-handoffs/2026-09-17-canvas-editor.md). Build/format pass; 64 focused domain checks, 10 desktop persistence checks, 2 simulated provider checks and 34 browser scenarios pass. Python checks include all-82 parity against independent execution; final native production checks on a frozen grammar copy verify gestures, restart, localized failures, fullscreen and actual diagnostic copying. External grammar edits during testing were preserved. No provider generation, historical source/reference edits, neighboring repository edits, commit or push.

## Find and reuse rendered Tupi

All lexical insertion fields now share a natural Tupi search, including tree creation/arguments/replacement, Construction, helper arguments, new passages and the global Léxico panel. Whitespace, Unicode composition, case and typographic apostrophes normalize for lookup; exact diacritics remain distinct, with relaxed matches labelled. Longer readings also find already known portions. Query text stays separate from source code, and choosing a result checks both realization and structure in the target namespace before enabling insertion. Source-local conflicting aliases can become verified expanded copies; equal spelling alone never proves equivalence.

The source/declaration index currently contains 1,188 distinct reusable structures, including unnamed subexpressions. Current changed drafts augment it, with live request-time state and rebuildable source caching across restarts. Conflicted/archived drafts without a known current namespace are excluded. Every indexed source candidate independently reproduces its surface and structural fingerprint. First build is about four seconds here; warm service search about 0.14 seconds. Two isolated Araújo77 stages cannot realize by themselves and remain explicit skipped-step diagnostics.

Verification: build/typecheck/format/whitespace checks; 11 new and 7 existing Python checks (including all-82 final parity); 47 focused browser scenarios; 2 live-draft context tests and the desktop routing regression pass. Native production checks find the actual compound from spaced spelling, insert its nine-node tree, undo to the complete original, and find a new local draft across passage navigation and restart. Historical source/lexicon/reference hashes remain unchanged. No AI calls, neighboring edits, commit or push. See [reuse contract](../design/rendered-reuse.md) and [handoff](session-handoffs/2026-09-17-rendered-reuse.md).

## Intermediate results and Portuguese operation wording

Every evaluated source step now carries its own result. Operation connections show the intermediate form inline, and the root is explicitly labeled **Resultado final**; selecting a step shows its full unabridged result. Lexical cards also show their own realization. Empty forms, scalar values, unavailable isolated stages and pending/stale results remain distinct. Isolated snapshots capture each step before its parent can modify it; previews run only after the canonical result/annotations/structure/runtime graph have been captured. All 82 Araújo final results, annotations and structures match independent execution.

Expand/collapse now uses chevrons, preserving `+`/`−` for Pydicate and the separately labelled zoom controls. A [central Portuguese terminology map](../design/operation-terms.md) supplies names and explanations in the graph, inspector and authoring menus; exact symbols remain visible as syntax. Context-specific labels require matching engine implementation/type evidence, avoiding invented grammatical roles for overloaded operators.

Verification: build/format/whitespace checks, 35 focused domain tests, 36 browser scenarios and 22 Python tests pass. Native temporary-profile Araújo81 verification displays each compound stage, creates it incrementally, verifies the root result, restores the original with undo, and confirms the historical source hash unchanged. No AI provider calls or neighboring-repository edits. See [handoff](session-handoffs/2026-09-17-step-results.md).

## Source-faithful predicate and operation tree

Árvore now projects the actual Pydicate expression, rather than using the evaluated object's graph as the authoring structure. Lexical references/values are cards; operators, methods and calls are compact selectable junctions in their connecting branches. Left/right/base/argument labels preserve ordering and grouping. Every source step remains separately addressable even when the engine freezes several steps into one `Classifier`; the realized word is not invented as a lexical node. Exact-matching runtime types/roles/dispatch remain secondary evidence.

Every scope can add an operation on either side, change/swap a binary operation, explicitly retain one child when removing it, edit method arguments/literals, or replace its expression. Reused references retain their identity until the contributor explicitly accepts a verified copied occurrence. The tree survives engine evaluation failure and disables stale-scope editing while a new parse is pending. No-op source, comments, UTF-16 spans, undo/redo, focused zoom, search, fullscreen and export are preserved. Source search finds the actual occurrences rather than their containing expressions.

Native fullscreen fills the current app window, with an application-main-frame-only permission; all other capabilities remain denied. This avoids a macOS native-transition race on immediate Escape. Verification: 23 focused domain tests, 31 browser scenarios, 6 Python regressions and 4 permission checks pass; a temporary-profile production run composes the actual word step by step, undoes to the original passage and confirms the source hash unchanged. Details are in the [operation-tree handoff](session-handoffs/2026-09-17-operation-tree.md). All 82 current Araújo expressions retain their 1,193 explicit source steps. No Studio AI provider calls or historical source/reference edits were made for this update.

## Compound annotation repair

Araújo 81 exposed an annotated internal stem as the tree title. Graph labels now show the plain stem while preserving the exact annotated `verbete` in attributes. The sibling Pydicate composition paths also now retain the existing lexical `ypy[ROOT]` metadata; the spelling `oemitymbûerypy` and source analysis are unchanged. Five Studio graph tests, five engine tests, six corpus contrasts and a native temporary-profile title check pass; all 122 historical surfaces and source/reference hashes are unchanged. The strict JSONL audit separately reports pre-existing missing location metadata at Araújo 74; records 81–82 remain unsaved. See [handoff](session-handoffs/2026-09-17-compound-annotations.md). No AI request, corpus edit or ground-truth regeneration was performed.

## Tree workspace and full-passage update

The local desktop now opens Árvore as its main editor, with exact source-occurrence editing, undo/redo, focused cursor-anchored wheel zoom, fullscreen, and cross-navigation to the active lexicon. Internal morphology copies have their own optional display; repeated real occurrences retain distinct identities. Dense trees open with first-level relationships. Stale graph clicks cannot select a different scope after raw edits, and external lexical selection opens/centers its exact scope without resetting ordinary camera interactions.

Passagens, Editor and Fonte are movable, collapsible, resizable panes; Fonte defaults to the right. Compact headers and an expandable saved-reference comparison leave room for the tree. Retained legacy drafts moved into a searchable archive without deleting their contents. The active lexicon recursively inventories composite/helper dependencies and stores separate general and occurrence interpretations with optimistic versioning, history and project export. Conditional helper dependencies are explicitly candidates; internal nodes without exact spans cannot be silently edited.

Full-passage AI scope is explicit and fresh-evaluated before provider invocation. The user's saved first-line request contained all the context but instructed translation of a selected prefix; this is repaired without rewriting the original response or making a new generation request. Earlier PDF locations now carry forward as editable drafts only when the current passage lacks its own location. A single passage-review confirmation applies the source and records ground truth; the final write checks the actual upstream-rendered surface against what was reviewed.

Current verification: build/formatter/whitespace checks pass, with 34 domain tests, 89 desktop service assertions, 62 Python tests (including all-82 runtime parity), 45 browser scenarios, 11 native production workflows, and copied-profile restart checks. Ground-truth UI confirmation was exercised only in a disposable corpus and preserved every other reference row byte-for-byte. See [workspace handoff](session-handoffs/2026-09-17-tree-workspace.md), [native report](../coverage/native-workflows.json), and [final workspace evidence](../coverage/workspace-2026-09-17/report.json). All AI generation checks for this update are simulated.

## Daily-use repair update

The real saved-session regression is now covered: 69 legacy drafts had old fingerprints and missing raw text; all 82 passages render after conservative migration in a copy of the user's profile. Human fields, revisions, and 52 retained draft identities survive. A local completion selector/button and completed/open filters persist across restart without granting reference approval.

Árvore is a distinct interactive inline SVG from evaluated Pydicate objects, with collapse/search/pan/zoom/fullscreen, actual relationship inspection and export. Codex shows durable phases, enforces cancellation/deadlines, and explicitly defaults to medium effort instead of inheriting ultra. No new generation requests were used for this repair; actual local authentication/context checks passed, while the prior model-side stall cannot be diagnosed retrospectively.

Atividade exposes durable local session/build/request logs, grouped edits, operation timings/errors, optional profile labels and JSONL export. `npm run usage -- --days 7 --json` analyzes existing logs without calling a provider. Recording begins with this version. At the preceding repair milestone, 24 domain tests, 81 desktop service assertions, 48 existing Python tests plus 3 runtime graph tests, and 29 browser scenarios passed; native copied-profile verification rendered all 82 passages. See [repair handoff](session-handoffs/2026-09-17-daily-use-repairs.md) and [logging contract](../design/usage-logging.md).

## Implemented

- Default/restored local oldtupicorpus project and Araújo passage; dark default and persistent light theme, substantial resizable source pane, separate reading/analysis/review/lexicon/AI tasks in Portuguese.
- General nested construction cards and editable raw Pydicate share one revisioned draft. Valid raw edits update the tree; incomplete text stays saved. Runtime types/subject/object information come from the selected engine. Scope-safe span edits, undo/redo, stale response checks and explicit metadata/source conflict comparison are integrated.
- Actual project lexicon/alias/compound/helper search and inspection, helper argument binding, reference vs copied occurrence, scoped definition edits with affected uses, stable lexical identities and reviewed new definitions. Real NavarroDB/SQLite search preserves separate senses, class information and provenance.
- Managed fingerprinted PDF assets, relocation/replacement detection, saved unrotated page-point regions, draw/move/resize/remove, multiple pages, zoom/rotation and restart. Scholarly page/folio/line fields remain distinct from physical PDF pages.
- One-click new-passage shells open in the ordinary tree workspace, accept empty or invalid analysis, inherit editable scholarly hierarchy and PDF guides, and retain their reserved identity until explicit source diff application.
- Atomic local draft/source persistence, stale-source detection, concrete recovery previews, authoritative verification and explicit independent reference approval. Git sharing exports a reviewable patch rather than automatically publishing source or private application data.
- Codex App Server and Claude Messages adapters with visible configuration/status, streaming/cancellation, exact input provenance, immutable original AI output and explicit acceptance. Validated history survives interruption and rejects malformed data without overwriting it. Authoring MCP supplies actual read-only context.

## Earlier milestone verification

The counts and full fidelity reports below describe the preceding milestone build. The repair handoff records current persisted-session and focused regressions.

- [All 82 Araújo expressions](../coverage/araujo.md): source/construction/span/serialization/reimport checks and actual selected-engine surface, annotations and full grammatical structure comparisons. Native UI exercised scope edits and compound lexical replacements for every expression; 560 actual TypeScript replacement probes preserve intended grouping. Tested edits do not constitute linguistic approval.
- Build and formatter pass; 17 domain tests, 62 desktop service assertions and 48 Python tests pass. Browser suite covers 23 scenarios; native production suite covers [11 contributor workflows](../coverage/native-workflows.json), with separate independent restart/failure probes. The retained original example native smoke also passes.
- [Three distinct critic rounds](../reviews/round-3-persistence-integration.md) found 13 implementation issues, fixed and independently rechecked. Every-expression UI evidence distinguishes 41 initial passes from 41 resumed passes after fixes; exact dirty dependency/source identity and post-run integration hashes are recorded.
- Nine [real Navarro queries](../coverage/navarro-queries.json) exercised headwords, Portuguese definitions and accent variants without changing the database. Codex completed/persisted a real streamed minimal linguistic request. Claude authenticated model discovery, but generation was rejected for insufficient account credit.
- `npm run doctor` verifies the recorded Python and 130 relevant corpus/engine files. Clean recorded revisions plus captured patches reproduce those hashes. Neighboring working trees retain their pre-existing changes; native tests hash-check original historical source/lexicon/reference bytes unchanged.

## Limits

Claude generation and the critic's separately denied real-corpus AI request are external verification limits, not simulated successes. The AI context currently contains textual analysis and PDF identity/coordinates, not raster page pixels. The actual historical scan has not been tested; automated PDF evidence uses a rendered vector fixture. No installer/bundled interpreter or portable private-evidence contribution archive is supplied.

Unknown engine constructs remain raw/diagnosed. Morpheme tags are real engine annotations, but arbitrary morpheme-to-internal-node alignment is not inferred. Ambiguous unmarked duplicate insertions keep orphaned evidence for manual reassociation. Explicitly edited expressions with whitespace-only opening-parenthesis prefixes may join that prefix to associate authoritative source metadata; no-op bytes remain exact, and comment-bearing prefixes receive a manual-review diagnostic. See [boundaries](../design/implementation-scope.md), [open questions](open-questions.md), and [handoff](session-handoffs/2026-09-17-next-working-studio.md).
