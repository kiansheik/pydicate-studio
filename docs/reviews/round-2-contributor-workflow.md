# Independent critic — round 2: contributor workflow

Native production Electron was exercised at 1440 × 1000, with its normal preload/Python bridge, a separate temporary profile and a complete disposable copy of the selected dirty corpus. The engine was referenced read-only. This review followed the real UI, not only API calls or implementation summaries.

## Verified interactions

| Workflow | Actual result |
|---|---|
| Unfamiliar constructions 0002, 0016, 0040, 0058, 0074, 0079, 0082 | All imported and displayed typed scope cards; adding a copy operation updated raw code, retained actual-engine surface and supported undo |
| Named compound | Inspected the nested `rightsidegod` definition, reused its name in the selected constituent and evaluated the reference |
| Parameterized helper | Inspected `credo` body, supplied `tayra` in its parameter field, generated `credo(x=tayra)` and obtained actual-engine output |
| Incomplete existing passage | Entered `n(îe *` in 0079, added transcription/uncertainty note, verified persisted draft and returned after navigation without losing invalid text |
| Actual Navarro sense | Searched Portuguese `casa`, selected an actual database sense, reviewed its class and source diff, applied a source-local definition and found the deterministic new name in project search |
| New executable passage | Copied current construction into the new-passage dialog, changed it to `credo(tayra)`, reviewed/applied the precise diff, and selected the newly appended passage |
| Persistent evidence editing | Attached an actual two-page vector PDF; drew native rect `[80, 360, 260, 480]`, saved it, rotated 90° and changed zoom to 150% without changing physical coordinates |
| Theme/image | Default dark UI and light option both inspected; actual PDF blue pixel remained `[13, 76, 204, 255]`, with no theme inversion |
| Provider controls | Both provider options, task selection and configuration state rendered; no simulated translation counted as success |

The original PDF probe failed because it measured a canvas point that had scrolled under the fixed header after clicking the lower drawing control. The corrected independent probe scrolls the actual canvas into view first and passes. This was a test-coordinate failure, not evidence of broken PDF drawing.

Scripts: `scripts/critic-workflows.mjs`, `scripts/critic-pdf-recheck.mjs`. Detailed results: [native evidence](round-2-evidence.json), [PDF recheck](round-2-pdf-recheck.json). Screenshots include [dark dictionary workflow](round-2-screenshots/05-navarro-sense-create-and-reuse.png) and [light native PDF](round-2-screenshots/09-pdf-recheck-light.png). No renderer `pageerror` occurred.

## Findings

### R2-01 — High: a new historical reading still requires valid Pydicate (open; fix underway)

Affected every contribution for a passage not yet in the collection. Click **Nova passagem**: the dialog accepts only raw Pydicate (or copies the current construction). Empty input disables review, invalid input is rejected, and there are no independent transcription/translation/note fields or a save-incomplete action. Existing passages support incomplete drafts correctly, but a new contributor cannot record a useful new reading without first supplying executable syntax. Add a durable pending passage draft with optional analysis and independent reading fields; applying it to executable corpus source can remain a separate explicit operation.

### R2-02 — Medium: Studio's own successful writes are announced as external changes (open; fix underway)

Affected source-local lexical creation and new-passage application. After **Aplicar edição revisada**, the UI shows **A fonte foi alterada fora do Studio** even though the same application performed and acknowledged the write. The alert consumes useful reading space and falsely implies another actor changed the source. Correlate known write completion with the file watcher while retaining real concurrent-edit detection.

### R2-03 — Low: a local pending/failed evaluation is labeled an example result (open)

Affected any local passage while no current render exists. The comparison card says **RESULTADO DO EXEMPLO** above **Avaliando…** or **Sem resultado nesta revisão**. It should retain a local/current-result label and express loading/failure independently. See the helper and PDF screenshots.

## Live-provider verification boundary

Automatic approval review rejected this critic's proposed native **translation request** because it would send corpus-derived passage/context data to an external provider and the reviewer did not consider that specific payload egress authorized. The request was removed before running the approved local workflow; no indirect request or retry was made. Therefore this independent UI round verifies provider configuration only. Existing authenticated provider-agent checks are separate evidence and must be reported as such; this round does not claim an independently completed AI translation.

## Status

The original findings above are retained as an audit trail. The independent fix verification below closes the reported application defects. Live corpus-context translation remains unverified by this critic because of the stated approval-review boundary.


## Independent fix verification — Round 3 native run

- **R2-01 fixed:** saved a new reading with blank analysis, independent transcription/translation/note and printed page/folio/line fields; linked and marked a PDF before an analysis existed; restarted Electron and recovered the open draft and its region. Invalid `credo(` also saved/reopened. Later `credo(tayra)` was explicitly reviewed/applied, preserving the reserved passage identity, human content and PDF region. The pending draft disappeared only after successful application.
- **R2-02 fixed:** the reviewed application produced no false external-edit warning. A subsequent genuine external file edit produced the warning and its stale preview was rejected without touching those external bytes.
- **R2-03 fixed:** local result labels now identify the current result independently of whether an evaluation is available. The Round 3 existing invalid draft remained an explicitly unavailable local evaluation.

Evidence: [Round 3 native workflow results](round-3-native-evidence.json). Provider configuration and synthetic failure contracts are not counted as a real translation; the independent live request limitation remains explicit.
