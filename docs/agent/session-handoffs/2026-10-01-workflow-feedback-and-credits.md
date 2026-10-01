# Workflow feedback and contributor credits — 2026-10-01

## Goal

Make layout direction always accessible, reflect completed references accurately,
reduce translation-model usage, align lexical discovery with Navarro, keep PDF
guides tied to current passage order, and preserve per-user publication-credit
evidence with active time per platform/passage and distinct contributed passages.

## Inspected and changed

Inspected the agent guide/state/map/questions, relevant runtime/test modules,
read-only Navarro website ranking, live Codex model metadata and production disk.
No neighboring repository or generated corpus source was edited.

Changed App/PassageNavigator/ExpressionCanvas and their status/styles/tests;
SourcePane/PdfEvidence/evidence domain/service/tests; lexical search helpers and
their dictionary/structure/passage consumers; provider service, translation guide,
AssistantPanel and provider tests; foreground activity domain/usage/bridge,
hosted audit/reporting/admin modules and tests; agent state/map/log and this note.

## Commands and results

- `npm run typecheck`, `npx vite build`, `git diff --check`: pass. Vite retains
  the existing large-bundle advisory.
- Focused provider/real-engine translation context checks: 68 pass; no provider
  inference. Official documentation plus live model catalog confirm Luna/medium.
- Status domain: four checks; status/navigation/orientation/provider browser
  checks pass, including 800×600 layout and preserved grammar settings.
- PDF domain/backend: 15/17 pass; 29 real-PDF browser cases pass in the final full run. An earlier
  coordinate-drawing timing failure passed unchanged both in isolation and the final run.
- Lexical search: 15 Python and five domain checks pass, plus actual Navarro
  dataset probes. Exact saved identities and structural equality are retained.
- Activity clock: three deterministic domain and three browser checks pass, including
  trusted interaction, passage switching, hidden/unfocused/idle exclusion and
  content-free payloads. The real dictionary iframe relays trusted activity with
  origin/source/dataset validation and five-second throttling; a 75-second test
  proves continued activity beyond the idle cutoff. PostgreSQL/HTTP and rollout results follow below.

## Behavior and limits

Only explicit completion/reference approval changes completion state. Older
review submissions no longer mask completion; a newer submission reopens review.
Inherited PDF guides are display context, not owned evidence or a save trigger.
Search folding affects discovery only. Codex translations use Luna at medium;
grammar keeps its configured model/effort. The annotation legend is a reading aid,
not a new linguistic analysis, and leaves unknown codes explicit.

Activity requires visible/focused recent interaction, is capped at 30 seconds per
report, stops after 60 seconds idle, and is deduplicated across tabs by the server.
Past saved contributions are recoverable; past working hours are unknown. Reports
preserve checkpoint counts separately and never credit merely asking AI to work.
Grammar-only filesystem changes without attributable passage/publication receipts
remain in analysis history, outside the confirmed passage-credit total.

## Credit verification

Twelve disposable PostgreSQL/HTTP/research tests and a focused region-delta
receipt check pass. Initial source baselines, empty pending shells, camera
geometry and failed requests do not earn passage credit. Detached piece content
does. Legacy PDF saves without a geometry-change receipt remain separately
reported as unclassified. No database migration is needed. Five real hosted-bridge browser tests cover
server clock calibration (computer clocks eight hours ahead/behind), one bounded
retry with the same receipt, keepalive, and permanent/stale failure handling.

## Remaining questions and suggested next prompt

The next requested translation can assess actual Luna translation quality; routine
tests made no paid generation. For publication, export the all-time administrative
credit report and review saved contribution categories alongside editorial approval.
Review grammar-only receipts separately if they should contribute to publication
acknowledgments beyond the passage counts.

## Production rollout

Committed/pushed `c1167671f31fcc31afb8e1fad499a8085e786487` on
`unlocked-light-deploy`; ran `STUDIO_REF=unlocked-light-deploy make collab-deploy-light`.
Healthy in 52.5 seconds; PostgreSQL stayed running, no migrations or research
imports. Database checkpoint: `20261001T114920-c6b720`. Fresh corpus health:
158 lines, zero divergences/failures, three pending, 327 morphemes, no active
repairs (2.928 seconds). Exact pre/post SHA256 parity for all 145 tracked research
files and six PDF/evidence files. The model profile, provider-free actual-tree
translation prompt and administrative report were also verified through live APIs.

Real production Chrome verification also passed: visible orientation control,
current-order evidence guide metadata, fourteen visible completed rows without
stale waiting labels, Luna/medium translation setup, administrative credit table,
and three browser activity receipts. No API/page errors or attempted research
mutations in the final read-only run. Screenshot retained privately under
`.local/vps-qa/workflow-polish.png`; no generation was requested. Earlier smoke
harness attempts clicked the layout toggle (correctly blocked its draft save),
assumed the translation tab opened AI setup, and mishandled the empty selection
cleanup response. Those harness errors were corrected; product code was unchanged.
