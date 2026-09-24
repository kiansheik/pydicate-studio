/** Flush local notebook edits before freezing an AI request's interpretation. */
type Saver = { save: () => Promise<void>; pending?: Promise<void>; attached: boolean };
const savers = new Map<string, Map<string | symbol, Saver>>();
export const LEXICAL_NOTES_CHANGED = 'studio:lexical-notes-changed';

function run(saver: Saver) {
  const pending = saver.save();
  saver.pending = pending;
  return pending;
}

export function registerLexicalNoteSaver(
  projectId: string,
  save: () => Promise<void>,
  key: string | symbol = Symbol(),
) {
  const registered = savers.get(projectId) ?? new Map<string | symbol, Saver>();
  savers.set(projectId, registered);
  const previous = registered.get(key)?.pending;
  // A remount owns the same buffered note. Let an older in-flight write settle
  // before retrying with the remounted editor's current fields/version.
  const saver: Saver = {
    save: () => (previous ? previous.catch(() => {}).then(save) : save()),
    attached: true,
  };
  registered.set(key, saver);
  return () => {
    saver.attached = false;
    // Failed writes remain registered. A later request must retry/report them;
    // it must never silently capture the older persisted interpretation.
    void run(saver)
      .then(() => {
        if (registered.get(key) === saver && !saver.attached) registered.delete(key);
        if (!registered.size && savers.get(projectId) === registered) savers.delete(projectId);
      })
      .catch(() => {});
  };
}

export async function flushLexicalNotes(projectId: string) {
  // Registration may change while an editor's final write is in flight.
  // Drain replacements/new editors before freezing the request as well.
  const completed = new Set<Saver>();
  while (true) {
    const pending = [...(savers.get(projectId)?.values() ?? [])].filter(
      (saver) => !completed.has(saver),
    );
    if (!pending.length) return;
    await Promise.all(pending.map(run));
    pending.forEach((saver) => completed.add(saver));
    const registered = savers.get(projectId);
    for (const [key, saver] of registered ?? []) {
      if (completed.has(saver) && !saver.attached) registered?.delete(key);
    }
    if (registered && !registered.size) savers.delete(projectId);
  }
}

export function notifyLexicalNotesChanged(projectId: string) {
  window.dispatchEvent(new CustomEvent(LEXICAL_NOTES_CHANGED, { detail: { projectId } }));
}
