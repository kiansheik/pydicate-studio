import {
  highlightSegments,
  type HighlightRange,
  type HighlightSegment,
} from '../domain/morpheme-display';

export function MorphemeText({ text, ranges = [] }: { text: string; ranges?: HighlightRange[] }) {
  return (
    <>
      {highlightSegments(text, ranges).map((part, index) =>
        part.highlighted ? (
          <mark className="morpheme-highlight" key={index}>
            {part.text}
          </mark>
        ) : (
          <span key={index}>{part.text}</span>
        ),
      )}
    </>
  );
}
export function MorphemeSpans({ segments }: { segments: HighlightSegment[] }) {
  return (
    <>
      {segments.map((part, index) => (
        <tspan
          key={index}
          className={part.highlighted ? 'morpheme-highlight-svg' : undefined}
          data-morpheme-highlight={part.highlighted || undefined}
        >
          {part.text}
        </tspan>
      ))}
    </>
  );
}
