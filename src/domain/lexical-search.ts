// Discovery only: these spellings never replace saved identifiers or authored text.
function spellings(value: string) {
  const exact = value
    .normalize('NFC')
    .toLowerCase()
    .replace(/[’ʼ‘ʔ]/g, "'")
    .trim()
    .replace(/\s+/g, ' ');
  const folded = exact.normalize('NFD').replace(/\p{M}/gu, '');
  return [exact, folded, folded.replace(/'/g, '')];
}
function word(value: string) {
  return value.replace(/[.,/#!$%?^&*;:{}=\-_`~()\s]/g, '');
}
export function compareLexicalRanks(left: number[], right: number[]) {
  return left[0] - right[0] || left[1] - right[1] || left[2] - right[2];
}
export function lexicalQuery(query: string) {
  const needles = spellings(query);
  const words = needles.map(word);
  const tokens = needles.map(
    (needle) =>
      new RegExp(
        `(?<![\\p{L}\\p{N}_])${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}_])`,
        'u',
      ),
  );
  return (name: string, forms: string[], definitions: string[]): number[] | null => {
    if (!words[0]) return [0, 0, 0];
    if (spellings(name)[0] === needles[0]) return [-1, 0, 0];
    const ranks: number[][] = [];
    for (const value of forms) {
      spellings(value)
        .map(word)
        .forEach((form, index) => {
          const needle = words[index];
          if (!needle || !form) return;
          const rank =
            form === needle ? 0 : form.startsWith(needle) ? 2 : form.includes(needle) ? 3 : null;
          if (rank !== null) ranks.push([rank, index, 0]);
        });
    }
    for (const value of definitions) {
      spellings(value).forEach((definition, index) => {
        if (!needles[index]) return;
        const whole = tokens[index].exec(definition);
        const position = whole?.index ?? definition.indexOf(needles[index]);
        if (position >= 0) ranks.push([whole ? 1 : 5, index, position]);
      });
    }
    return ranks.sort(compareLexicalRanks)[0] ?? null;
  };
}
