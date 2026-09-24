# Persistent PDF evidence, version 1

The Electron main process owns a managed copy of each explicitly selected PDF (maximum 100 MiB). The source binding survives navigation and application restart. The renderer obtains only the currently bound asset bytes through the project-authorized IPC bridge; it cannot supply an arbitrary read path.

`electron/evidence-service.cjs` exports `createEvidenceService({stateDirectory, chooseFile})`, whose `invoke(method, params)` handles `evidence_status`, `evidence_attach`, `evidence_relocate`, `evidence_bytes`, and `evidence_save`. The chooser runs in main and returns one selected absolute path or null. Every request contains `projectId`, `sourceId`, and `passageId`. Mutations require `expectedRevision`; region saves also contain `assetId`, `regions`, and `view`.

The selected bytes are copied and fingerprinted with SHA-256 before the binding is written. Managed copies live in `assets/<sha256>.pdf`; source manifests live in `sources/<sha256([projectId,sourceId])>.json` under the application evidence directory. A version-1 manifest contains a revision, original asset references, the selected asset, and passage geometry/view preferences. Saves serialize by source, validate before persistence, fsync temporary files, and atomically rename. Invalid manifests remain untouched. Stray interrupted temporary writes do not supersede the last complete manifest.

The original file and managed copy are checked separately. A moved or replaced original does not change the managed witness. “Relocalizar mesmo PDF” accepts only identical bytes. “Vincular outro testemunho” is an explicit replacement action: old asset copies and their regions remain retained, and only regions belonging to the new SHA-256 are displayed. Returning to an earlier witness by selecting those same bytes restores its retained regions. A changed managed copy cannot be rendered or receive new saved annotations until recovered with matching bytes.

## Coordinate and metadata contract

Each region is `{id, assetId, pageIndex, rect}`. The region ID is a UUID, `pageIndex` is a zero-based **physical PDF page**, and `rect` is `[xMin,yMin,xMax,yMax]` in unrotated PDF user-space coordinates. PDF.js viewport inverse/forward transformations convert pointer positions and overlay rectangles; the stored values do not change when zoom, pane width, device pixel ratio, intrinsic page rotation, or additional viewing rotation changes. Multiple regions may reference different physical pages.

`view` stores `{pageIndex,zoom,rotation}` independently of geometry. Physical page controls display one-based page numbers. The page remembered by the passage is reopened, with its matching region selected. Four corner handles resize; dragging a region moves it. Deleting a region is saved explicitly. The scroller is vertically resizable; source-column width belongs to the surrounding reading desk.

Printed page label, folio, and textual line locator are **source scholarly metadata**, supplied by the authoritative corpus adapter and displayed separately. The evidence store does not copy or reinterpret them. In particular, upstream page/section/subsection inheritance must be preserved by `authoring.source_annotations`; textual lines do not inherit.

After an explicit region save, `PdfEvidence.onEvidence` proposes `{version:1,assetId,passageId}` for the source review workflow. Supported source syntax is a `# @note studio:v1 {...}` note containing the stable `passageId` and an `evidence` pointer. An invented `@studio-evidence` directive would be rejected by the upstream parser and must not be emitted. Applying this pointer remains a separate, explicitly reviewed corpus action; it is not a second transcription, translation, approval, or locator store.

Uncommitted region/view changes are cached locally by project/source/passage and can be exported as JSON. They survive navigation and renderer reload. A stale manifest revision prevents overwrite, retains the local draft, and offers export followed by explicit reload/discard. Region drafts are distinct from saved corpus evidence. Source-wide revision guards conservatively treat another passage's evidence save as a conflict for an older local draft.

## Guide for the next passage

The primary new-line workflow passes `newPassageGuide` and an evidence-bound `previousPassageId` to `PdfEvidence`. The current passage starts with no regions. Its predecessor's current view and last region appear as a muted, noninteractive guide; drawing through this shadow creates a new independent region. The next-page control changes only the new passage's view.

`WorkingEvidence.guide` and optional saved `passage.guide` contain `{assetId,fromPassageId,fromOrdinal?,region?}` separately from `regions`. The renderer first checks the explicit predecessor's unsaved cache, then saved evidence, earlier source passages and same-source saved history. Every candidate is bound to the selected PDF fingerprint. Repeated pending lines carry the earlier guide when no new box exists, while retaining the latest view. Their own cache and explicit saves preserve this state across restart. A guide-only save emits no source-evidence pointer. Existing unmarked passages also use this separate guide: visiting a previous passage never creates owned regions for the next one. Their own saved or cached locations always win. Historical saved rectangles and drafts are not silently migrated or deleted.

## Verification and limits

- `npx vitest run src/domain/evidence.test.ts`: five checks distinguish copied evidence from a separate visual guide, cover repeated pending lines and reject invalid guide identities/geometry.
- `node --test electron/tests/evidence.test.cjs`: nine actual filesystem tests cover managed-copy restart, relocation, different-witness rejection/explicit replacement, retained old geometry, concurrent stale saves, corrupt manifests, interrupted temporary files, damaged managed copies, invalid geometry, and read-only pending guide lookup/persistence.
- `npx playwright test tests/pdf-evidence.spec.ts`: four Chrome tests use the actual evidence service in disposable directories and PDF.js canvas rendering. An original two-page vector fixture supplies a known blue physical rectangle; a pixel check verifies real drawing. Tests cover drawing, moving, corner resizing, multiple pages including intrinsic PDF rotation, removing, zoom, viewport resizing, saved rotation/view/geometry, service restart, renderer reload, passage return, correct unsaved-draft association, noninteractive guides, drawing through the shadow, guide-only saves, and repeated pending lines.
- The service restart test creates a fresh service instance and reloads Chrome. Native Electron process restart and production CSP/worker integration require the application's native smoke; these browser checks alone do not establish them.
- No tracked Araújo PDF was found by targeted `rg --files` searches in the neighboring corpus and engine repositories. A historical scan has not been validated in this subtask. Source images are never recolored. No PDF is downloaded, auto-selected, or copied from neighboring repositories.
- Password-protected or unsupported documents surface the renderer error without discarding the linked file. The current renderer uses PDF.js and its bundled worker with system-font fallback; less common PDF image codecs/fonts may require additional bundled PDF.js resources. Those formats are not covered by the vector fixture.
- Evidence is durable on this machine. Exporting a source-comment pointer alone does not distribute the managed PDF or region manifest to another contributor; a portable evidence bundle remains separate future work.

PDF.js API contract: [official Mozilla documentation](https://mozilla.github.io/pdf.js/api/draft/api.js.html). The installed dependency is pinned to `pdfjs-dist` 5.4.624.

## Opening and focusing saved regions

Opening a passage with saved evidence selects region 1, loads its physical PDF
page and centers its viewport rectangle after rendering. Clicking any region
repeats page navigation and centering, including a repeated click after manual
scrolling. Zoom and rotation are retained; drawing gestures are not interrupted.
A new passage without owned regions may use a predecessor's last region as a
guide, retaining deliberate saved guide navigation. Inserted passages cannot
borrow a later passage's region as preceding evidence.
