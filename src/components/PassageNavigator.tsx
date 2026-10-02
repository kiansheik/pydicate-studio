import { useEffect, useRef, useState, type ReactNode } from 'react';
import { BookOpen, ChevronDown, ChevronRight } from 'lucide-react';
import { groupPassages, passageGroupPath } from '../domain/passage-navigation';
import { sourceLabel } from '../domain/sources';
import { analysisLabels, type AnalysisJob } from '../domain/analysis';
import { submissionKey, submissionLabels, type SubmissionSummary } from '../domain/submissions';
import type { Draft, Passage, StudioSource } from '../domain/types';
import { passageStage, passageStatusLabels, passageSubmission } from '../domain/passage-status';
import './PassageNavigator.css';

export function PassageNavigator({
  projectId,
  passages,
  sources,
  drafts,
  selectedId,
  onSelect,
  jobs = [],
  submissions = {},
  filterKey = '',
  revealMatches = false,
  revealKey = '',
  ready = true,
}: {
  projectId: string;
  passages: Passage[];
  sources: StudioSource[];
  drafts: Record<string, Draft>;
  selectedId: string;
  onSelect: (id: string) => void;
  jobs?: AnalysisJob[];
  submissions?: Record<string, SubmissionSummary>;
  filterKey?: string;
  revealMatches?: boolean;
  revealKey?: string;
  ready?: boolean;
}) {
  const groups = groupPassages(passages, drafts);
  const selectedPath = passageGroupPath(groups, selectedId);
  const pathKey = JSON.stringify(selectedPath);
  const context = `${projectId}:${filterKey}`;
  const [expanded, setExpanded] = useState<{ context: string; choices: Record<string, boolean> }>({
    context,
    choices: {},
  });
  const choices = expanded.context === context ? expanded.choices : {};
  const selected = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!ready) return;
    setExpanded((current) => ({
      context,
      choices: {
        ...(current.context === context ? current.choices : {}),
        ...Object.fromEntries(selectedPath.map((key) => [key, true])),
      },
    }));
    const frame = requestAnimationFrame(() =>
      selected.current?.scrollIntoView({ block: 'nearest' }),
    );
    return () => cancelAnimationFrame(frame);
  }, [context, selectedId, pathKey, revealKey, ready]);

  function group(
    id: string,
    label: string,
    count: number,
    level: 'source' | 'section' | 'subsection',
    children: ReactNode,
  ) {
    const open = choices[id] ?? (revealMatches || selectedPath.includes(id));
    return (
      <section className={`passage-accordion passage-accordion-${level}`} key={id}>
        <button
          className="passage-group-toggle"
          aria-expanded={open}
          onClick={() => setExpanded({ context, choices: { ...choices, [id]: !open } })}
          title={label}
        >
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          {level === 'source' && <BookOpen size={14} />}
          <span>{label}</span>
          <small>{count}</small>
        </button>
        {open && <div className="passage-group-content">{children}</div>}
      </section>
    );
  }
  function row(passage: Passage) {
    const draft = drafts[passage.id];
    const job = jobs.find((item) => item.passageId === passage.id);
    const submission = passageSubmission(passage, draft, submissions[submissionKey(passage.id)]);
    const stage = passageStage(passage, draft, submission);
    const showJob =
      job && (stage !== 'complete' || ['queued', 'running', 'cancelling'].includes(job.status));
    return (
      <button
        key={passage.id}
        ref={selectedId === passage.id ? selected : undefined}
        className={`passage-item ${selectedId === passage.id ? 'active' : ''} ${stage === 'complete' ? 'is-complete' : ''}`}
        onClick={() => onSelect(passage.id)}
        aria-current={selectedId === passage.id ? 'page' : undefined}
      >
        <span className="passage-item-top">
          <span className="ordinal">{String(passage.ordinal).padStart(4, '0')}</span>
          {passage.analysis && <span className="editable-dot" title="Editor visual disponível" />}
        </span>
        <span className="passage-reading" lang="tpw">
          {draft?.normalized || draft?.diplomatic || passage.acceptedReference || 'Por transcrever'}
        </span>
        <span className="passage-status">
          <span className={`status-dot ${stage}`} />
          {submission ? submissionLabels[submission.status] : passageStatusLabels[stage]}
          {showJob && <span className="analysis-nav-badge">IA · {analysisLabels[job.status]}</span>}
        </span>
      </button>
    );
  }
  return (
    <div className="passage-list passage-navigation" aria-label="Passagens por seção">
      {groups.map((source) => {
        const count = source.sections.reduce(
          (total, section) =>
            total +
            section.subsections.reduce((sum, subsection) => sum + subsection.passages.length, 0),
          0,
        );
        const catalog = sources.find((item) => item.id === source.id);
        return group(
          `source:${source.id}`,
          catalog ? sourceLabel(catalog) : source.id,
          count,
          'source',
          source.sections.map((section) => {
            const subsections = section.subsections.map((subsection) =>
              subsection.title ? (
                group(
                  subsection.id,
                  subsection.title,
                  subsection.passages.length,
                  'subsection',
                  subsection.passages.map(row),
                )
              ) : (
                <div key={subsection.id}>{subsection.passages.map(row)}</div>
              ),
            );
            return section.title || source.sections.some((item) => item.title) ? (
              group(
                section.id,
                section.title || 'Sem seção informada',
                section.subsections.reduce(
                  (sum, subsection) => sum + subsection.passages.length,
                  0,
                ),
                'section',
                subsections,
              )
            ) : (
              <div key={section.id}>{subsections}</div>
            );
          }),
        );
      })}
      {!passages.length && <p className="empty-search">Nenhuma passagem encontrada.</p>}
    </div>
  );
}
