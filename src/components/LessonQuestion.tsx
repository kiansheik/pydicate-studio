import { useEffect, useState } from 'react';
import { MessageCircle, Send, Square } from 'lucide-react';
import { invoke } from '../domain/authoring';
import { isAIEvent, mergeAIRecords, type AIRecord, type AIStatus } from '../domain/ai';
import type { Lesson } from '../domain/learning';
import type { Passage, StudioProject } from '../domain/types';

export function LessonQuestion({
  lesson,
  raw,
  project,
  passage,
}: {
  lesson: Lesson;
  raw: string;
  project: StudioProject;
  passage: Passage;
}) {
  const [question, setQuestion] = useState('');
  const [status, setStatus] = useState<AIStatus | null>(null);
  const [records, setRecords] = useState<AIRecord[]>([]);
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);
  useEffect(() => {
    let current = true;
    const relevant = (record: AIRecord) => record.context.learningLessonId === lesson.id;
    void invoke<AIStatus>('ai_status')
      .then((value) => {
        if (current) setStatus(value);
      })
      .catch((e) => {
        if (current) setError(String(e));
      });
    const refresh = () =>
      void invoke<AIRecord[]>('ai_history', { projectId: project.id, passageId: passage.id })
        .then((value) => {
          if (current) setRecords(value.filter(relevant));
        })
        .catch((e) => {
          if (current) setError(String(e));
        });
    refresh();
    const timer = setInterval(refresh, 5000);
    const unsubscribe = window.studio?.onEvent?.((event) => {
      if (
        current &&
        isAIEvent(event) &&
        event.projectId === project.id &&
        event.passageId === passage.id &&
        event.result &&
        relevant(event.result)
      )
        setRecords((values) => mergeAIRecords(values, event.result!));
    });
    return () => {
      current = false;
      clearInterval(timer);
      unsubscribe?.();
    };
  }, [lesson.id, project.id, passage.id]);
  const active = records.find((record) => record.status === 'streaming');
  return (
    <section className="lesson-question" aria-label="Perguntas da lição">
      <h3>
        <MessageCircle size={17} /> Pergunte sobre esta construção
      </h3>
      {records.map((record) => (
        <article key={record.requestId}>
          <p>
            <strong>Você:</strong> {String(record.context.learningQuestion ?? '')}
          </p>
          <p className="lesson-ai-answer">
            {record.suggestion?.explanation || record.text || 'Preparando resposta…'}
          </p>
          {record.error && <p role="alert">{record.error}</p>}
          {record.status === 'cancelled' && <p>Solicitação cancelada.</p>}
        </article>
      ))}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!status || !question.trim() || starting || active) return;
          setStarting(true);
          setError('');
          void invoke('ai_start', {
            requestId: crypto.randomUUID(),
            provider: status.config.provider,
            action: 'explain',
            projectId: project.id,
            passageId: passage.id,
            revisionId: `lesson:${crypto.randomUUID()}`,
            context: {
              learningLessonId: lesson.id,
              learningQuestion: question,
              sourceId: lesson.sourceId,
              ordinal: lesson.ordinal,
              raw,
              scope: 'passage',
              engineFingerprint: project.engineFingerprint,
              historicalTarget: lesson.reference,
              description: `Dúvida de uma pessoa aprendendo a usar Pydicate. Lição: ${lesson.title}. Explique em português brasileiro, com passos pequenos no editor e código equivalente. Não proponha publicação nem aprovação. Pergunta: ${question}`,
            },
          })
            .then(() => setQuestion(''))
            .catch((e) => setError(String(e)))
            .finally(() => setStarting(false));
        }}
      >
        <label>
          Minha pergunta
          <textarea
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            maxLength={4000}
            rows={3}
          />
        </label>
        <small>
          {status
            ? `${status.config.provider} · ${status.config.models[status.config.provider]}`
            : 'Consultando a configuração de IA…'}
        </small>
        <div className="learning-actions">
          <button className="button" disabled={!status || !question.trim() || starting || !!active}>
            <Send size={15} /> Enviar pergunta à IA
          </button>
          {active && (
            <button
              type="button"
              className="button"
              onClick={() =>
                void invoke('ai_cancel', { requestId: active.requestId }).catch((e) =>
                  setError(String(e)),
                )
              }
            >
              <Square size={14} /> Parar
            </button>
          )}
        </div>
      </form>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
