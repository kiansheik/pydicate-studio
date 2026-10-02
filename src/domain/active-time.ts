export type ActiveInterval = {
  durationMs: number;
  intervalStartMs: number;
  intervalEndMs: number;
};

/** Count observed foreground activity, not an open tab's lifetime. */
export class ActiveTime {
  private cursor: number;
  private lastInput = -Infinity;
  private foreground: boolean;
  constructor(
    private now: () => number,
    private epochOffset: number,
    foreground: boolean,
    private emit: (interval: ActiveInterval) => void,
  ) {
    this.cursor = now();
    this.foreground = foreground;
  }

  flush() {
    const now = this.now();
    const end = Math.min(now, this.lastInput + 60_000);
    // Sleeping/throttled tabs never claim an unobserved long interval.
    const start = Math.max(this.cursor, end - 30_000);
    if (this.foreground && end > start)
      this.emit({
        durationMs: Math.floor(end - start),
        intervalStartMs: Math.floor(this.epochOffset + start),
        intervalEndMs: Math.floor(this.epochOffset + end),
      });
    this.cursor = now;
  }

  input() {
    const now = this.now();
    if (!this.foreground) return;
    if (now > this.lastInput + 60_000) this.flush();
    this.lastInput = now;
  }

  setForeground(value: boolean) {
    if (value === this.foreground) return;
    this.flush();
    this.foreground = value;
    // Returning to a tab is observable activity, but initial page load is not.
    if (value) this.lastInput = this.now();
  }
}
