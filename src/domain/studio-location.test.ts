import { describe, expect, it } from 'vitest';
import {
  locationUrl,
  readStudioLocation,
  resolveLocationPassage,
  samePassageIdentity,
  type StudioLocation,
} from './studio-location';

const uuid = 'ad5f6be7-c2c9-46d1-ad66-b348aaec07cc';
const location: StudioLocation = {
  passage: `passage:${uuid}`,
  source: 'araujo',
  view: 'lexicon',
  tab: 'tree',
  node: 'root.left',
  support: 'source',
  lexicon: "'u / seî",
  occurrence: 'occurrence:1',
};

describe('shareable Studio locations', () => {
  it('round trips lexical and node identities without replacing unrelated URL data', () => {
    const url = locationUrl(new URL('https://studio.test/?unrelated=ok#anchor'), location);
    expect(readStudioLocation(url)).toEqual({ location, explicit: true, error: '' });
    expect(url.searchParams.get('unrelated')).toBe('ok');
    expect(url.hash).toBe('#anchor');
    expect(locationUrl(new URL('file:///app/index.html'), location).protocol).toBe('file:');
  });

  it('rejects ambiguous, malformed and unpinned locations', () => {
    for (const search of [
      'passage=a&passage=b',
      'passage=%00bad',
      'view=unknown',
      'tab=unknown',
      'dictionary=4',
      'dictionary=-1&dataset=abc',
      'source=',
      'tree=enosem&declaration=only-one-coordinate',
      'dictionary=1000001&dataset=abc',
      `node=${'a'.repeat(1025)}`,
    ])
      expect(readStudioLocation(new URL(`https://studio.test/?${search}`)).error).not.toBe('');
  });

  it('canonicalizes default filters and numeric identities before restoring state', () => {
    const result = readStudioLocation(
      new URL('https://studio.test/?filter=all&dictionary=001&dataset=abc&node=object'),
    );
    expect(result.error).toBe('');
    expect(result.location).toEqual({ dictionary: '1', dataset: 'abc', node: 'root' });
  });

  it('resolves published aliases by full UUID, not position or partial IDs', () => {
    const published = { id: `passage:${uuid}`, sourceId: 'araujo' };
    const pending = { id: `pending:${uuid}`, sourceId: 'araujo' };
    expect(resolveLocationPassage([pending, published], { passage: pending.id }, '')).toBe(
      published,
    );
    expect(resolveLocationPassage([pending], { passage: published.id }, '')).toBe(pending);
    expect(
      resolveLocationPassage([published], { passage: published.id, source: 'other' }, ''),
    ).toBeUndefined();
    expect(resolveLocationPassage([published], { passage: '119' }, published.id)).toBeUndefined();
    expect(samePassageIdentity('pending:1', 'passage:1')).toBe(false);
  });

  it('can locate a source without creating a passage', () => {
    const passage = { id: 'first', sourceId: 'araujo' };
    expect(resolveLocationPassage([passage], { source: 'araujo' }, '')).toBe(passage);
    expect(resolveLocationPassage([passage], { source: 'empty' }, '')).toBeUndefined();
  });
});
