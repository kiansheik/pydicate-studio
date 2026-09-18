import type { SourcePreview } from '../domain/authoring';
import type { RenderResult } from '../domain/types';

export function reviewKind(preview: SourcePreview) {
  if (preview.reviewSummary) return preview.reviewSummary.kind;
  if (preview.kind === 'recovery') return 'recovery';
  if (preview.kind === 'lexicon' || preview.name) return 'lexicon';
  if (preview.newPassage || preview.pendingDraftId || preview.kind === 'new-passage')
    return 'passage-new';
  if (preview.passageId || preview.targetPassageId || preview.kind === 'source')
    return 'passage-update';
  return 'unknown';
}

export function sourceReviewTitle(preview: SourcePreview) {
  const kind = reviewKind(preview);
  if (kind === 'recovery') return 'Revisar recuperação';
  if (kind === 'lexicon') return 'Revisar entrada do léxico';
  if (preview.lexicalAdditions?.some((entry) => !entry.reused)) return 'Revisar passagem e léxico';
  if (kind === 'passage-new') return 'Revisar nova passagem';
  if (kind === 'passage-update') return 'Revisar passagem';
  return 'Revisar alterações';
}

function definitionExcerpt(definition: string) {
  const compact = definition.replace(/\s+/g, ' ').trim();
  if (compact.length <= 180) return compact;
  const boundary = compact.lastIndexOf(' ', 180);
  return compact.slice(0, boundary > 100 ? boundary : 180) + '…';
}

function SummaryValue({ value, label }: { value: string; label: string }) {
  const excerpt = definitionExcerpt(value);
  return (
    <>
      <p>
        <span>{label}</span> {excerpt}
      </p>
      {excerpt.endsWith('…') && (
        <details>
          <summary>Ler conteúdo completo</summary>
          <p className="source-review-full-definition">{value}</p>
        </details>
      )}
    </>
  );
}

