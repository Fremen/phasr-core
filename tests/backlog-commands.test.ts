import { describe, it, expect } from 'vitest';
import { parseBacklogCommand } from '../src/backlog-commands.js';

describe('parseBacklogCommand', () => {
  it('returns null for non-backlog messages', () => {
    expect(parseBacklogCommand('hello')).toBeNull();
    expect(parseBacklogCommand('add fix fence')).toBeNull();
    expect(parseBacklogCommand('hot list')).toBeNull();
    expect(parseBacklogCommand('promote something')).toBeNull();
  });

  describe('list', () => {
    it('parses bare "backlog"', () => {
      const cmd = parseBacklogCommand('backlog');
      expect(cmd).toEqual({ action: 'list' });
    });

    it('parses "backlog list"', () => {
      const cmd = parseBacklogCommand('backlog list');
      expect(cmd).toEqual({ action: 'list' });
    });

    it('parses "backlog list home"', () => {
      const cmd = parseBacklogCommand('backlog list home');
      expect(cmd).toEqual({ action: 'list', category: 'home' });
    });

    it('parses "backlog home"', () => {
      const cmd = parseBacklogCommand('backlog home');
      expect(cmd).toEqual({ action: 'list', category: 'home' });
    });

    it('is case-insensitive', () => {
      const cmd = parseBacklogCommand('Backlog List Home');
      expect(cmd).toEqual({ action: 'list', category: 'home' });
    });
  });

  describe('search', () => {
    it('parses "backlog search fence"', () => {
      const cmd = parseBacklogCommand('backlog search fence');
      expect(cmd).toEqual({ action: 'search', text: 'fence' });
    });

    it('parses multi-word query', () => {
      const cmd = parseBacklogCommand('backlog search fix the fence');
      expect(cmd).toEqual({ action: 'search', text: 'fix the fence' });
    });
  });

  describe('add', () => {
    it('parses "backlog add fix fence"', () => {
      const cmd = parseBacklogCommand('backlog add fix fence');
      expect(cmd).toEqual({ action: 'add', text: 'fix fence' });
    });

    it('parses "backlog add fix fence to home"', () => {
      const cmd = parseBacklogCommand('backlog add fix fence to home');
      expect(cmd).toEqual({ action: 'add', text: 'fix fence', category: 'home' });
    });
  });

  describe('promote', () => {
    it('parses "backlog promote fix fence"', () => {
      const cmd = parseBacklogCommand('backlog promote fix fence');
      expect(cmd).toEqual({ action: 'promote', text: 'fix fence' });
    });
  });

  describe('demote', () => {
    it('parses "backlog demote fix fence"', () => {
      const cmd = parseBacklogCommand('backlog demote fix fence');
      expect(cmd).toEqual({ action: 'demote', text: 'fix fence' });
    });
  });

  describe('archive', () => {
    it('parses "backlog archive fix fence"', () => {
      const cmd = parseBacklogCommand('backlog archive fix fence');
      expect(cmd).toEqual({ action: 'archive', text: 'fix fence' });
    });
  });

  describe('stats', () => {
    it('parses "backlog stats"', () => {
      const cmd = parseBacklogCommand('backlog stats');
      expect(cmd).toEqual({ action: 'stats' });
    });
  });

  describe('purge', () => {
    it('parses "backlog purge"', () => {
      const cmd = parseBacklogCommand('backlog purge');
      expect(cmd).toEqual({ action: 'purge' });
    });

    it('parses "backlog purge home"', () => {
      const cmd = parseBacklogCommand('backlog purge home');
      expect(cmd).toEqual({ action: 'purge', category: 'home' });
    });
  });

  describe('retriage', () => {
    it('parses "backlog retriage"', () => {
      const cmd = parseBacklogCommand('backlog retriage');
      expect(cmd).toEqual({ action: 'retriage' });
    });
  });
});

