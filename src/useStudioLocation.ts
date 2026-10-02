import { useEffect, useRef, useState } from 'react';
import {
  locationKey,
  locationUrl,
  readStudioLocation,
  resolveLocationPassage,
  samePassageIdentity,
  type StudioLocation,
} from './domain/studio-location';

/** Synchronize navigation only. Drafts and editor actions never travel in the URL. */
export function useStudioLocation(options: {
  ready: boolean;
  location: StudioLocation;
  passages: { id: string; sourceId: string }[];
  apply: (location: StudioLocation) => void;
}) {
  const [error, setError] = useState('');
  const [, wake] = useState(0);
  const request = useRef<URL | null>(new URL(window.location.href));
  const pending = useRef<{ target: StudioLocation; write: 'replace' | 'push' } | null>(null);
  const previous = useRef<StudioLocation | null>(null);
  const blocked = useRef(false);
  const deliberateSelection = useRef(false);

  function write(location: StudioLocation, kind: 'replace' | 'push') {
    const url = locationUrl(new URL(window.location.href), location);
    if (url.href !== window.location.href) {
      // Preserve any unrelated application state stored by the host.
      window.history[kind === 'push' ? 'pushState' : 'replaceState'](window.history.state, '', url);
    }
    previous.current = location;
  }

  useEffect(() => {
    const restore = () => {
      request.current = new URL(window.location.href);
      pending.current = null;
      wake((value) => value + 1);
    };
    window.addEventListener('popstate', restore);
    return () => window.removeEventListener('popstate', restore);
  }, []);

  useEffect(() => {
    if (!options.ready) return;
    const snapshot = options.location;
    if (request.current) {
      const parsed = readStudioLocation(request.current);
      request.current = null;
      const passage = resolveLocationPassage(options.passages, parsed.location, snapshot.passage);
      const problem =
        parsed.error ||
        (!passage
          ? 'A passagem deste link não está disponível neste projeto. Escolha uma passagem para continuar.'
          : '');
      setError(problem);
      blocked.current = !!problem;
      previous.current = snapshot;
      if (problem || !passage) return;
      if (!parsed.explicit) {
        write(snapshot, 'replace');
        return;
      }
      const target: StudioLocation = {
        passage: passage.id,
        source: passage.sourceId,
        view: 'analysis',
        tab: 'tree',
        node: 'root',
        support: snapshot.support,
        ...parsed.location,
      };
      target.passage = passage.id;
      pending.current = { target, write: 'replace' };
      options.apply(target);
      wake((value) => value + 1);
      return;
    }
    if (pending.current) {
      if (locationKey(snapshot) === locationKey(pending.current.target)) {
        write(snapshot, pending.current.write);
        pending.current = null;
      }
      return;
    }
    if (blocked.current || !previous.current) return;
    if (deliberateSelection.current) {
      deliberateSelection.current = false;
      write(snapshot, 'push');
      return;
    }
    if (locationKey(snapshot) === locationKey(previous.current)) return;
    const changedPassage = snapshot.passage !== previous.current.passage;
    const alias = changedPassage && samePassageIdentity(snapshot.passage, previous.current.passage);
    if (
      changedPassage &&
      !alias &&
      (snapshot.node !== 'root' || snapshot.lexicon || snapshot.occurrence || snapshot.tree)
    ) {
      const target = {
        ...snapshot,
        node: 'root',
        lexicon: undefined,
        occurrence: undefined,
        tree: undefined,
        declaration: undefined,
        declarationSource: undefined,
        declarationLine: undefined,
      };
      pending.current = { target, write: 'push' };
      options.apply(target);
      return;
    }
    const onlySearchChanged =
      locationKey({
        ...snapshot,
        listQuery: previous.current.listQuery,
        lexiconQuery: previous.current.lexiconQuery,
        dictionaryQuery: previous.current.dictionaryQuery,
      }) === locationKey(previous.current);
    write(snapshot, alias || onlySearchChanged ? 'replace' : 'push');
  });

  return {
    error,
    dismissError() {
      if (!blocked.current) return;
      blocked.current = false;
      setError('');
      // Wait for the caller's batched passage selection before writing history,
      // including when it chooses the passage already visible behind the notice.
      deliberateSelection.current = true;
    },
  };
}
