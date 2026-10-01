import { describe, expect, it } from 'vitest';
import { ActiveTime, type ActiveInterval } from './active-time';

describe('credit activity clock', () => {
  function clock(foreground = true) {
    let time = 0;
    const intervals: ActiveInterval[] = [];
    const timer = new ActiveTime(
      () => time,
      1_000_000,
      foreground,
      (value) => intervals.push(value),
    );
    return {
      timer,
      intervals,
      at: (value: number) => {
        time = value;
      },
    };
  }

  it('does not count initial loading, hidden time or inactive reading beyond one minute', () => {
    const c = clock();
    c.at(10_000);
    c.timer.flush();
    expect(c.intervals).toEqual([]);
    c.timer.input();
    c.at(40_000);
    c.timer.flush();
    c.at(70_000);
    c.timer.flush();
    c.at(100_000);
    c.timer.flush();
    expect(c.intervals.map((item) => item.durationMs)).toEqual([30_000, 30_000]);
    c.timer.setForeground(false);
    c.at(110_000);
    c.timer.input();
    c.at(120_000);
    c.timer.flush();
    expect(c.intervals).toHaveLength(2);
  });

  it('splits intervals on passage changes and focus loss without overlapping time', () => {
    const c = clock();
    c.timer.input();
    c.at(7_000);
    c.timer.flush(); // old passage
    c.at(12_000);
    c.timer.setForeground(false); // new passage
    c.at(30_000);
    c.timer.setForeground(true);
    c.at(35_000);
    c.timer.flush();
    expect(c.intervals).toEqual([
      { durationMs: 7_000, intervalStartMs: 1_000_000, intervalEndMs: 1_007_000 },
      { durationMs: 5_000, intervalStartMs: 1_007_000, intervalEndMs: 1_012_000 },
      { durationMs: 5_000, intervalStartMs: 1_030_000, intervalEndMs: 1_035_000 },
    ]);
  });

  it('bounds a suspended tab and starts a fresh interval when activity resumes', () => {
    const c = clock();
    c.timer.input();
    c.at(600_000);
    c.timer.input();
    c.at(601_000);
    c.timer.flush();
    expect(c.intervals.map((item) => item.durationMs)).toEqual([30_000, 1_000]);
    expect(c.intervals[1].intervalStartMs).toBe(1_600_000);
  });
});
