# Embedded dictionary and unified add-piece search

## Goal

Bring the actual kiansheik.io/nhe-enga dictionary interface into Studio, locally served with entry-to-tree insertion. Follow the user's steering to centralize Adicionar peça around one natural search: existing reusable structures first, Navarro entries next, and manual constructors/code secondarily. Preserve exact lexical senses, current work and provider usage.

## Files inspected

- Agent index/current-state/repo-map/open-questions; current canvas, pending-passage and rendered-reuse contracts.
- Public dictionary root (read-only browser); local `nhe-enga/index.html`, `styles.css`, `js/index.js`, compressed dictionary, neologism CSV, source viewer and linked book assets.
- Electron main/preload/routing/worker/permissions; Studio App/useStudio/canvas model and existing palette/lookup UI; Python dictionary/runtime/authoring boundaries.
- Prior memory about source-image preservation and citation assets, verified against the current local files.

## Files changed

- `electron/dictionary-site.cjs`: bounded, read-only local site host with exact dataset version, required asset checks, source containment and independent CSP.
- `electron/dictionary/{transform.cjs,bridge.js,bridge.css}`: in-memory real-site adaptation, exact row identity, headword/+Árvore selection, local source-viewer overlay, analytics/remote-font removal. Neighboring/generated website files were not edited.
- `electron/main.cjs`, `next-service.cjs`, `python-worker.cjs`: isolated host route, dictionary status and lookup/conversion RPC integration; dictionary frame allowed while main IPC remains main-frame-only.
- `src/components/DictionaryTab.tsx`, `DictionaryEntryCreation.tsx` and styles: persistent iframe, dataset/window/origin/context checks, refresh and shared ambiguous/partial conversion UI.
- `src/components/PredicatePalette.tsx`, `LexicalInput.tsx`, `ExpressionCanvas.tsx`, `lexical-input.css`: unified default query, reusable-first groups, Navarro fallback, saved query/focus and true canvas commit result propagation. Existing general lookup semantics remain available.
- `src/App.tsx`, `useStudio.ts`: Dicionário mode, source/revision-bound insertion, main-vs-loose behavior and ordinary single-step undo.
- Python `navarro_search.py`, `authoring_runtime.py`, `authoring_service.py`: authoritative website-gzip lookup/checksum, real constructor preparation and verified verbal sense identity. Existing SQLite dictionary search remains separate.
- New dictionary unit/browser/Python tests and hook insertion coverage; extended canvas tests. README, agent state/map/log/questions, dictionary contract and three subtask handoffs.

## Commands run

- `npm run build`, TypeScript, targeted Prettier checks and `git diff --check`: passed. Vite retains its existing non-blocking large-bundle advisory.
- `node --test electron/tests/dictionary-site.test.cjs electron/tests/dictionary-transform.test.cjs electron/tests/python-worker-authoring.test.cjs electron/tests/application-permissions.test.cjs`: **15 pass**.
- `python3 -B -m unittest python.tests.test_dictionary_authoring python.tests.test_navarro -v`: **11 pass**, reported by backend subtask. Includes four actual pysyrõ senses, class ambiguity, noun/postposition/number, full-definition preservation, changed/forged identity and unchanged file hashes.
- `npx playwright test tests/canvas.spec.ts tests/rendered-lookup.spec.ts tests/dictionary-bridge.spec.ts`: **28 pass** (17 canvas, 10 lookup, 1 real website bridge).
- `tests/dictionary-tab.spec.ts` and focused `next-passage.spec.ts` insertion contract: **6 pass**. These use explicitly simulated messages/transport; the site bridge/browser and native tests use actual site data and the engine.
- `/tmp/pydicate-freeze-fixture.mjs` plus copied required website assets creates the disposable corpus/site. Native `/tmp/pydicate-dictionary-native.mjs` and `/tmp/pydicate-unified-picker-native.mjs` pass against the compiled app. Artifacts/report: `/tmp/pydicate-dictionary-native-lFSwi2/`; source fixture: `/tmp/pydicate-canvas-fixture-fwLEkx/`.
- `npm run dev` and `/tmp/pydicate-dictionary-dev.mjs`: development-origin insertion passed at `http://127.0.0.1:5173/` with another temporary profile (`/tmp/pydicate-dictionary-dev-0mB13q/`). The temporary server was stopped after verification.

## What worked

- The real dictionary searches all four pysyrõ senses, retains definitions and conjugation UI, opens local VLB scan273 in an overlay, and returns to the same query without Chrome.
- Selecting website sense9336 creates the exact corresponding Verb with its full “apossar-se” definition; sense9335 subsequently becomes a loose piece without replacing the main tree. Undo removes only that piece; the main expression survives restart.
- Unified search reuses the existing oemitymbûerypy compound from spaced text, then separately inserts dictionary sense9337 with its “impedir” definition. Reusable structures are above Navarro entries and the query survives closing/reopening.
- Ambiguous types require an explicit choice; partial results require explicit insertion with their diagnostics. Late replies cannot edit another draft revision or hidden tab.
- Production dictionary requests generated zero HTTP/S traffic. Original corpus source/lexicon/reference and website HTML/JS/dataset hashes remained unchanged. No AI, real source/reference write, neighboring edit, commit or push occurred.

## What failed and was corrected

- Website/engine gzip IDs differ from SQLite/obsolete JSON IDs. Conversion uses exact served gzip row/checksum and verifies engine verb identity; it never substitutes by headword.
- Integration review caught a UI URL validator rejecting the host's pinned dataset query, a required CSV missing from readiness checks, and no refresh for stale open dictionaries. All are fixed and covered.
- Reopening palette tests exposed query initialization and a blur-induced layout change that moved Cancel before mouseup. The default query is initialized/focused, and inline palette results remain visible on blur. Ordinary scoped autocomplete behavior remains unchanged.
- One fixture checked the property `constructor` through inherited Object.prototype; its assertion now checks an own property.
- Initial native development check started after the browser suite's Vite server had exited; no app UI was available. Starting a dedicated temporary Vite server and rerunning passed. Production checks were already passing.

## Remaining questions

- The locally selected checkout can differ from the live deployment. Source scans must exist locally. Unrelated site tools and external transcription pages are outside this dictionary integration.
- Neologism rows lack verified Navarro identity and remain consultation-only. Ambiguous classes remain contributor choices.
- Inserted pieces contain exact definitions/verbal IDs. Nonverbal dataset row/checksum is conversion-time evidence, not a separately persisted draft provenance field. Shared named lexicon declarations still require the existing reviewed source workflow.
- The tree can represent long definitions exactly; further presentation refinements can follow the user's next real authoring session.

## Suggested next prompt

Use the default add-piece search and dictionary on the next Araújo passage; report which word/sense or operation still requires switching tools or unnecessary steps. Keep provider generation checks disabled unless explicitly requested.

Subtask details: [backend and review](2026-09-17-dictionary-backend-review.md), [UI and insertion](2026-09-17-dictionary-ui-subtask.md), [site bridge and unified picker](2026-09-17-dictionary-bridge-picker.md).
