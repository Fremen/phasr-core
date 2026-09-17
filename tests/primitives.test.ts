import { describe, it, expect } from 'vitest';
import {
  externalizeTime,
  estimateRemaining,
  driftCheck,
  nudgeCopy,
  completionPush,
  formatTimeHeader,
} from '../src/primitives.js';

describe('externalizeTime', () => {
  it('calculates minutes left correctly', () => {
    const now = new Date('2026-02-15T10:00:00Z');
    const end = new Date('2026-02-15T10:30:00Z');
    const result = externalizeTime(now, end);
    expect(result.minutesLeft).toBe(30);
    expect(result.warnings).toEqual([]);
  });

  it('returns warning at 10 minutes', () => {
    const now = new Date('2026-02-15T10:20:00Z');
    const end = new Date('2026-02-15T10:30:00Z');
    const result = externalizeTime(now, end);
    expect(result.minutesLeft).toBe(10);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('10 minutes left');
  });

  it('returns warning at 5 minutes', () => {
    const now = new Date('2026-02-15T10:25:00Z');
    const end = new Date('2026-02-15T10:30:00Z');
    const result = externalizeTime(now, end);
    expect(result.minutesLeft).toBe(5);
    expect(result.warnings[0]).toContain('wrapping up');
  });

  it('returns urgent warning at 2 minutes', () => {
    const now = new Date('2026-02-15T10:28:00Z');
    const end = new Date('2026-02-15T10:30:00Z');
    const result = externalizeTime(now, end);
    expect(result.minutesLeft).toBe(2);
    expect(result.warnings[0]).toContain('wrap the current step');
  });

  it('returns 0 when time is past', () => {
    const now = new Date('2026-02-15T10:31:00Z');
    const end = new Date('2026-02-15T10:30:00Z');
    const result = externalizeTime(now, end);
    expect(result.minutesLeft).toBe(0);
  });

  it('includes leave time formatted as HH:MM', () => {
    const now = new Date('2026-02-15T10:00:00Z');
    const end = new Date('2026-02-15T14:30:00Z');
    const result = externalizeTime(now, end);
    expect(result.leaveTime).toMatch(/\d{2}:\d{2}/);
  });
});

describe('estimateRemaining', () => {
  it('returns 2-5 min per step', () => {
    expect(estimateRemaining(3)).toEqual([6, 15]);
    expect(estimateRemaining(1)).toEqual([2, 5]);
    expect(estimateRemaining(0)).toEqual([0, 0]);
  });
});

describe('driftCheck', () => {
  it('returns false within threshold', () => {
    const last = new Date('2026-02-15T10:00:00Z');
    const now = new Date('2026-02-15T10:04:00Z');
    expect(driftCheck(last, now)).toBe(false);
  });

  it('returns true at threshold', () => {
    const last = new Date('2026-02-15T10:00:00Z');
    const now = new Date('2026-02-15T10:05:00Z');
    expect(driftCheck(last, now)).toBe(true);
  });

  it('returns true past threshold', () => {
    const last = new Date('2026-02-15T10:00:00Z');
    const now = new Date('2026-02-15T10:10:00Z');
    expect(driftCheck(last, now)).toBe(true);
  });

  it('respects custom threshold', () => {
    const last = new Date('2026-02-15T10:00:00Z');
    const now = new Date('2026-02-15T10:03:00Z');
    expect(driftCheck(last, now, 3)).toBe(true);
    expect(driftCheck(last, now, 5)).toBe(false);
  });
});

describe('nudgeCopy', () => {
  it('returns a non-empty string', () => {
    const result = nudgeCopy();
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});

describe('completionPush', () => {
  it('returns stop message at 1 minute', () => {
    expect(completionPush(1)).toContain('stop where you are');
  });

  it('returns wrap message at 2 minutes', () => {
    expect(completionPush(2)).toContain('wrap the current step');
  });

  it('returns wrapping up message at 5 minutes', () => {
    expect(completionPush(5)).toContain('wrapping up');
  });

  it('returns simple message at 10 minutes', () => {
    expect(completionPush(10)).toContain('10 minutes left');
  });
});

describe('formatTimeHeader', () => {
  it('formats with leave time', () => {
    const result = formatTimeHeader({ minutesLeft: 23, leaveTime: '14:30', warnings: [] });
    expect(result).toBe('Leave at 14:30 — 23m left');
  });

  it('formats without leave time', () => {
    const result = formatTimeHeader({ minutesLeft: 23, leaveTime: null, warnings: [] });
    expect(result).toBe('Time left: 23m');
  });
});

