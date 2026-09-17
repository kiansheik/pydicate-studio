import { describe, expect, it } from 'vitest';
import {
  guideEvidence,
  inheritEvidence,
  validWorkingEvidence,
  type WorkingEvidence,
} from './evidence';

const working: WorkingEvidence = {
  assetId: 'pdf-a',
  revision: 2,
  regions: [{ id: 'region-a', assetId: 'pdf-a', pageIndex: 1, rect: [1, 2, 30, 40] }],
  view: { pageIndex: 1, zoom: 1.5, rotation: 90 },
};
describe('PDF location inheritance', () => {
  it('copies geometry and view with new identities and explicit unconfirmed origin', () => {
    const original = JSON.stringify(working);
    const copied = inheritEvidence(working, 5, { passageId: 'previous', ordinal: 4 });
    expect(copied.view).toEqual(working.view);
    expect(copied.regions[0].rect).toEqual(working.regions[0].rect);
    expect(copied.regions[0].id).not.toBe(working.regions[0].id);
    expect(copied.revision).toBe(5);
    expect(copied.inheritedFrom).toEqual({ passageId: 'previous', ordinal: 4 });
    expect(JSON.stringify(working)).toBe(original);
  });
  it('accepts deliberate empty locations and rejects malformed or different-witness drafts', () => {
    expect(validWorkingEvidence(working, 'pdf-a')).toBe(true);
    expect(validWorkingEvidence({ ...working, regions: [] }, 'pdf-a')).toBe(true);
    expect(validWorkingEvidence(working, 'pdf-b')).toBe(false);
    expect(
      validWorkingEvidence(
        { ...working, regions: [{ ...working.regions[0], assetId: 'pdf-b' }] },
        'pdf-a',
      ),
    ).toBe(false);
    expect(
      validWorkingEvidence({ ...working, view: { ...working.view, pageIndex: -1 } }, 'pdf-a'),
    ).toBe(false);
    expect(
      validWorkingEvidence(
        { ...working, regions: [{ ...working.regions[0], rect: [4, 2, 1, 3] }] },
        'pdf-a',
      ),
    ).toBe(false);
  });
  it('keeps the last preceding box as a separate guide without adopting any evidence', () => {
    const donor = {
      ...working,
      regions: [
        ...working.regions,
        {
          ...working.regions[0],
          id: 'last',
          rect: [2, 3, 10, 20] as [number, number, number, number],
        },
      ],
    };
    const unchanged = structuredClone(donor);
    const next = guideEvidence(donor, 5, { passageId: 'passage:previous', ordinal: 3 });
    expect(next.regions).toEqual([]);
    expect(next.view).toEqual(donor.view);
    expect(next.guide).toEqual({
      assetId: 'pdf-a',
      fromPassageId: 'passage:previous',
      fromOrdinal: 3,
      region: donor.regions[1],
    });
    expect(validWorkingEvidence(next, 'pdf-a')).toBe(true);
    next.guide!.region!.rect[0] = 5;
    expect(donor).toEqual(unchanged);
  });
  it('carries earlier guidance through empty pending lines while keeping their own navigated view', () => {
    const next = guideEvidence(working, 4, { passageId: 'source' });
    next.view.pageIndex = 2;
    const following = guideEvidence(next, 7, { passageId: 'pending' });
    expect(following.regions).toEqual([]);
    expect(following.guide).toEqual(next.guide);
    expect(following.guide!.fromPassageId).toBe('source');
    expect(following.view.pageIndex).toBe(2);
    const own = { ...next, regions: [{ ...working.regions[0], id: 'new-box', pageIndex: 2 }] };
    expect(guideEvidence(own, 8, { passageId: 'pending' }).guide!.fromPassageId).toBe('pending');
  });
  it('rejects invalid guide geometry and witness/provenance identities on restart', () => {
    const next = guideEvidence(working, 4, { passageId: 'source' });
    expect(
      validWorkingEvidence({ ...next, guide: { ...next.guide, assetId: 'another' } }, 'pdf-a'),
    ).toBe(false);
    expect(
      validWorkingEvidence({ ...next, guide: { ...next.guide, fromPassageId: '' } }, 'pdf-a'),
    ).toBe(false);
    expect(
      validWorkingEvidence(
        {
          ...next,
          guide: { ...next.guide, region: { ...next.guide!.region!, rect: [5, 4, 1, 2] } },
        },
        'pdf-a',
      ),
    ).toBe(false);
  });
});
