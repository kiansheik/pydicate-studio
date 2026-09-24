import type { PassageTranslations } from '../domain/types';

/** Legacy unlabelled text stays in its own field; no language is guessed. */
export function TranslationFields({
  value,
  onChange,
  disabled = false,
}: {
  value?: PassageTranslations;
  onChange: (translations: PassageTranslations) => void;
  disabled?: boolean;
}) {
  return (
    <>
      {(
        [
          ['pt', 'Tradução em português'],
          ['en', 'Tradução em inglês'],
        ] as const
      ).map(([language, label]) => (
        <label className="editor-label" key={language}>
          {label}
          <textarea
            aria-label={label}
            lang={language}
            rows={3}
            disabled={disabled}
            value={value?.[language] ?? ''}
            onChange={(event) => onChange({ ...value, [language]: event.target.value })}
          />
        </label>
      ))}
    </>
  );
}
