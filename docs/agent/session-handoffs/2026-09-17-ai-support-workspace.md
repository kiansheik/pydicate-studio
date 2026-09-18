# AI support workspace handoff

## Goal

Implement the contributor UI from the supplied AI-authoring milestone: persistent Fonte/IA support, saved diplomatic/tentative preparation, frozen scoped requests, readable alternatives and evidence, separate candidate inspection and explicit draft acceptance. Preserve the existing ground-truth shortcut and inline argument edits. Root owns the queue/store/provider integration and consolidated current-state/log documentation.

## Files inspected

Required agent index/current-state/repo-map/open-questions; supplied attachment `f8b3609c-2cda-428c-ac79-ba089d2b898a/pasted-text.txt`; shared `docs/design/ai-authoring-contract.md`; App, workspace layout/controller, SourcePane/PdfEvidence, AssistantPanel, dictionary picker, main/worker/service contracts, draft hook/types, fixture harnesses and existing native smoke patterns.

## Files changed

- New `src/components/AnalysisSupport.tsx`, `src/analysis-support.css`, `src/domain/analysis.ts` and domain tests: persisted conversation, queue, scoped tasks, feedback, lazy details, candidate projection, uncertainty/provenance, batch entry selection and explicit acceptance.
- `src/App.tsx`: central human builder stays mounted; Fonte/IA share the support pane; explicit candidate projection is read-only and separate from the human draft. Navigation shows job states without jumping on completion. Ground-truth work preserved.
- `SourcePane.tsx`, `PdfEvidence.tsx`: separate tentative Navarro input; awaited saved draft/evidence preparation; exact own-region revision; stable tab mounts and unsaved geometry/zoom cache. Inherited guides never become evidence.
- `WorkspaceLayout.tsx`, `domain/workspace.ts` and tests: v1-to-v2 layout migration keeps source pane identity, arrangement, dimensions and visibility; adds support tab.
- `AssistantPanel.tsx`: support-only configuration view with explicit save; existing history remains readable, legacy generation controls are hidden in this mode.
- `DictionaryTab.tsx`: exact dataset/index citation opening; mismatched datasets show preserved citation instead of guessing a same-spelling entry.
- `ExpressionCanvas.tsx`, `RuntimeTree.tsx`: main-node context action focuses a constituent-scoped assistant request.
- `tests/next-hook-harness.tsx`, `tests/analysis-workspace.spec.ts`, `tests/pdf-harness.tsx`, `tests/pdf-evidence.spec.ts`: deterministic renderer/IPC fixtures; no linguistic quality claim and no paid calls.
- New `scripts/smoke-analysis.mjs`: actual native owner/worker/evaluator/dictionary and managed PDF, fixture provider adapter forbidden from making real requests, actual external MCP CLI startup, reversible draft acceptance and reviewed source publication only in disposable repository copies.

## Commands run

- `npm run build` and `npm run typecheck` — passed; existing Vite bundle-size advisory remains.
- `npx vitest run src/domain/analysis.test.ts src/domain/workspace.test.ts` — 7 passed.
- `npx playwright test tests/analysis-workspace.spec.ts` — 10 behavioral assertions passed; overlapping independent runs once collided in shared trace cleanup. Critic reran with isolated output: 10/10 passed (`/tmp/pydicate-critic2-postfix-playwright`).
- `npx playwright test tests/pdf-evidence.spec.ts` — 5 passed, including real managed vector PDF preparation/hidden-tab geometry persistence.
- `npx playwright test tests/workspace.spec.ts` — 2 passed.
- `node scripts/smoke-analysis.mjs` — final integrated run passed, including actual disposable publication and history migration. No paid provider calls. Sandbox escalation was approved for Electron/test server execution.

## What worked

Typed source input remains distinct from reviewed `normalized/@target`. Submission awaits actual evidence and draft writes; a failed save creates no job and retains the user's input. Feedback and questions retain exact candidate/revision/node identities; stale questions stay readable and require a deliberate fresh follow-up. Independent alternatives do not overwrite drafts. Explicit acceptance records a durable receipt and supports undo; ordinary source/lexicon review remains separate from ground truth.

