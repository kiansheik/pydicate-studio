import { useState } from 'react';
import { TranslationFields } from './TranslationFields';
import type { Studio } from '../useStudio';
import { invoke, type SourcePreview } from '../domain/authoring';
import { PdfEvidence } from './PdfEvidence';
import type { EvidenceStatus } from '../domain/evidence';
import { LexicalInput } from './AuthoringEditor';

export function NewPassageDialog({
  studio,
  draftId,
  onClose,
  onPreview,
}: {
  studio: Studio;
  draftId: string;
  onClose: () => void;
  onPreview: (preview: SourcePreview) => void;
}) {
  const draft = studio.envelope.drafts[draftId];
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [lexical, setLexical] = useState('');
  if (!draft) return null;
  async function review() {
    setBusy(true);
    setStatus('');
    try {
      await studio.persist();
      const permanentId = draftId.replace(/^pending:/, 'passage:');
      const evidence = await invoke<EvidenceStatus>('evidence_status', {
        projectId: studio.project.id,
        sourceId: studio.passage.sourceId,
        passageId: permanentId,
      });
      const preview = await invoke<SourcePreview>('source_new_preview', {
        newPassageId: permanentId,
        raw: draft.raw ?? '',
        metadata: {
          ...draft.locators,
          ...(evidence.asset && evidence.passage
            ? { evidence: { version: 1, assetId: evidence.asset.id, passageId: permanentId } }
            : {}),
          diplomatic: draft.diplomatic,
          normalized: draft.normalized,
          translation: draft.translation,
          ...(draft.translations ? { translations: draft.translations } : {}),
          notes: draft.notes,
        },
      });
      onPreview({ ...preview, pendingDraftId: draftId, draftRevisionId: draft.revisionId });
      onClose();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="review-overlay" role="dialog" aria-modal="true" aria-label="Nova passagem">
      <section>
        <h2>Nova passagem de Araújo</h2>
        <p>
          Contribua uma leitura agora e monte a análise quando estiver pronta. Este rascunho fica
          salvo neste dispositivo; a fonte só muda depois de revisar a diferença.
        </p>
        <label>
          Transcrição diplomática
          <textarea
            aria-label="Transcrição da nova passagem"
            rows={2}
            value={draft.diplomatic}
            onChange={(event) =>
              studio.editPendingDraft(draftId, { diplomatic: event.target.value })
            }
          />
        </label>
        <label>
          Leitura normalizada
          <textarea
            aria-label="Leitura normalizada da nova passagem"
            rows={2}
            value={draft.normalized}
            onChange={(event) =>
              studio.editPendingDraft(draftId, { normalized: event.target.value })
            }
          />
        </label>
        <label>
          Tradução sem idioma informado
          <textarea
            aria-label="Tradução da nova passagem"
            rows={2}
            value={draft.translation}
            onChange={(event) =>
              studio.editPendingDraft(draftId, { translation: event.target.value })
            }
          />
        </label>
        <TranslationFields
          value={draft.translations}
          onChange={(translations) => studio.editPendingDraft(draftId, { translations })}
        />
        <label>
          Notas e incertezas
          <textarea
            aria-label="Notas da nova passagem"
            rows={2}
            value={draft.notes}
            onChange={(event) => studio.editPendingDraft(draftId, { notes: event.target.value })}
          />
        </label>
        <details>
          <summary>Localização e evidência da nova leitura</summary>
          {(
            [
              ['printedPage', 'Página impressa'],
              ['folio', 'Fólio'],
              ['line', 'Linhas no texto'],
            ] as const
          ).map(([key, label]) => (
            <label key={key}>
              {label}
              <input
                aria-label={label + ' da nova passagem'}
                value={draft.locators?.[key] ?? ''}
                onChange={(event) =>
                  studio.editPendingDraft(draftId, {
                    locators: { ...draft.locators, [key]: event.target.value },
                  })
                }
              />
            </label>
          ))}
          <PdfEvidence
            projectId={studio.project.id}
            sourceId={studio.passage.sourceId}
            passageId={draftId.replace(/^pending:/, 'passage:')}
            printedPage={draft.locators?.printedPage}
            folio={draft.locators?.folio}
            lineLocator={draft.locators?.line}
          />
        </details>
        <details open={!!draft.raw}>
          <summary>Análise opcional</summary>
          <p>
            Comece com uma construção existente e edite sua estrutura depois de aplicar a nova
            passagem.
          </p>
          <LexicalInput
            label="Construção para a nova passagem"
            value={lexical}
            onChange={setLexical}
            passageId={draftId}
            sourceId="araujo_catecismo_1686"
            contextKey={draft.revisionId}
          />
          <button
            className="button"
            disabled={!lexical.trim()}
            onClick={() => studio.editPendingDraft(draftId, { raw: lexical })}
          >
            Usar construção escolhida
          </button>
          <button
            className="button"
            onClick={() =>
              studio.editPendingDraft(draftId, {
                raw: studio.draft?.raw ?? studio.passage.sourceExpression,
              })
            }
          >
            Começar com a construção atual
          </button>
          <label>
            Pydicate da nova passagem
            <textarea
              aria-label="Pydicate da nova passagem"
              value={draft.raw ?? ''}
              onChange={(event) => studio.editPendingDraft(draftId, { raw: event.target.value })}
              rows={4}
            />
          </label>
        </details>
        <p role="status">{status || studio.saveState}</p>
        <button className="button" onClick={onClose} disabled={busy}>
          Fechar e manter rascunho
        </button>
        <button
          className="button"
          disabled={busy}
          onClick={() =>
            void studio
              .persist()
              .then(() => setStatus('Rascunho salvo, mesmo sem análise executável.'))
              .catch((error) => setStatus(error.message))
          }
        >
          Salvar nova leitura
        </button>
        <button
          className="button primary"
          disabled={!draft.raw?.trim() || busy}
          onClick={() => void review()}
        >
          Revisar nova passagem
        </button>
      </section>
    </div>
  );
}
