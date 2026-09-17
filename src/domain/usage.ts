type Context = { projectId?: string; passageId?: string; revisionId?: string };
let context: Context = {};
let batch: { context: Context; count: number; start: number; fields: Set<string> } | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
export function track(
  event: string,
  details: Record<string, unknown> = {},
  extra: Record<string, unknown> = {},
) {
  void window.studio?.recordUsage?.({ event, ...context, details, ...extra }).catch(() => {});
}
export function setUsageContext(next: Context) {
  if (context.passageId !== next.passageId || context.projectId !== next.projectId) flushEdits();
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
  window.addEventListener('pagehide', flushEdits);
  window.addEventListener('error', () =>
    track('ui.error', { errorCode: 'RENDERER_ERROR' }, { outcome: 'failed' }),
  );
  window.addEventListener('unhandledrejection', () =>
    track('ui.error', { errorCode: 'UNHANDLED_REJECTION' }, { outcome: 'failed' }),
  );
}