Conversations/composer survive tabs, passage navigation and restart. Compact queue summaries load full active/history details on demand, including source-only jobs with no candidates. Independent full-conversation caching prevents a composer revision from erasing transcript turns when the next summary omits them. Older responses cannot replace a newer cached conversation. Evidence summaries never pretend omitted pixels were absent.

Batch eligibility includes diplomatic text, tentative text or own saved PDF regions. Inherited guides alone are excluded. The visible image choice is propagated per item; all selected items must have available own-region pixels before an image batch is dispatched. Historical dictionary/reuse citations are marked as prior-step references, not current support.

Native full UI fixture initially passed at `/var/folders/pf/4fk62ck54h59svl6ypvj4pcm0000gn/T/studio-analysis-native-waoNsz/report.json`: actual exact saved PDF rectangle, text-only first input, pixel-enabled feedback, independent alternatives, actual evaluation, accepted draft, named lexical source preview, undo, navigation/restart, zero page errors, zero HTTP requests and unchanged original file hashes. The selected bishop dictionary sense exactly reused the existing `abareguasu` declaration rather than duplicating it.

Extended native run `/var/folders/pf/4fk62ck54h59svl6ypvj4pcm0000gn/T/studio-analysis-native-Wsfhwu/report.json` additionally passed headless production CLI startup and actual external stdio MCP initialize/guide/dictionary/create/evaluate/propose, then applied reviewed publication in the disposable corpus. Its final assertion exposed the pending-to-published analysis-history identity issue, subsequently corrected by root.

Final integrated run **passed** at `/var/folders/pf/4fk62ck54h59svl6ypvj4pcm0000gn/T/studio-analysis-native-5zCInu/report.json`. It includes all earlier coverage plus the actual external CLI, source publication and all previous history associated with the published passage ID. Original source/lexicon/ground-truth/dictionary hashes remained unchanged. The durable summary is `docs/reviews/ai-native-evidence.json`; the screenshot `analysis-support.png` was visually inspected. Dependencies were oldtupicorpus `292a28722a1790abf3f3b93083c29fbd47b4ffd0` and nhe-enga `348686045bf0791c847be3cba1b15eaae7312a11`, copied together with their current working files.

## What failed and was corrected

- Native capture/tool calls were interrupted by byte-identical source watcher refreshes closing the worker. Root now retains the existing worker for identical snapshot/fingerprint; repeated native runs passed.
- A source-review close locator incorrectly expected Cancelar; corrected to the actual Voltar sem aplicar control.
- Provider settings originally only persisted when the legacy generation action ran. Added explicit settings save plus regression; configuring providers never starts a request.
- Independent critic found wrong-alternative question feedback, lost turns after summary refresh, missing tentative/PDF batch eligibility and misleading lazy history evidence. All four were corrected and independently reprobed in `docs/reviews/ai-round-2-workflow.md`.
- Concurrent Playwright suites shared an output directory and removed each other's trace files. The isolated critic rerun passed all ten cases; this was test artifact cleanup, not an app assertion failure.

## Remaining questions / limits

Live-provider linguistic usefulness was deliberately not exercised. All inference-like behavior was deterministic fixture transport; actual local dictionary, engine, PDF pixels, IPC, MCP and publication review were exercised. Existing original corpus/grammar/reference files are read-only inputs to the native fixture; only private copies are mutated. No reference approval is performed.

The final native run confirms that the new passage exposes all earlier analysis conversation/candidates after reviewed source publication. Queue/MCP integrity reviews and consolidated documentation are owned by root and the independent critics.

## Suggested next prompt

Review the final integrated milestone and native report, then make one deliberately budgeted live-provider experiment on a copied incomplete Araújo passage to judge linguistic usefulness, source-vs-analysis interpretation and contributor feedback clarity. Keep routine verification provider-free.
