import type { StudioBridge } from './types';

/** Older desktop bridges predate capability flags and retain their existing tools. */
export function analysisAvailable(bridge: StudioBridge | undefined = window.studio) {
  return bridge?.runtime !== 'collaborative' && bridge?.capabilities?.analysis !== false;
}
