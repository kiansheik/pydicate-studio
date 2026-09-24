export interface HighlightRange {
  start: number;
  end: number;
}
/** A canvas selection's contribution to the exact current main result. */
export interface MorphemeSurfaceHighlight {
  passageId?: string;
  raw: string;
  revisionId?: string;
  engineFingerprint?: string;
  surface: string;
  ranges: HighlightRange[];
}
export interface HighlightSegment {
  text: string;
  highlighted: boolean;
}

export function highlightSegments(text: string, ranges: HighlightRange[]): HighlightSegment[] {
  const segments: HighlightSegment[] = [];
  let offset = 0;
  for (const character of text) {
    const highlighted = ranges.some(
      (range) => range.start < offset + character.length && range.end > offset,
    );
    const previous = segments.at(-1);
    if (previous?.highlighted === highlighted) previous.text += character;
    else segments.push({ text: character, highlighted });
    offset += character.length;
  }
  return segments;
}

/** Map wrapped labels to exact surface offsets; never match a later repeat. */
export function highlightLines(
  surface: string,
  lines: string[],
  ranges: HighlightRange[],
): HighlightSegment[][] {
  let text = '';
  const marked: boolean[] = [];
  for (const match of surface.matchAll(/\s+|[^\s]/gu)) {
    const part = /^\s/u.test(match[0]) ? ' ' : match[0];
    text += part;
    const highlighted = ranges.some(
      (range) => range.start < match.index + match[0].length && range.end > match.index,
    );
    marked.push(...Array(part.length).fill(highlighted));
  }
  let cursor = text.length - text.trimStart().length;
  return lines.map((line) => {
    while (text[cursor] === ' ') cursor++;
    if (!text.startsWith(line, cursor)) return [{ text: line, highlighted: false }];
    const spans: HighlightRange[] = [];
    for (let index = 0; index < line.length; index++)
      if (marked[cursor + index]) spans.push({ start: index, end: index + 1 });
    cursor += line.length;
    return highlightSegments(line, spans);
  });
}
