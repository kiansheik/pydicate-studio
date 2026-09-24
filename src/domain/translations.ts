import type { PassageTranslations } from './types';

export function isPassageTranslations(value: unknown): value is PassageTranslations {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.entries(value).every(
      ([language, text]) =>
        ['pt', 'en'].includes(language) && typeof text === 'string' && text.length <= 100000,
    )
  );
}

/** Absence and an explicitly empty translation have the same displayed value. */
export function sameTranslations(left?: PassageTranslations, right?: PassageTranslations): boolean {
  return (left?.pt ?? '') === (right?.pt ?? '') && (left?.en ?? '') === (right?.en ?? '');
}

/** Only an explicit recorded language selects a named translation slot. */
export function translationLanguage(value: unknown): 'pt' | 'en' | undefined {
  if (typeof value !== 'string') return undefined;
  const language = value.trim().toLowerCase();
  if (['pt', 'pt-br', 'pt-pt', 'português', 'portugues', 'portuguese'].includes(language))
    return 'pt';
  if (['en', 'en-us', 'en-gb', 'inglês', 'ingles', 'english'].includes(language)) return 'en';
  return undefined;
}

export function translationChange(
  current: { translations?: PassageTranslations },
  text: string,
  language: unknown,
) {
  const key = translationLanguage(language);
  return key ? { translations: { ...current.translations, [key]: text } } : { translation: text };
}

export function currentTranslation(
  current: { translation: string; translations?: PassageTranslations },
  language: unknown,
): string {
  const key = translationLanguage(language);
  return key ? (current.translations?.[key] ?? '') : current.translation;
}
