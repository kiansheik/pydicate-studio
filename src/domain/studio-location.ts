export const locationTabs = {
  tree: 'Árvore',
  suggest: 'Sugerir',
  translation: 'Tradução',
  construction: 'Construção',
  morphemes: 'Morfemas',
  history: 'Histórico',
  code: 'Código',
} as const;

export interface StudioLocation {
  passage: string;
  source: string;
  view: 'analysis' | 'reading' | 'review' | 'lexicon' | 'dictionary';
  tab: keyof typeof locationTabs;
  node: string;
  support: 'source' | 'ai';
  learning?: 'lessons' | 'reference';
  listQuery?: string;
  filter?: string;
  tree?: string;
  declaration?: string;
  declarationSource?: string;
  declarationLine?: string;
  lexiconScope?: 'entry' | 'occurrence';
  lexicon?: string;
  occurrence?: string;
  lexiconQuery?: string;
  catalog?: 'open';
  dictionary?: string;
  dataset?: string;
  dictionaryQuery?: string;
}

const keys: (keyof StudioLocation)[] = [
  'passage',
  'source',
  'view',
  'tab',
  'node',
  'support',
  'learning',
  'listQuery',
  'filter',
  'tree',
  'declaration',
  'declarationSource',
  'declarationLine',
  'lexiconScope',
  'lexicon',
  'occurrence',
  'lexiconQuery',
  'catalog',
  'dictionary',
  'dataset',
  'dictionaryQuery',
];

export function readStudioLocation(url: URL): {
  location: Partial<StudioLocation>;
  explicit: boolean;
  error: string;
} {
  const values: Record<string, string> = {};
  let explicit = false;
  for (const key of keys) {
    if (!url.searchParams.has(key)) continue;
    explicit = true;
    const value = url.searchParams.get(key)!;
    if (
      url.searchParams.getAll(key).length !== 1 ||
      !value ||
      value.length > 1024 ||
      /[\x00-\x1f\x7f]/.test(value)
    )
      return {
        location: {},
        explicit,
        error: 'O endereço contém uma localização inválida. Escolha uma passagem para continuar.',
      };
    values[key] = value;
  }
  const choices: Record<string, readonly string[]> = {
    view: ['analysis', 'reading', 'review', 'lexicon', 'dictionary'],
    tab: Object.keys(locationTabs),
    support: ['source', 'ai'],
    learning: ['lessons', 'reference'],
    lexiconScope: ['entry', 'occurrence'],
    filter: ['all', 'open', 'complete', 'submitted', 'ready', 'changes_requested', 'editable'],
    catalog: ['open'],
  };
  for (const [key, allowed] of Object.entries(choices)) {
    if (values[key] && !allowed.includes(values[key]))
      return {
        location: {},
        explicit,
        error: 'Esta visualização do link não existe. Escolha uma passagem para continuar.',
      };
  }
  if (
    values.dictionary &&
    (!/^\d{1,9}$/.test(values.dictionary) ||
      Number(values.dictionary) > 1_000_000 ||
      !values.dataset)
  )
    return { location: {}, explicit, error: 'O link do dicionário está incompleto ou inválido.' };
  if (values.filter === 'all') delete values.filter;
  if (values.dictionary !== undefined) values.dictionary = String(Number(values.dictionary));
  if (values.node === 'object') values.node = 'root';
  const declaration = [
    values.tree,
    values.declaration,
    values.declarationSource,
    values.declarationLine,
  ];
  if (
    declaration.some(Boolean) &&
    (!declaration.every(Boolean) || !/^[1-9]\d{0,7}$/.test(values.declarationLine))
  )
    return {
      location: {},
      explicit,
      error: 'O link da árvore compartilhada está incompleto ou inválido.',
    };
  return { location: values as Partial<StudioLocation>, explicit, error: '' };
}

export function locationUrl(url: URL, location: StudioLocation): URL {
  const next = new URL(url);
  for (const key of keys) {
    const value = location[key];
    if (value && !(key === 'node' && value === 'root')) next.searchParams.set(key, value);
    else next.searchParams.delete(key);
  }
  return next;
}

export function locationKey(location: StudioLocation): string {
  return JSON.stringify(keys.map((key) => location[key] || ''));
}

export function samePassageIdentity(a: string, b: string): boolean {
  if (a === b) return true;
  const uuid =
    /^(?:passage|pending):([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
  const left = uuid.exec(a),
    right = uuid.exec(b);
  return !!left && !!right && left[1].toLowerCase() === right[1].toLowerCase();
}

export function resolveLocationPassage<T extends { id: string; sourceId: string }>(
  passages: T[],
  requested: Partial<StudioLocation>,
  fallback: string,
): T | undefined {
  if (requested.passage) {
    const matches = passages.filter((item) => samePassageIdentity(item.id, requested.passage!));
    const match = matches.find((item) => item.id.startsWith('passage:')) ?? matches[0];
    return match && (!requested.source || match.sourceId === requested.source) ? match : undefined;
  }
  if (requested.source) return passages.find((item) => item.sourceId === requested.source);
  return passages.find((item) => item.id === fallback);
}
