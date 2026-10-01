import { ActiveTime } from './active-time';

type Context = { projectId?: string; passageId?: string; revisionId?: string };
let context: Context = {};
let batch: { context: Context; count: number; start: number; fields: Set<string> } | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
let activeTime: ActiveTime | undefined;
/** Called only after validating a trusted embedded surface's activity message. */
export function markUsageActivity() {
  activeTime?.input();
}
export function track(
  event: string,
  details: Record<string, unknown> = {},
  extra: Record<string, unknown> = {},
) {
  void window.studio?.recordUsage?.({ event, ...context, details, ...extra }).catch(() => {});
}
export function setUsageContext(next: Context) {
  if (context.passageId !== next.passageId || context.projectId !== next.projectId) {
    activeTime?.flush();
    flushEdits();
  }
  context = next;
}
export function trackEdit(fields: string[]) {
  batch ??= { context: { ...context }, count: 0, start: performance.now(), fields: new Set() };
  batch.count += 1;
  fields.forEach((field) => batch!.fields.add(field));
  clearTimeout(timer);
  timer = setTimeout(flushEdits, 1500);
}
export function flushEdits() {
  clearTimeout(timer);
  if (!batch) return;
  track(
    'editor.batch',
    { editCount: batch.count, field: [...batch.fields].sort().join(',') },
    {
      ...batch.context,
      revisionId: context.revisionId,
      durationMs: Math.round(performance.now() - batch.start),
      outcome: 'changed',
    },
  );
  batch = null;
}
export function installUsageReporting() {
  if (activeTime) return;
  const foreground = () => document.visibilityState === 'visible' && document.hasFocus();
  activeTime = new ActiveTime(
    () => performance.now(),
    Date.now() - performance.now(),
    foreground(),
    (interval) => track('activity.active', {}, { ...interval, eventId: crypto.randomUUID() }),
  );
  for (const type of ['pointerdown', 'keydown', 'input', 'scroll', 'wheel'])
    window.addEventListener(
      type,
      (event) => {
        if (event.isTrusted) activeTime?.input();
      },
      { passive: true, capture: true },
    );
  const updateForeground = () => activeTime?.setForeground(foreground());
  document.addEventListener('visibilitychange', updateForeground);
  window.addEventListener('focus', updateForeground);
  window.addEventListener('blur', updateForeground);
  setInterval(() => activeTime?.flush(), 30_000);
  window.addEventListener('pagehide', () => {
    activeTime?.setForeground(false);
    flushEdits();
  });
  window.addEventListener('pageshow', updateForeground);
  window.addEventListener('error', () =>
    track('ui.error', { errorCode: 'RENDERER_ERROR' }, { outcome: 'failed' }),
  );
  window.addEventListener('unhandledrejection', () =>
    track('ui.error', { errorCode: 'UNHANDLED_REJECTION' }, { outcome: 'failed' }),
  );
}
