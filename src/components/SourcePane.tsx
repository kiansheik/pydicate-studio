import { useEffect, useId, useRef, useState, type Ref } from 'react';
import { BookOpen, FileImage, Minus, Plus, ScanLine, X } from 'lucide-react';
import { PdfEvidence, type EvidencePreparation } from './PdfEvidence';
import type { EvidencePointer } from '../domain/evidence';
import type { Studio } from '../useStudio';
import { TranslationFields } from './TranslationFields';

export function SourcePane({
  studio,
  onEvidence,
  preparationRef,
  onAnalyze,
  analyzing,
}: {
  studio: Studio;
  onEvidence?: (value: EvidencePointer) => void;
  preparationRef?: Ref<EvidencePreparation>;
  onAnalyze?: () => void;
  analyzing?: boolean;
}) {
  const { passage, draft, edit, ready } = studio;
  const isNewPassage = passage.id.startsWith('pending:');
  const locationId = useId();
  const locators = draft?.locators;
  const sections = [
    ...new Set(
      studio.project.passages
        .filter((item) => item.sourceId === passage.sourceId)
        .map((item) => studio.envelope.drafts[item.id]?.locators?.section ?? item.witness.section)
        .filter(Boolean),
    ),
  ];
  const subsections = [
    ...new Set(
      studio.project.passages
        .filter((item) => item.sourceId === passage.sourceId)
        .map(
          (item) =>
            studio.envelope.drafts[item.id]?.locators?.subsection ?? item.witness.subsection,
        )
        .filter(Boolean),
    ),
  ];
  const [source, setSource] = useState<{ url: string; type: string; name: string } | null>(null);
  const [zoom, setZoom] = useState(100);
  const [page, setPage] = useState(1);
  const [fileError, setFileError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const isAraujo = passage.sourceId === 'araujo_catecismo_1686';
  useEffect(
    () => () => {
      if (source) URL.revokeObjectURL(source.url);
    },
    [source],
  );
  useEffect(() => {
    setSource(null);
    setZoom(100);
    setPage(passage.witness.pdfPage ?? 1);
  }, [passage.sourceId, studio.project.id, passage.witness.pdfPage]);
  const disabled = !ready;
  return (
    <section className="source-pane" aria-label="Testemunho e leitura">
      <header className="pane-heading">
        <span>
          <BookOpen size={16} /> Testemunho
        </span>
        <span className="eyebrow">FONTE PRIMÁRIA</span>
      </header>
      <div className="source-meta">
        <strong>{passage.witness.title}</strong>
        <span>
          {passage.witness.year}
          {(locators?.printedPage ?? passage.witness.printedPage)
            ? ` · p. ${locators?.printedPage ?? passage.witness.printedPage} impressa`
            : ' · página não informada'}
        </span>
      </div>
      {studio.project.mode === 'local' && (
        <details className="locator-fields source-context-fields" key={passage.id}>
          <summary>
            Seção e localização
            {(locators?.subsection || locators?.section) && (
              <span>{locators.subsection || locators.section}</span>
            )}
          </summary>
          <div className="source-context-grid">
            {(
              [
                ['printedPage', 'Página impressa'],
                ['folio', 'Fólio'],
                ['line', 'Linhas no texto'],
                ['section', 'Seção'],
                ['subsection', 'Subseção'],
              ] as const
            ).map(([key, label]) => (
              <label
                key={key}
                className={key === 'section' || key === 'subsection' ? 'context-wide' : undefined}
              >
                {label}
                <input
                  aria-label={label + ' da passagem'}
                  list={
                    key === 'section' || key === 'subsection' ? `${locationId}-${key}` : undefined
                  }
                  placeholder={
                    key === 'section' || key === 'subsection'
                      ? 'Escolha ou escreva um título'
                      : undefined
                  }
                  value={locators?.[key] ?? ''}
                  disabled={disabled}
                  onChange={(event) =>
                    edit({
                      locators: {
                        ...locators,
                        [key]: event.target.value,
                        ...(key === 'section' ? { subsection: '' } : {}),
                      },
                    })
                  }
                />
              </label>
            ))}
          </div>
          <datalist id={`${locationId}-section`}>
            {sections.map((value) => (
              <option key={value!} value={value!} />
            ))}
          </datalist>
          <datalist id={`${locationId}-subsection`}>
            {subsections.map((value) => (
              <option key={value!} value={value!} />
            ))}
          </datalist>
          <p>
            Seção e subseção continuam nas próximas passagens. A página do PDF é controlada abaixo.
          </p>
        </details>
      )}
      {studio.project.mode === 'local' ? (
        <PdfEvidence
          preparationRef={preparationRef}
          projectId={studio.project.id}
          sourceId={passage.sourceId}
          passageId={passage.id.replace(/^pending:/, 'passage:')}
          previousPassageId={draft?.pending?.previousPassageId?.replace(/^pending:/, 'passage:')}
          newPassageGuide={isNewPassage}
          disabled={!ready}
          initialPage={passage.witness.pdfPage}
          folio={locators?.folio ?? passage.witness.folio ?? undefined}
          lineLocator={
            locators?.line ??
            (passage.witness.textualLine == null ? undefined : String(passage.witness.textualLine))
          }
          printedPage={locators?.printedPage ?? passage.witness.printedPage}
          onEvidence={onEvidence}
        />
      ) : (
        <>
          <div className="source-toolbar">
            <span>
              <ScanLine size={14} /> {source ? 'Digitalização local' : 'Leitura de referência'}
            </span>
            <div className="zoom-controls">
              <button
                className="icon-button"
                aria-label="Diminuir zoom"
                onClick={() => setZoom((z) => Math.max(70, z - 10))}
              >
                <Minus size={14} />
              </button>
              <span>{zoom}%</span>
              <button
                className="icon-button"
                aria-label="Aumentar zoom"
                onClick={() => setZoom((z) => Math.min(200, z + 10))}
              >
                <Plus size={14} />
              </button>
            </div>
          </div>
          <div className={`source-stage ${source ? 'has-source' : ''}`}>
            {source ? (
              <>
                <button
                  className="source-close icon-button"
                  aria-label="Remover digitalização da sessão"
                  onClick={() => setSource(null)}
                >
                  <X size={16} />
                </button>
                {source.type === 'application/pdf' ? (
                  <object
                    aria-label="PDF do testemunho"
                    data={`${source.url}#page=${page}&zoom=${zoom}`}
                    type="application/pdf"
                  >
                    <p>O visualizador de PDF não está disponível neste navegador.</p>
                  </object>
                ) : (
                  <img
                    src={source.url}
                    alt={`Digitalização: ${source.name}`}
                    style={{ width: `${zoom}%`, maxWidth: 'none' }}
                  />
                )}
              </>
            ) : (
              <div className="reference-leaf" style={{ fontSize: `${zoom}%` }}>
                <div className="leaf-topline">
                  <span>{isAraujo ? 'ARAÚJO' : 'TESTEMUNHO'}</span>
                  <span>{passage.witness.year}</span>
                </div>
                <BookOpen size={30} strokeWidth={1} />
                <p className="leaf-title">
                  {isAraujo ? (
                    <>
                      Catecismo
                      <br />
                      <i>na língua brasílica</i>
                    </>
                  ) : (
                    passage.witness.title
                  )}
                </p>
                <span className="leaf-rule" />
                <p className="leaf-passage" lang="tpw">
                  {passage.acceptedReference ?? 'Passagem por transcrever'}
                </p>
                <div className="leaf-caption">
                  EXCERTO DO REGISTRO DO CORPUS
                  <br />A digitalização ainda não foi vinculada.
                </div>
              </div>
            )}
          </div>
          <div className="source-attachment">
            <button className="text-button" onClick={() => input.current?.click()}>
              <FileImage size={15} /> {source ? 'Trocar digitalização' : 'Adicionar digitalização'}
            </button>
            <input
              ref={input}
              type="file"
              accept="image/png,image/jpeg,image/webp,application/pdf"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                if (
                  !['image/png', 'image/jpeg', 'image/webp', 'application/pdf'].includes(file.type)
                ) {
                  setFileError('Escolha uma imagem PNG, JPEG, WebP ou um PDF.');
                  return;
                }
                if (file.size > 100 * 1024 * 1024) {
                  setFileError('Escolha um arquivo de até 100 MB.');
                  return;
                }
                setFileError('');
                setSource({ url: URL.createObjectURL(file), type: file.type, name: file.name });
                setPage(1);
                event.target.value = '';
              }}
            />
            {source && <small>Disponível nesta sessão</small>}
          </div>
          {source?.type === 'application/pdf' && (
            <label className="pdf-page">
              Página do PDF{' '}
              <input
                type="number"
                min="1"
                value={page}
                onChange={(event) => setPage(Math.max(1, Number(event.target.value) || 1))}
              />
              <small>Localização de consulta; vínculo ainda não salvo.</small>
            </label>
          )}
          {fileError && (
            <p role="alert" className="inline-error">
              {fileError}
            </p>
          )}
        </>
      )}
      <div className="reading-fields">
        <label>
          <span>
            Transcrição diplomática <span className="subtle">· como está na fonte</span>
          </span>
          <textarea
            aria-label="Transcrição diplomática"
            rows={3}
            value={draft?.diplomatic ?? ''}
            disabled={disabled}
            placeholder="Transcreva a passagem. Preserve grafia e incertezas…"
            onChange={(e) => edit({ diplomatic: e.target.value })}
          />
        </label>
        <label>
          <span>
            Grafia provável em Navarro <span className="subtle">· hipótese para a IA</span>
          </span>
          <textarea
            aria-label="Grafia provável em Navarro"
            rows={2}
            value={draft?.aiInput?.tentativeReading ?? ''}
            disabled={disabled}
            placeholder="Uma pista, mesmo incerta…"
            onChange={(event) =>
              edit({
                aiInput: {
                  ...{ tentativeReading: '', meaning: '', constraints: '' },
                  ...draft?.aiInput,
                  tentativeReading: event.target.value,
                },
              })
            }
          />
        </label>
        <label>
          <span>Significado provável</span>
          <textarea
            aria-label="Significado provável"
            rows={2}
            value={draft?.aiInput?.meaning ?? ''}
            disabled={disabled}
            onChange={(event) =>
              edit({
                aiInput: {
                  ...{ tentativeReading: '', meaning: '', constraints: '' },
                  ...draft?.aiInput,
                  meaning: event.target.value,
                },
              })
            }
          />
        </label>
        <label>
          <span>Tradução sem idioma informado</span>
          <textarea
            aria-label="Tradução"
            rows={3}
            value={draft?.translation ?? ''}
            disabled={disabled}
            placeholder="Escreva sua tradução ou revise uma sugestão da IA…"
            onChange={(event) => edit({ translation: event.target.value })}
          />
          <span className="field-hint">
            Você pode escrever e editar antes ou depois da análise.
          </span>
        </label>
        <TranslationFields
          value={draft?.translations}
          disabled={disabled}
          onChange={(translations) => edit({ translations })}
        />
        <details>
          <summary>Orientações para a análise e leitura revisada</summary>
          <label>
            Orientações linguísticas
            <textarea
              aria-label="Orientações linguísticas"
              rows={2}
              value={draft?.aiInput?.constraints ?? ''}
              disabled={disabled}
              onChange={(event) =>
                edit({
                  aiInput: {
                    ...{ tentativeReading: '', meaning: '', constraints: '' },
                    ...draft?.aiInput,
                    constraints: event.target.value,
                  },
                })
              }
            />
          </label>
          <label>
            <span>Leitura normalizada revisada · @target</span>
            <textarea
              className="tupi-input"
              rows={2}
              value={draft?.normalized ?? ''}
              disabled={disabled}
              placeholder="Somente a leitura que você já revisou…"
              onChange={(e) => edit({ normalized: e.target.value })}
            />
          </label>
          <p className="field-hint">
            A grafia provável é uma pista. Ela não substitui esta leitura revisada nem aprova ground
            truth.
          </p>
        </details>
        <p className="field-hint">
          Uma leitura já é uma contribuição. Você pode salvar sem completar a análise.
        </p>
        {onAnalyze && (
          <button
            className="button primary"
            disabled={disabled || analyzing || passage.sourceId !== 'araujo_catecismo_1686'}
            onClick={onAnalyze}
          >
            {analyzing ? 'Salvando entrada…' : 'Salvar e analisar'}
          </button>
        )}
        {passage.sourceId !== 'araujo_catecismo_1686' && onAnalyze && (
          <p className="field-hint">
            A análise assistida está disponível para Araújo nesta versão.
          </p>
        )}
      </div>
    </section>
  );
}
