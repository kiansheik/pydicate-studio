import { useEffect, useState } from 'react';
import { track } from './usage';

// Secondary tools stay off until the reader asks for them. The default desk carries only
// what the usage log shows in constant use; everything else is one deliberate switch away
// and never becomes unreachable.
const storageKey = 'pydicate-studio:tools:v1';
const channel = 'pydicate-studio:tools-changed';

export function readAdvancedTools() {
  try {
    const stored = localStorage.getItem(storageKey);
    if (!stored) return false;
    const value = JSON.parse(stored) as { advanced?: unknown };
    return value?.advanced === true;
  } catch {
    // A malformed or blocked store is not consent for the denser desk.
    return false;
  }
}

export function setAdvancedTools(advanced: boolean) {
  const previous = readAdvancedTools();
  try {
    localStorage.setItem(storageKey, JSON.stringify({ version: 1, advanced }));
  } catch {
    // The preference still applies to this window even when it cannot be persisted.
  }
  track('ui.tools', { action: 'advanced', changed: previous !== advanced, success: advanced });
  window.dispatchEvent(new CustomEvent(channel));
}

export function useAdvancedTools() {
  const [advanced, setAdvanced] = useState(readAdvancedTools);
  useEffect(() => {
    const sync = () => setAdvanced(readAdvancedTools());
    window.addEventListener(channel, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(channel, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);
  return advanced;
}
