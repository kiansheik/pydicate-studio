import type { StudioBridge } from './types';

/** Hosted capabilities are authoritative; test/example bridges may omit runtime. */
export function analysisAvailable(bridge: StudioBridge | undefined = window.studio) {
  return bridge?.runtime === 'collaborative'
    ? bridge.capabilities?.analysis === true
    : bridge?.capabilities?.analysis !== false;
}
