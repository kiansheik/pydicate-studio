import { describe, expect, it } from 'vitest';
import { translationChange, translationLanguage, currentTranslation } from './translations';
describe('translation language ownership', () => {
  it('writes only the explicit PT or EN slot without guessing legacy language', () => {
    const draft = { translation: 'legacy', translations: { pt: 'português', en: 'English' } };
    expect(translationChange(draft, 'new English', 'English')).toEqual({
      translations: { pt: 'português', en: 'new English' },
    });
    expect(translationChange(draft, 'novo', 'pt-BR')).toEqual({
      translations: { pt: 'novo', en: 'English' },
    });
    expect(translationChange(draft, 'unknown', undefined)).toEqual({ translation: 'unknown' });
    expect(translationLanguage('Japanese')).toBeUndefined();
    expect(currentTranslation(draft, 'English')).toBe('English');
    expect(currentTranslation(draft, undefined)).toBe('legacy');
  });
});
