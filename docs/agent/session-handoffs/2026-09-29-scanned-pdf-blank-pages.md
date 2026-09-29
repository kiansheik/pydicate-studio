# Scanned PDFs rendering as blank pages

## Goal

A PDF attached during a live session must show its pages in that same session.
In a public demonstration a newly created source accepted a PDF through
**Vincular PDF à fonte**, reported the document loaded, and then rendered every
page white, with no error and no way to recover except reloading — and the
reload did not help either, because the cause was not the session at all.

## Cause

PDF.js keeps its image decoders and font data outside the bundle. JBIG2,
JPEG 2000 and ICC colour are WebAssembly modules, and the standard fonts and
predefined CMaps are fetched per document, all from URLs the embedder must
supply (`wasmUrl`, `standardFontDataUrl`, `cMapUrl`, `iccUrl`). Studio supplied
none of them, so on any page needing one the worker warned
`Unable to decode image "img_p0_1": "JpxError: OpenJPEG failed to initialize"`,
skipped the picture and completed the render *successfully*. A scan is one large
image per page, so the whole page was blank while every status said ready.

JBIG2 — the usual codec for bitonal historical scans — has no JavaScript
fallback at all in pdfjs-dist 5.4.624; JPEG 2000 has one. Both Content Security
Policies also had `script-src 'self'`, which blocks WebAssembly compilation, so
even a correct URL would not have been enough. The existing fixtures are
vector-only PDFs, which need none of this, which is why every test passed while
real digitisations failed. `electron/evidence-images.cjs` had the same gap: a
crop sent to an analysis would have been a blank white image.

## Files changed

- `src/domain/pdf-assets.ts` (new): the support-file URLs, resolved against the
  document base so one definition serves every page of the application.
- `src/domain/pdf-document.ts`, `src/components/PdfEvidence.tsx`: pass them to
  both `getDocument` calls (cached hosted range transport and the direct path).
- `src/components/PdfEvidence.tsx`: after a render completes, report a picture
  PDF.js could not decode instead of leaving a silently blank page. PDF.js
  resolves such an image with no data, on the page or the common objects.
- `vite.config.ts`: copy `wasm`, `cmaps`, `standard_fonts` and `iccs` from
  `pdfjs-dist` into `dist/pdfjs` at build time, and serve the same paths in dev.
- `server/http.cjs`: serve `/pdfjs/<dir>/<file>` from the built application to
  authenticated readers, `application/wasm` for `.wasm`, and allow
  `'wasm-unsafe-eval'` in the policy.
- `electron/main.cjs`: the same policy addition; the `studio://app` handler
  already serves everything under `dist`.
- `electron/evidence-images.cjs`: point Node at the installed package's own
  decoders and fonts, so an analysis crop of a scan is the actual imagery.
- `electron/tests/pdf-scan-fixture.cjs` (new): a scan-shaped two-page fixture,
  page 1 JPEG 2000 and page 2 JPEG, so a blank page 1 beside a drawn page 2
  isolates a missing codec from a broken document pipeline.
- Tests: `tests/pdf-evidence.spec.ts` (attach-in-session for both the desktop
  bridge and the hosted range transport, undecodable-image reporting, support
  files served), `server/tests/source-workflow.test.cjs` (the hosted demo flow
  now uploads a scan and measures drawn pixels), `server/tests/http.test.cjs`
  (policy, `.wasm` serving, authentication and path limits),
  `scripts/smoke-desktop.mjs` (the packaged origin compiles all three decoders).
- `scripts/smoke-next.mjs`, `scripts/smoke-desktop.mjs`: the previous
  `!policy.includes('unsafe-eval')` assertion also matched `'wasm-unsafe-eval'`;
  both now reject only a real script-eval token.

## Commands and results

- Reproduced first: with the old configuration the new hosted test fails on
  `The uploaded scan is drawn in the same session, without a reload`, and the
  saved screenshot shows the demo's white page under a ready interface.
- `server/tests/source-workflow.test.cjs` with `COLLAB_FULL_EDITOR=1` and
  `COLLAB_REAL_PROJECT=/Users/kian/code`, real compiled app, real server policy,
  browser upload: passes in 7.6 s, page drawn with no decoder warning and no
  alert, region saved, reopened after reload still drawn.
- `tests/pdf-evidence.spec.ts`: 27 passed, including the two new attach-in-session
  tests, which fail without the fix.
- Full browser suite: 311 passed. 251 domain tests, 284 desktop tests,
  hosted suite 65 passed / 8 conditional skipped, desktop smoke passed.
- `renderRegion` on the JPEG 2000 fixture returns the actual picture (verified
  by inspecting the produced PNG), where before it returned blank white.
- Disposable PostgreSQL on port 56544 for the hosted tests; removed afterwards.

## Remaining questions

The historical Araújo scan itself is still not attached, so real-world CMap,
font and JBIG2 documents remain untested against actual pages; the fixture
proves the machinery, not every document. `dist` grows by about 3.6 MB, fetched
only when a document needs it. Whether the demo PDF was JBIG2 or JPEG 2000 was
not established from the failure itself; both are covered.

## Suggested next prompt

Attach a real historical scan and confirm its pages, text selection and crops;
if a page ever renders blank again, the interface now names the undecodable
image, so start from that message and the worker warnings.
