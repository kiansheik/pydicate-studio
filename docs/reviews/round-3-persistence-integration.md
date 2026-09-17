# Independent critic — round 3: persistence and integration

This round uses a fresh native Electron profile, disposable copies containing the current dirty corpus, real local engine evaluation, and separate local failure contracts. It is distinct from Round 1 source fidelity and Round 2 contributor interactions.

## Findings and fix verification

### R3-01 — High: valid edits of 0028/0029 cannot produce a source preview (fixed; verified)

Select 0028 or 0029, choose the root card and apply **Negar esta parte**. The editor immediately emits valid code and the selected engine evaluates it. Requesting a source preview fails because the resulting file has mismatched parentheses. The source service inserts its metadata note at the AST operand line, which is inside the concrete expression span when its first physical line contains only `(`. That insertion overlaps the expression replacement. Historical files remain unchanged because preview compilation rejects the malformed result.

The two exact candidates and errors are retained in [initial all-expression UI evidence](round-3-all-expression-ui-initial.json); see [0028 screenshot](round-3-all-expression-screenshots/failure-0028.png) and [0029 screenshot](round-3-all-expression-screenshots/failure-0029.png). This is why original-expression evaluation or a redundant-parentheses leaf test was insufficient.

The writer now anchors metadata before the physical opening line and joins only a whitespace-only leading parenthesis prefix onto the first operand line, where the authoritative corpus parser can associate the directives. The candidate AST remains unchanged. The resumed native test independently passed both rows with root negation and a compound lexical replacement, actual engine evaluation and full-source preview/re-import. I also read and reran `python3 -B -m unittest python.tests.test_authoring.CorpusCopyTests.test_multiline_opening_parentheses_apply_metadata_with_same_identity -v`: it applied both cases in a disposable corpus and verified unchanged identity, new notes/translation, inherited locators, the existing inline comment, byte-stable repeated preview and restart. A prefix containing a comment is preserved and explicitly rejected with `SOURCE_METADATA_ANCHOR`; the writer does not relocate that comment silently.

### R3-02 — Medium: valid JSON with corrupt AI-record fields is accepted as completed history (fixed; verified)

The independent child-process review found that persisted history validated identity/version but accepted records with `text: 42`, a string instead of the acceptance array, and missing revision/context/timestamps. This allows malformed persisted data to reach the contributor history as a completed response. The reproduction does not involve a provider or historical corpus: [test](../../tests/critic-ai-restart.test.cjs), [initial evidence](round-3-ai-crash-evidence.json). Renderer failure is a risk inferred from the contract, not a claimed native crash.

The service now validates complete durable records before either history display or acceptance, including the filename/identity binding, context hash, revision, output, status, timestamps, human acceptance events and absence of editorial approval. The critic reran the independent test: **3/3 passed**, including the formerly failing structurally corrupt JSON case. Corrupt bytes remain intact. The evidence retains the initial failure and separately records the passing verification and implementation hash.

### R3-03 — Medium: metadata-only conflicts could not be compared (fixed; verified)

An external translation change correctly triggered conflict detection, but the initial comparison showed only two identical Pydicate strings. The UI now shows source/draft transcription, normalized reading, translation, notes and locators. Native reproduction changed only the new passage's source translation. Both distinct translations appeared before explicit reassociation; the user's draft and external file remained separate afterward.

## Native persistence evidence

Five substantive native scenarios passed in [round-3-native-evidence.json](round-3-native-evidence.json):

1. A new reading with blank analysis, translation, uncertainty, printed page 42, folio 21v and lines 3–5 saved with a PDF region and reopened automatically after Electron restart.
2. Invalid `credo(` saved and reopened; later reviewed application of `credo(tayra)` retained the reserved passage ID and PDF region, transferred independent human fields, and removed the pending draft only after successful source application. Another existing passage's incomplete draft survived that restart as well.
3. A source file changed externally after review caused the pending application to fail; every external byte remained unchanged.
4. The metadata-only conflict displayed both versions; explicit reassociation retained the human draft and did not overwrite the external source.
5. The source recovery UI presented a concrete restoration diff and restored the exact previous bytes.

