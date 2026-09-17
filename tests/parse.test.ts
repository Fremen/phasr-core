import { describe, it, expect } from 'vitest';
import { parseTrigger, normalizeTimeString, calculateTimeboxFromLeaveTime } from '../src/primitives.js';
import { SessionType } from '../src/types.js';

describe('parseTrigger', () => {
  describe('PREP triggers', () => {
    it('parses "Prep: board memo (30m)"', () => {
      const result = parseTrigger('Prep: board memo (30m)');
      expect(result).toEqual({
        type: SessionType.PREP,
        task: 'board memo',
        timeboxMinutes: 30,
      });
    });

    it('parses "Prep: meeting notes" without timebox', () => {
      const result = parseTrigger('Prep: meeting notes');
      expect(result).toEqual({
        type: SessionType.PREP,
        task: 'meeting notes',
        timeboxMinutes: null,
      });
    });

    it('parses "Preparing for Z"', () => {
      const result = parseTrigger('Preparing for Z');
      expect(result).toEqual({
        type: SessionType.PREP,
        task: 'Z',
        timeboxMinutes: null,
      });
    });

    it('parses "Preparing for Z (40m)"', () => {
      const result = parseTrigger('Preparing for Z (40m)');
      expect(result).toEqual({
        type: SessionType.PREP,
        task: 'Z',
        timeboxMinutes: 40,
      });
    });
  });

  describe('PACK triggers', () => {
    it('parses "Pack: Rome (25m)"', () => {
      const result = parseTrigger('Pack: Rome (25m)');
      expect(result).toEqual({
        type: SessionType.PACK,
        task: 'Rome',
        timeboxMinutes: 25,
      });
    });

    it('parses "Packing for trip"', () => {
      const result = parseTrigger('Packing for trip');
      expect(result).toEqual({
        type: SessionType.PACK,
        task: 'trip',
        timeboxMinutes: null,
      });
    });
  });

  describe('PRIORITISE triggers', () => {
    it('parses "Prioritise: 8 items (15m)"', () => {
      const result = parseTrigger('Prioritise: 8 items (15m)');
      expect(result).toEqual({
        type: SessionType.PRIORITISE,
        task: '8 items',
        timeboxMinutes: 15,
      });
    });

    it('parses "Prioritizing"', () => {
      const result = parseTrigger('Prioritizing');
      expect(result).toEqual({
        type: SessionType.PRIORITISE,
        task: 'prioritise',
        timeboxMinutes: null,
      });
    });

    it('handles both -ise and -ize spelling', () => {
      const ise = parseTrigger('Prioritise: tasks (10m)');
      const ize = parseTrigger('Prioritize: tasks (10m)');
      expect(ise?.type).toBe(SessionType.PRIORITISE);
      expect(ize?.type).toBe(SessionType.PRIORITISE);
    });
  });

  describe('PLAN triggers', () => {
    it('parses "Plan: Rome itinerary (60m)"', () => {
      const result = parseTrigger('Plan: Rome itinerary (60m)');
      expect(result).toEqual({
        type: SessionType.PLAN,
        task: 'Rome itinerary',
        timeboxMinutes: 60,
      });
    });

    it('parses "Planning a trip"', () => {
      const result = parseTrigger('Planning a trip');
      expect(result).toEqual({
        type: SessionType.PLAN,
        task: 'trip',
        timeboxMinutes: null,
      });
    });
  });

  describe('COOK triggers', () => {
    it('parses "Cook: pasta bolognese (45m)"', () => {
      const result = parseTrigger('Cook: pasta bolognese (45m)');
      expect(result).toEqual({
        type: SessionType.COOK,
        task: 'pasta bolognese',
        timeboxMinutes: 45,
      });
    });

    it('parses "Cooking stir fry (30m)"', () => {
      const result = parseTrigger('Cooking stir fry (30m)');
      expect(result).toEqual({
        type: SessionType.COOK,
        task: 'stir fry',
        timeboxMinutes: 30,
      });
    });

    it('parses "Cook: dinner" without timebox', () => {
      const result = parseTrigger('Cook: dinner');
      expect(result).toEqual({
        type: SessionType.COOK,
        task: 'dinner',
        timeboxMinutes: null,
      });
    });
  });

  describe('leave-time triggers', () => {
    it('parses "Prep: board memo (leave at 3pm)"', () => {
      const result = parseTrigger('Prep: board memo (leave at 3pm)');
      expect(result).toEqual({
        type: SessionType.PREP,
        task: 'board memo',
        timeboxMinutes: null,
        leaveAt: '15:00',
      });
    });

    it('parses "Pack: Rome (leave by 14:30)"', () => {
      const result = parseTrigger('Pack: Rome (leave by 14:30)');
      expect(result).toEqual({
        type: SessionType.PACK,
        task: 'Rome',
        timeboxMinutes: null,
        leaveAt: '14:30',
      });
    });

    it('parses "Prep: report (leave at 3:30pm)"', () => {
      const result = parseTrigger('Prep: report (leave at 3:30pm)');
      expect(result).toEqual({
        type: SessionType.PREP,
        task: 'report',
        timeboxMinutes: null,
        leaveAt: '15:30',
      });
    });

    it('does not set leaveAt when using (Xm) syntax', () => {
      const result = parseTrigger('Prep: report (30m)');
      expect(result?.leaveAt).toBeUndefined();
    });

    it('leaves timebox as null when only leave-time is specified', () => {
      const result = parseTrigger('Prep: report (leave at 2pm)');
      expect(result?.timeboxMinutes).toBeNull();
      expect(result?.leaveAt).toBe('14:00');
    });
  });

  describe('non-triggers', () => {
    it('returns null for random text', () => {
      expect(parseTrigger('hello world')).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(parseTrigger('')).toBeNull();
    });

    it('returns null for "done"', () => {
      expect(parseTrigger('done')).toBeNull();
    });
  });
});

describe('normalizeTimeString', () => {
  it('converts "3pm" to "15:00"', () => {
    expect(normalizeTimeString('3pm')).toBe('15:00');
  });

  it('converts "3:30pm" to "15:30"', () => {
    expect(normalizeTimeString('3:30pm')).toBe('15:30');
  });

  it('keeps "14:30" as-is', () => {
    expect(normalizeTimeString('14:30')).toBe('14:30');
  });

  it('converts "12am" to "00:00"', () => {
    expect(normalizeTimeString('12am')).toBe('00:00');
  });

  it('converts "12pm" to "12:00"', () => {
    expect(normalizeTimeString('12pm')).toBe('12:00');
  });

  it('converts "9am" to "09:00"', () => {
    expect(normalizeTimeString('9am')).toBe('09:00');
  });

  it('converts "9:15 am" to "09:15"', () => {
    expect(normalizeTimeString('9:15 am')).toBe('09:15');
  });
});

describe('calculateTimeboxFromLeaveTime', () => {
  it('calculates minutes between now and leave time', () => {
    const now = new Date('2026-02-15T10:00:00');
    expect(calculateTimeboxFromLeaveTime('10:30', now)).toBe(30);
  });

  it('returns 0 when leave time is in the past', () => {
    const now = new Date('2026-02-15T11:00:00');
    expect(calculateTimeboxFromLeaveTime('10:30', now)).toBe(0);
  });

  it('handles leave time several hours out', () => {
    const now = new Date('2026-02-15T10:00:00');
    expect(calculateTimeboxFromLeaveTime('15:00', now)).toBe(300);
  });
});

