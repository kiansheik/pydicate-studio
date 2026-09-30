# Production nasal mo audit and correction

## Original repair

Inspected the live server rather than the older local grammar checkout. Job
`766e8439-edec-4704-8ac3-1b1ae6d069f6` changed `VerbAugmentor.compose` with a
20-line override. A temporary `mõ` copy reused nasal composition sandhi, then
restored written `mo`. This was neither a dictionary synonym nor a whole-engine
rewrite. Other dirty grammar files belong to other repairs.

The first attempt timed out after roughly five minutes; its continuation finished
about four minutes later. The job added a test but did not run unittest. Grammar
edits were already live before the job became `ready-for-review`; passage/reference
approval is a separate operation. Historical job records remain unchanged.

Independent fresh-process comparison against that job's baseline checked all 150
corpus rows, including duplicate expressions, with unchanged source fingerprints,
surfaces and annotations. The original focused suite passed 28 tests. This does
not establish linguistic correctness of unpublished contributor drafts.

## Requested correction

Kian clarified that Emerson meant causative attachment with `*`, and explicitly
requested both the grammar correction and repair of Emerson's saved tree.

- Remove the `VerbAugmentor.compose` override.
- In the initial `VerbAugmentor.__mul__` attachment, nasalize the copied stem
  using `AnnotatedString.nasaliza_prefixo()` only for bare `mo.var(2)` and only
  when the existing nasal-stem guard allows it. Keep written `mo` and its prefix
  tag, transitivity, augmentee and augmentor.
- Ordinary `mo`, `mo.var(1)` (`mbo`) and subsequent argument application retain
  their behavior. `/` returns to ordinary composition.
- Replace only `((((mo).var(2)))) / (pytá)` with the corresponding `*` subtree
  in pending passage `ad5f6be7-c2c9-46d1-ad66-b348aaec07cc`, Araújo ordinal 114,
  diplomatic transcription `Atâra mombytá.`. Preserve all other draft fields.

The corrected component produces `mombytá`, annotated
`mo[CAUSATIVE_PREFIX:MO]mbytá`. Emerson's complete current draft changes from
`mombytáatar` to `atara oîmombytá`; it applies the nominal `atara` as a verbal
argument. Whether the desired sentence instead requires a different argument
configuration or verbal form remains an editorial question, not a sound-rule fix.

## Validation and application

Staged on the server in `/data/operations/mo-causative-20260930`, with recovery
copies of only affected grammar files and this exact draft. Nothing was exported
from the production corpus or private job records to the local filesystem.

The selected-engine staging process explicitly asserts the imported module path;
the corpus's lexicon bootstrap otherwise selected the original engine. After
fixing that staging setup, all 29 focused tests passed, including nasal onsets,
nasal blocking, annotation preservation, unchanged ordinary/mbo contrasts,
input immutability, transitivity and subsequent argument application. Full corpus
comparison passed: 150 checked, zero changes/failures, 149 matching references.

Applied to production with file-hash and draft-version guards, immutable
before/after revision history, an administrative audit event, and restoration
of grammar files if the final verification or database transaction fails.
Initial attempts stopped before changing live files because Emerson's claim
was still renewing. Kian explicitly authorized overriding it. A temporary
maintenance client blocked the open editor during the transaction; the account
was not disabled. Applied at 2026-09-30T03:07:01.996Z as draft version 36,
history revision 922, draft revision `8a77e3d8-0a98-4c89-ac06-717b86d74d41`.
Post-write production checks passed all 29 tests and unchanged output for 150
corpus rows. A separate database read verified that only raw, revisionId and
updatedAt changed and that immutable history contains the exact before/after
versions. Fresh evaluation of the actual persisted tree confirmed
`atara oîmombytá`. The maintenance claim was released. Live grammar changes remain
uncommitted and were not copied into the local neighboring grammar repository.
The separate local Studio UI work is not deployed.

Automatic approval review rejected broad record export and a query returning
snippets from unrelated drafts. Safer server-side comparisons and identifier-only
checks succeeded; the latter found only Emerson's draft using this variant.