No renderer `pageerror` was recorded. Successful Studio writes no longer trigger the false external-edit alert; real subsequent external edits still do.

## Independent failure evidence

[Source failure probes](round-3-source-failure-evidence.json) passed five separate cases: injected interruption at atomic replacement preserves the original and recovery journal; restoration is byte exact; two identical amém expressions carry their explicit IDs/notes through reordering and restart; an ambiguous unmarked duplicate insertion does not silently claim the prior ID; changing a copied engine file rejects the previous engine fingerprint. All writes targeted disposable corpus/engine copies.

The reviewed and rerun local contracts passed: 15 provider/draft/watcher tests, eight delayed parse/render/undo/project/stale-preview browser tests, and two AI result-binding tests. These use explicitly synthetic transports and do not count as authenticated provider connections. The additional three child-process AI crash/corruption tests passed after the fix: the test reached an actual persisted partial checkpoint, terminated its own child, recovered the same partial/project/passage/revision, surfaced interruption, rejected ID reuse and accepted a distinct retry; malformed JSON and structurally corrupt records remained untouched.

## Full current corpus rerun

The complete read-only audit and independent TypeScript probes were rerun: 82/82 original expressions matched direct selected-engine surface, annotations and structural snapshots; every concrete span and unchanged-source byte check passed; 560 TypeScript compound replacements preserved intended AST scope. [Audit summary and exact commands](round-3-audit-summary.json).

The separate native every-expression sweep completed **82/82 UI workflows**: root negation and a selected lexical constituent replacement with `entry + amen`, immediate Pydicate emission, actual engine output comparison, full-source preview/re-import and undo back to the exact original raw expression and output. Both sets of 82 candidates evaluated successfully; no renderer page errors occurred, and the disposable source stayed byte-identical. The chosen changes test editing and scope, not their linguistic adequacy. [Every-expression table](round-3-all-expression-ui.md), [exact candidates and results](round-3-all-expression-ui.json), [reproducible native script](../../scripts/critic-all-ui.mjs).

The result combines 41 successful rows from the initial run and 41 from the resumed run after the writer fix. Each row labels its run. The initial run exposed R3-01 and was interrupted when a concurrent audit-generator edit correctly invalidated the implementation fingerprint; its later stale-engine errors are not compatibility failures. Original source and selected dirty dependency content were the same across both runs. Repository metadata was recovered by reopening the exact disposable project immediately after completion; current authoring UI hashes are explicitly a post-run capture. The lead confirmed that the intervening `useStudio.ts` write was formatter-only; the initial production bundle was not retained, so byte-identical bundles across the two runs are not claimed. Future script runs capture opened-project provenance before interactions and check UI-file hashes after them.

## External verification limits

The recorded provider-agent evidence shows real authenticated Codex generation on a minimal linguistic prompt and real Claude authentication. Claude message generation is blocked by the account's insufficient API credit balance. This critic's separate request to send real corpus context through the native translation UI was rejected by automatic approval review and was not sent. Provider configuration, local crash/failure contracts and the provider-agent smoke remain explicitly different kinds of evidence.

The facsimile used in automated PDF checks is a real rendered vector PDF fixture, not the historical Araújo scan. Coordinate behavior and persistence are verified; scholarly region selection and linguistic adequacy still require human review. Ambiguous unmarked source identities remain explicitly subject to reassociation rather than automatic evidence transfer.

## Final review status

All three Round 3 implementation findings have fixes independently verified at the stated boundaries. Round 1, Round 2 and Round 3 were distinct substantive reviews with their own failures, corrections and reruns. No reported implementation finding remains open in this review. The real-corpus AI UI request remains blocked by automatic approval review, and Claude generation remains blocked by account credits; neither is counted as a successful connection test. This conclusion is specific to the recorded source, dependency content and exercised interactions, and does not grant linguistic or editorial approval.