export function SourceReviewContent({
  preview,
  hasChanges,
  currentPassageId,
  draftRevisionId,
  draftRaw,
  engineFingerprint,
  result,
  pending,
}: {
  preview: SourcePreview;
  hasChanges: boolean;
  currentPassageId: string;
  draftRevisionId?: string;
  draftRaw?: string;
  engineFingerprint: string;
  result: RenderResult | null;
  pending: boolean;
}) {
  const kind = reviewKind(preview);
  const passageReview = kind === 'passage-new' || kind === 'passage-update';
  const belongsToCurrentDraft =
    passageReview &&
    (preview.pendingDraftId ?? preview.passageId ?? preview.targetPassageId) === currentPassageId &&
    !!preview.draftRevisionId &&
    preview.draftRevisionId === draftRevisionId;
  const currentResult =
    belongsToCurrentDraft &&
    result?.revisionId === draftRevisionId &&
    result?.engineFingerprint === engineFingerprint &&
    result?.expression === draftRaw
      ? result
      : null;
  const additions = preview.lexicalAdditions ?? [];
  const newCount = additions.filter((entry) => !entry.reused).length;
  const reusedCount = additions.length - newCount;
  const summary = preview.reviewSummary;
  return (
    <>
      <p className="source-review-intro">
        {!hasChanges
          ? 'Nenhuma alteração para aplicar.'
          : kind === 'passage-new'
            ? 'Esta passagem será acrescentada ao texto.'
            : kind === 'passage-update'
              ? 'Esta edição atualiza a passagem. A versão anterior fica disponível para recuperação.'
              : kind === 'lexicon'
                ? 'Confira a palavra e seu significado. A edição atualiza a entrada do léxico e pode afetar outras passagens que a utilizam.'
                : kind === 'recovery'
                  ? 'Esta ação restaura o conteúdo preservado antes de uma edição anterior.'
                  : 'Confira as alterações antes de aplicar. Os detalhes técnicos estão disponíveis abaixo.'}
      </p>
      {belongsToCurrentDraft && (
        <section className="source-review-result" aria-label="Resultado atual do rascunho">
          <h3>Resultado atual do rascunho</h3>
          <p lang="tpw">
            {pending
              ? 'Avaliando a leitura atual…'
              : currentResult?.evaluationStatus === 'partial'
                ? 'Há etapas da árvore que ainda precisam de ajuste.'
                : currentResult
                  ? currentResult.surface || 'A estrutura atual não produz uma forma escrita.'
                  : 'Ainda não há um resultado completo para esta revisão.'}
          </p>
        </section>
      )}
      {!!preview.definitionRepairs?.length && (
        <section aria-label="Significados separados nesta revisão" className="source-review-notice">
          <h3>Significado do conjunto corrigido</h3>
          {preview.definitionRepairs.map((repair, index) => (
            <p key={index}>
              A definição de <strong lang="tpw">{repair.compound}</strong> estava na peça{' '}
              <strong lang="tpw">{repair.base}</strong>. Esta revisão cria a entrada do conjunto e
              restaura o significado individual da peça.
            </p>
          ))}
        </section>
      )}
      {!!additions.length && (
        <section className="source-review-words" aria-label="Palavras desta revisão">
          <h3>Palavras no léxico</h3>
          <p>
            {[
              newCount ? `${newCount} ${newCount === 1 ? 'nova entrada' : 'novas entradas'}` : '',
              reusedCount
                ? `${reusedCount} ${reusedCount === 1 ? 'entrada reutilizada' : 'entradas reutilizadas'}`
                : '',
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
          <ul>
            {additions.map((entry) => {
              const definition = entry.definition?.trim() ?? '';
              const excerpt = definitionExcerpt(definition);
              return (
                <li key={entry.name}>
                  <div>
                    <strong lang="tpw">{entry.headword || 'Entrada sem forma escrita'}</strong>
                    <span>{entry.reused ? 'Já no léxico' : 'Adicionar ao léxico'}</span>
                  </div>
                  <p>{excerpt || 'Sem significado informado.'}</p>
                  {definition && excerpt.endsWith('…') && (
                    <details>
                      <summary>Ler definição completa</summary>
                      <p className="source-review-full-definition">{entry.definition}</p>
                    </details>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
      {!!summary?.fields?.length && (
        <section className="source-review-changes" aria-label="Outras alterações desta revisão">
          <h3>{kind === 'recovery' ? 'Conteúdo a recuperar' : 'O que muda'}</h3>
          <dl>
            {summary.fields.map((field, index) => (
              <div key={`${field.label}:${index}`}>
                <dt>{field.label}</dt>
                <dd>
                  {field.before && (
                    <div className="source-review-before">
                      <SummaryValue label="Antes:" value={field.before} />
                    </div>
                  )}
                  <SummaryValue
                    label={field.before ? 'Depois:' : 'Novo valor:'}
                    value={field.after || 'Removido'}
                  />
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}
      {summary?.analysisChanged && kind === 'passage-update' && (
        <p>A estrutura da passagem também será atualizada.</p>
      )}
      {preview.regression && (
        <section aria-label="Regressão antes de publicar">
          <h3>Regressão conferida</h3>
          <p>
            {preview.regression.checked} passagens avaliadas · {preview.regression.references}{' '}
            referências coincidem. Nenhuma nova falha nas passagens preservadas.
          </p>
          {!!preview.regression.baselineIssues && (
            <p>
              {preview.regression.baselineIssues} diferenças ou falhas já existiam antes desta
              edição.
            </p>
          )}
          {!!preview.regression.pendingReferences && (
            <p>
              {preview.regression.pendingReferences} passagens editadas aguardam revisão da
              referência.
            </p>
          )}
        </section>
      )}
      {!!preview.diagnostics?.length && (
        <p className="source-review-notice">
          O motor registrou {preview.diagnostics.length}{' '}
          {preview.diagnostics.length === 1 ? 'observação' : 'observações'}. Os detalhes estão na
          visualização técnica.
        </p>
      )}
      <details className="source-review-technical" key={preview.previewId}>
        <summary>Mostrar diff técnico</summary>
        {!!preview.diagnostics?.length && (
          <section aria-label="Diagnósticos desta revisão">
            <h3>Observações do motor</h3>
            {preview.diagnostics.map((message, index) => (
              <p key={index}>{message}</p>
            ))}
          </section>
        )}
        {preview.name && (
          <p>
            Entrada: <code>{preview.name}</code> · {preview.scope} · usos afetados:{' '}
            {JSON.stringify(preview.affectedUses ?? [])}
          </p>
        )}
        {!!additions.length && (
          <section className="source-review-lexicon" aria-label="Nomes usados na passagem">
            <h3>Nomes usados na passagem</h3>
            <table>
              <thead>
                <tr>
                  <th>Nome no léxico</th>
                  <th>Palavra</th>
                  <th>Entrada</th>
                </tr>
              </thead>
              <tbody>
                {additions.map((entry) => (
                  <tr key={entry.name}>
                    <td>
                      <code title={entry.expression}>{entry.name}</code>
                    </td>
                    <td>{entry.headword || '—'}</td>
                    <td>{entry.reused ? 'Já existente' : 'Nova entrada'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
        {preview.files?.length ? (
          <div className="source-review-files" aria-label="Arquivos desta revisão">
            {preview.files.map((file) => (
              <section className="source-review-file" key={file.path} aria-label={file.path}>
                <h3>{file.path}</h3>
                <pre>{file.diff || 'Nenhuma alteração neste arquivo.'}</pre>
              </section>
            ))}
          </div>
        ) : (
          <pre>{preview.diff || 'Nenhuma alteração na fonte.'}</pre>
        )}
      </details>
    </>
  );
}
