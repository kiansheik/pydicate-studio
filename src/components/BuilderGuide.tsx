import { useEffect, useRef, useState } from 'react';
import guide from '../domain/builder-guide.json';
import { OperationPreview, type OperationPreviewProps } from './OperationPreview';
import './BuilderGuide.css';

export function BuilderGuide({
  initialOperation,
  context,
  onClose,
  onChooseOperation,
}: {
  initialOperation?: string;
  context: Omit<OperationPreviewProps, 'raw' | 'contextKey'>;
  onClose: () => void;
  onChooseOperation?: (operation: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('Todos');
  const [expanded, setExpanded] = useState(
    guide.topics.find((topic) => topic.operation === initialOperation)?.id ?? '',
  );
  const [preview, setPreview] = useState('');
  const groups = ['Todos', ...new Set(guide.topics.map((topic) => topic.group))];
  const normalize = (value: string) =>
    value
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase();
  const topics = guide.topics.filter(
    (topic) =>
      (group === 'Todos' || topic.group === group) &&
      normalize(JSON.stringify(topic)).includes(normalize(query.trim())),
  );
  useEffect(() => {
    const element = dialog.current;
    const returnFocus = document.activeElement;
    element?.showModal();
    return () => {
      element?.close();
      if (returnFocus instanceof HTMLElement && returnFocus.isConnected) returnFocus.focus();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="builder-guide"
      aria-labelledby="builder-guide-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <header>
        <div>
          <small>Construir por etapas</small>
          <h2 id="builder-guide-title">{guide.title}</h2>
        </div>
        <button onClick={onClose}>Fechar guia</button>
      </header>
      <p>{guide.intro}</p>
      <p className="builder-guide-order">
        Por padrão, a peça arrastada fica como <strong>Segunda peça (direita)</strong>; o destino
        fica à esquerda. Use <strong>Inverter ordem das peças</strong> antes de combinar. Selecione
        uma ligação para transformar o conjunto; selecione uma palavra para transformar só aquela
        peça.
      </p>
      <label>
        O que você quer fazer?
        <input
          type="search"
          value={query}
          placeholder="Negar, base nominal, posposição…"
          onChange={(event) => {
            setQuery(event.target.value);
            setPreview('');
          }}
        />
      </label>
      <nav aria-label="Tipos de receita">
        {groups.map((value) => (
          <button
            key={value}
            aria-pressed={group === value}
            onClick={() => {
              setGroup(value);
              setPreview('');
            }}
          >
            {value}
          </button>
        ))}
      </nav>
      {topics.length === 0 && <p role="status">Nenhuma receita encontrada. Tente outro termo.</p>}
      {topics.map((topic) => (
        <details key={topic.id} open={expanded === topic.id || !!query.trim()}>
          <summary
            onClick={(event) => {
              event.preventDefault();
              setExpanded(expanded === topic.id ? '' : topic.id);
              setPreview('');
            }}
          >
            {topic.title}
          </summary>
          <p>{topic.description}</p>
          <ol>
            {topic.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          {topic.examples.map((example) => (
            <div className="builder-guide-example" key={example.expression}>
              <code>{example.expression}</code>
              <p>
                Exemplo de referência → <strong>{example.surface}</strong>
              </p>
              {example.note && <p>{example.note}</p>}
              <button onClick={() => setPreview(example.expression)}>
                Conferir este exemplo no motor atual
              </button>
              {preview === example.expression && (
                <OperationPreview
                  {...context}
                  raw={example.expression}
                  contextKey={`builder-guide:${topic.id}`}
                  label="Resultado no motor atual"
                />
              )}
            </div>
          ))}
          <p className="builder-guide-tip">{topic.tip}</p>
          {onChooseOperation && (
            <button onClick={() => onChooseOperation(topic.operation)}>
              Preparar esta operação na seleção
            </button>
          )}
        </details>
      ))}
      <footer>
        <p>
          As formas de referência foram conferidas no motor inspecionado. A prévia atual pode mudar
          com o léxico, o contexto ou a gramática. Conferir exemplos não muda seu rascunho. Preparar
          uma operação abre a prévia; você decide se aplica.
        </p>
        <p>
          Preserve a grafia e as quebras de linha do documento. Ligar peças na análise não autoriza
          juntar linhas na transcrição. O guia não estabelece uma leitura para os trechos ainda em
          discussão, incluindo “Abá marã sekoagûerĩ resé nherane’yma.”.
        </p>
        <blockquote className="builder-guide-diplomatic">{`Oito tecó catú eté rerecoáramo
Oporomöĩgobêbäe.`}</blockquote>
      </footer>
    </dialog>
  );
}
