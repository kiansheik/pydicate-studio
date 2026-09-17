export type PdfRect = [number, number, number, number];
export interface EvidenceRegion {
  id: string;
  assetId: string;
  /** Zero-based physical PDF page; independent of printed page labels. */
  pageIndex: number;
  /** Unrotated PDF user-space points: [xMin, yMin, xMax, yMax]. */
  rect: PdfRect;
}
export interface EvidenceView {
  pageIndex: number;
  zoom: number;
  rotation: number;
}
/** A previous location is visual guidance only, never this passage's region. */
export interface EvidenceGuide {
  assetId: string;
  fromPassageId: string;
  fromOrdinal?: number;
  region?: EvidenceRegion;
}
export interface WorkingEvidence {
  assetId: string;
  revision: number;
  regions: EvidenceRegion[];
  view: EvidenceView;
  baseline?: string;
  inheritedFrom?: { passageId: string; ordinal: number };
  guide?: EvidenceGuide;
}
export function validEvidenceGuide(value: unknown, assetId: string): value is EvidenceGuide {
  if (!value || typeof value !== 'object') return false;
  const guide = value as EvidenceGuide;
  return (
    guide.assetId === assetId &&
    typeof guide.fromPassageId === 'string' &&
    guide.fromPassageId.length > 0 &&
    guide.fromPassageId.length <= 300 &&
    !/[\u0000-\u001f]/u.test(guide.fromPassageId) &&
    (guide.fromOrdinal === undefined ||
      (Number.isInteger(guide.fromOrdinal) && guide.fromOrdinal > 0)) &&
    (guide.region === undefined ||
      validWorkingEvidence(
        {
          assetId,
          revision: 0,
          regions: [guide.region],
          view: { pageIndex: 0, zoom: 1, rotation: 0 },
        },
        assetId,
      ))
  );
}
export function validWorkingEvidence(value: unknown, assetId: string): value is WorkingEvidence {
  if (!value || typeof value !== 'object') return false;
  const draft = value as WorkingEvidence;
  const view = draft.view;
  return (
    draft.assetId === assetId &&
    Number.isInteger(draft.revision) &&
    draft.revision >= 0 &&
    !!view &&
    Number.isInteger(view.pageIndex) &&
    view.pageIndex >= 0 &&
    Number.isFinite(view.zoom) &&
    view.zoom >= 0.25 &&
    view.zoom <= 4 &&
    [0, 90, 180, 270].includes(view.rotation) &&
    (draft.guide === undefined || validEvidenceGuide(draft.guide, assetId)) &&
    Array.isArray(draft.regions) &&
    draft.regions.length <= 500 &&
    draft.regions.every(
      (region) =>
        typeof region.id === 'string' &&
        region.assetId === assetId &&
        Number.isInteger(region.pageIndex) &&
        region.pageIndex >= 0 &&
        Array.isArray(region.rect) &&
        region.rect.length === 4 &&
        region.rect.every(Number.isFinite) &&
        region.rect[0] < region.rect[2] &&
        region.rect[1] < region.rect[3],
    )
  );
}
export function guideEvidence(
  donor: WorkingEvidence,
  revision: number,
  from: { passageId: string; ordinal?: number },
): WorkingEvidence {
  const region =
    donor.regions.filter((item) => item.pageIndex === donor.view.pageIndex).at(-1) ??
    donor.regions.at(-1);
  const guide: EvidenceGuide = region
    ? {
        assetId: donor.assetId,
        fromPassageId: from.passageId,
        ...(from.ordinal ? { fromOrdinal: from.ordinal } : {}),
        region: structuredClone(region),
      }
    : donor.guide
      ? structuredClone(donor.guide)
      : {
          assetId: donor.assetId,
          fromPassageId: from.passageId,
          ...(from.ordinal ? { fromOrdinal: from.ordinal } : {}),
        };
  return {
    assetId: donor.assetId,
    revision,
    regions: [],
    view: { ...donor.view },
    baseline: 'null',
    guide,
  };
}
export function inheritEvidence(
  donor: WorkingEvidence,
  revision: number,
  from: { passageId: string; ordinal: number },
): WorkingEvidence {
  return {
    assetId: donor.assetId,
    revision,
    view: { ...donor.view },
    regions: donor.regions.map((region) => ({
      ...region,
      id: crypto.randomUUID(),
      rect: [...region.rect],
    })),
    baseline: 'null',
    inheritedFrom: from,
  };
}
export interface EvidencePointer {
  version: 1;
  assetId: string;
  passageId: string;
}
export interface EvidenceStatus {
  version: 1;
  revision: number;
  projectId: string;
  sourceId: string;
  asset: null | {
    id: string;
    name: string;
    bytes: number;
    fingerprint: string;
    managedState: 'ok' | 'missing' | 'changed' | 'unreadable';
    originalState: 'ok' | 'missing' | 'changed' | 'unreadable';
  };
  passage: null | {
    regions: EvidenceRegion[];
    view: EvidenceView;
    viewAssetId?: string;
    guide?: EvidenceGuide;
  };
  guideCandidates?: { id: string; ordinal?: number }[];
  guideSeed?: null | {
    fromPassageId: string;
    fromOrdinal?: number;
    assetId: string;
    regions: EvidenceRegion[];
    view: EvidenceView;
    guide?: EvidenceGuide;
  };
  previousPassages?: { id: string; ordinal: number }[];
  inherited?: null | {
    fromPassageId: string;
    fromOrdinal: number;
    assetId: string;
    regions: EvidenceRegion[];
    view: EvidenceView;
  };
  retainedAssetCount: number;
}
export interface CoordinateViewport {
  convertToPdfPoint(x: number, y: number): number[];
  convertToViewportRectangle(rect: number[]): number[];
}
export function orderedRect(a: readonly number[], b: readonly number[]): PdfRect {
  return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])];
}
export function viewportRect(viewport: CoordinateViewport, rect: PdfRect): PdfRect {
  const corners = viewport.convertToViewportRectangle(rect);
  return orderedRect(corners.slice(0, 2), corners.slice(2));
}
export function pdfRect(viewport: CoordinateViewport, rect: PdfRect): PdfRect {
  return orderedRect(
    viewport.convertToPdfPoint(rect[0], rect[1]),
    viewport.convertToPdfPoint(rect[2], rect[3]),
  );
}
