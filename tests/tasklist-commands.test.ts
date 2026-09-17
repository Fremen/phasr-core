import { describe, it, expect } from 'vitest';
import { parseListCommand, guessCategoryFromKeywords } from '../src/tasklist-commands.js';

describe('parseListCommand', () => {
  describe('view hot list', () => {
    it('parses "hot list"', () => {
      expect(parseListCommand('hot list')).toEqual({ action: 'view' });
    });

    it('parses "show hot list"', () => {
      expect(parseListCommand('show hot list')).toEqual({ action: 'view' });
    });

    it('parses "show my hot list"', () => {
      expect(parseListCommand('show my hot list')).toEqual({ action: 'view' });
    });

    it('parses "what\'s on my hot list"', () => {
      expect(parseListCommand("what's on my hot list")).toEqual({ action: 'view' });
    });

    it('parses "whats on my hotlist"', () => {
      expect(parseListCommand('whats on my hotlist')).toEqual({ action: 'view' });
    });
  });

  describe('add', () => {
    it('parses "add X to home"', () => {
      const result = parseListCommand('add fix the blinds to home');
      expect(result).toEqual({ action: 'add', text: 'fix the blinds', category: 'home' });
    });

    it('parses "add X to hot list"', () => {
      const result = parseListCommand('add fix tap to hot list');
      expect(result).toEqual({ action: 'add', text: 'fix tap', status: 'hot' });
    });

    it('parses "add X" without category', () => {
      const result = parseListCommand('add buy groceries');
      expect(result).toEqual({ action: 'add', text: 'buy groceries' });
    });
  });

  describe('done', () => {
    it('parses "done X" with text', () => {
      const result = parseListCommand('done fix tap');
      expect(result).toEqual({ action: 'done', text: 'fix tap' });
    });

    it('parses "check off X"', () => {
      const result = parseListCommand('check off blinds');
      expect(result).toEqual({ action: 'done', text: 'blinds' });
    });

    it('parses "complete X"', () => {
      const result = parseListCommand('complete report');
      expect(result).toEqual({ action: 'done', text: 'report' });
    });

    it('does NOT match bare "done"', () => {
      expect(parseListCommand('done')).toBeNull();
    });
  });

  describe('remove', () => {
    it('parses "remove X"', () => {
      const result = parseListCommand('remove old task');
      expect(result).toEqual({ action: 'remove', text: 'old task' });
    });
  });

  describe('promote', () => {
    it('parses "promote X"', () => {
      const result = parseListCommand('promote repaint hallway');
      expect(result).toEqual({ action: 'promote', text: 'repaint hallway' });
    });

    it('parses "move X to hot list"', () => {
      const result = parseListCommand('move repaint to hot list');
      expect(result).toEqual({ action: 'promote', text: 'repaint' });
    });
  });

  describe('backlog', () => {
    it('parses "show work backlog"', () => {
      const result = parseListCommand('show work backlog');
      expect(result).toEqual({ action: 'backlog', category: 'work' });
    });

    it('parses "backlog" alone', () => {
      const result = parseListCommand('backlog');
      expect(result).toEqual({ action: 'backlog', category: undefined });
    });

    it('parses "show backlog"', () => {
      const result = parseListCommand('show backlog');
      expect(result).toEqual({ action: 'backlog', category: undefined });
    });

    it('parses "what\'s in my work backlog"', () => {
      const result = parseListCommand("what's in my work backlog");
      expect(result).toEqual({ action: 'backlog', category: 'work' });
    });
  });

  describe('archive', () => {
    it('parses "show work archive"', () => {
      const result = parseListCommand('show work archive');
      expect(result).toEqual({ action: 'archive', category: 'work' });
    });

    it('parses "archive" alone', () => {
      const result = parseListCommand('archive');
      expect(result).toEqual({ action: 'archive', category: undefined });
    });

    it('parses "work archive"', () => {
      const result = parseListCommand('work archive');
      expect(result).toEqual({ action: 'archive', category: 'work' });
    });
  });

  describe('knock-out', () => {
    it('parses "knock out 3 in 20m"', () => {
      const result = parseListCommand('knock out 3 in 20m');
      expect(result).toEqual({ action: 'knock-out', count: 3, timeboxMinutes: 20 });
    });

    it('parses "knock out 3 things in 20 minutes"', () => {
      const result = parseListCommand('knock out 3 things in 20 minutes');
      expect(result).toEqual({ action: 'knock-out', count: 3, timeboxMinutes: 20 });
    });

    it('parses "do 2 items"', () => {
      const result = parseListCommand('do 2 items');
      expect(result).toEqual({ action: 'knock-out', count: 2, timeboxMinutes: undefined });
    });
  });

  describe('recommend', () => {
    it('parses "recommend"', () => {
      expect(parseListCommand('recommend')).toEqual({ action: 'recommend' });
    });

    it('parses "what should I work on"', () => {
      expect(parseListCommand('what should I work on')).toEqual({ action: 'recommend' });
    });

    it('parses "suggest items"', () => {
      expect(parseListCommand('suggest items')).toEqual({ action: 'recommend' });
    });
  });

  describe('non-matching', () => {
    it('returns null for unrelated messages', () => {
      expect(parseListCommand('hello')).toBeNull();
    });

    it('returns null for session triggers', () => {
      expect(parseListCommand('Prep: task (30m)')).toBeNull();
    });
  });
});

describe('guessCategoryFromKeywords', () => {
  it('guesses home for repair tasks', () => {
    expect(guessCategoryFromKeywords('fix the leaky tap')).toBe('home');
  });

  it('guesses work for report tasks', () => {
    expect(guessCategoryFromKeywords('finish quarterly report')).toBe('work');
  });

  it('guesses garden for plant tasks', () => {
    expect(guessCategoryFromKeywords('mow the lawn')).toBe('garden');
  });

  it('guesses tech for code tasks', () => {
    expect(guessCategoryFromKeywords('deploy the server')).toBe('tech');
  });

  it('guesses food for cooking tasks', () => {
    expect(guessCategoryFromKeywords('meal prep for the week')).toBe('food');
  });

  it('falls back to other', () => {
    expect(guessCategoryFromKeywords('do something random')).toBe('other');
  });
});

