import { describe, expect, it } from 'vitest';
import { highlightLines, highlightSegments } from './morpheme-display';

describe('morpheme display offsets', () => {
  it('keeps exact Unicode source offsets and does not mark neighboring text', () => {
    expect(highlightSegments('🌿te\u0301 ym', [{ start: 2, end: 5 }])).toEqual([
      { text: '🌿', highlighted: false },
      { text: 'te\u0301', highlighted: true },
      { text: ' ym', highlighted: false },
    ]);
  });
  it('maps repeated words across wrapped lines through the complete final word', () => {
    expect(highlightLines('tym   tym tym', ['tym tym', 'tym'], [{ start: 10, end: 13 }])).toEqual([
      [{ text: 'tym tym', highlighted: false }],
      [{ text: 'tym', highlighted: true }],
    ]);
  });
  it('treats a literal ellipsis as part of the complete surface', () => {
    expect(highlightLines('tym…', ['tym…'], [{ start: 0, end: 4 }])).toEqual([
      [{ text: 'tym…', highlighted: true }],
    ]);
  });
  it('does not search ahead to a matching later repeat when the displayed source differs', () => {
    expect(highlightLines('a tym tym', ['tym'], [{ start: 2, end: 5 }])).toEqual([
      [{ text: 'tym', highlighted: false }],
    ]);
  });
});
