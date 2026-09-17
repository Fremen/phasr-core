import { describe, it, expect } from 'vitest';
import { Backlog, guessBacklogCategory } from '../src/backlog.js';
import { InMemoryBacklogStore } from '../src/backlog-store.js';

function createBacklog() {
  const store = new InMemoryBacklogStore();
  return new Backlog(store);
}

describe('Backlog', () => {
  describe('add', () => {
    it('adds item to category', async () => {
      const bl = createBacklog();
      const item = await bl.add('Fix fence', 'home');
      expect(item.text).toBe('Fix fence');
      expect(item.category).toBe('home');
      expect(item.status).toBe('active');
      expect(item.id).toBeTruthy();
    });
  });

  describe('list', () => {
    it('lists all items', async () => {
      const bl = createBacklog();
      await bl.add('Fix fence', 'home');
      await bl.add('Write report', 'work');
      const items = await bl.list();
      expect(items.length).toBe(2);
    });

    it('lists items by category', async () => {
      const bl = createBacklog();
      await bl.add('Fix fence', 'home');
      await bl.add('Write report', 'work');
      const items = await bl.list('home');
      expect(items.length).toBe(1);
      expect(items[0].text).toBe('Fix fence');
    });

    it('returns empty for unknown category', async () => {
      const bl = createBacklog();
      const items = await bl.list('nonexistent');
      expect(items).toEqual([]);
    });
  });

  describe('search', () => {
    it('finds items by substring', async () => {
      const bl = createBacklog();
      await bl.add('Fix fence in garden', 'home');
      await bl.add('Write quarterly report', 'work');
      const results = await bl.search('fence');
      expect(results.length).toBe(1);
      expect(results[0].text).toBe('Fix fence in garden');
    });

    it('finds items by word overlap', async () => {
      const bl = createBacklog();
      await bl.add('Fix the broken fence', 'home');
      const results = await bl.search('broken fence');
      expect(results.length).toBe(1);
    });

    it('returns empty for no match', async () => {
      const bl = createBacklog();
      await bl.add('Fix fence', 'home');
      const results = await bl.search('completely unrelated xyz');
      expect(results.length).toBe(0);
    });
  });

  describe('markPromoted', () => {
    it('marks item as promoted', async () => {
      const bl = createBacklog();
      await bl.add('Fix fence', 'home');
      const item = await bl.markPromoted('Fix fence');
      expect(item).not.toBeNull();
      expect(item!.status).toBe('promoted');
    });

    it('returns null for non-existent item', async () => {
      const bl = createBacklog();
      const item = await bl.markPromoted('nonexistent');
      expect(item).toBeNull();
    });
  });

  describe('markActive (demote)', () => {
    it('marks promoted item back to active', async () => {
      const bl = createBacklog();
      await bl.add('Fix fence', 'home');
      await bl.markPromoted('Fix fence');
      const item = await bl.markActive('Fix fence');
      expect(item).not.toBeNull();
      expect(item!.status).toBe('active');
    });

    it('returns null if item is not promoted', async () => {
      const bl = createBacklog();
      await bl.add('Fix fence', 'home');
      const item = await bl.markActive('Fix fence');
      expect(item).toBeNull();
    });
  });

  describe('archive', () => {
    it('archives an item', async () => {
      const bl = createBacklog();
      await bl.add('Fix fence', 'home');
      const item = await bl.archive('Fix fence');
      expect(item).not.toBeNull();
      expect(item!.status).toBe('archived');
      expect(item!.completedAt).toBeTruthy();
    });

    it('removes item from active list after archiving', async () => {
      const bl = createBacklog();
      await bl.add('Fix fence', 'home');
      await bl.archive('Fix fence');
      const items = await bl.list('home');
      expect(items.length).toBe(0);
    });

    it('returns null for non-existent item', async () => {
      const bl = createBacklog();
      const item = await bl.archive('nonexistent');
      expect(item).toBeNull();
    });
  });

  describe('stats', () => {
    it('returns correct stats', async () => {
      const bl = createBacklog();
      await bl.add('Fix fence', 'home');
      await bl.add('Paint wall', 'home');
      await bl.add('Write report', 'work');
      await bl.markPromoted('Fix fence');

      const s = await bl.stats();
      expect(s.total).toBe(3);
      expect(s.byCategory.home).toBe(1); // 1 active (Paint wall), 1 promoted
      expect(s.byCategory.work).toBe(1);
      expect(s.promoted).toBe(1);
    });
  });

  describe('formatting', () => {
    it('formats empty list', async () => {
      const bl = createBacklog();
      const items = await bl.list();
      const output = bl.formatList(items);
      expect(output).toContain('No items');
    });

    it('formats list grouped by category', async () => {
      const bl = createBacklog();
      await bl.add('Fix fence', 'home');
      await bl.add('Write report', 'work');
      const items = await bl.list();
      const output = bl.formatList(items);
      expect(output).toContain('📂 Phasr · Backlog KB');
      expect(output).toContain('Fix fence');
      expect(output).toContain('Write report');
      expect(output).toContain('2 items');
    });

    it('formats list for single category', async () => {
      const bl = createBacklog();
      await bl.add('Fix fence', 'home');
      const items = await bl.list('home');
      const output = bl.formatList(items, 'home');
      expect(output).toContain('Home Backlog KB');
      expect(output).toContain('Fix fence');
    });

    it('formats stats', async () => {
      const bl = createBacklog();
      await bl.add('Fix fence', 'home');
      const s = await bl.stats();
      const output = bl.formatStats(s);
      expect(output).toContain('📊 Phasr · Backlog Stats');
      expect(output).toContain('Home');
    });

    it('formats search results', async () => {
      const bl = createBacklog();
      await bl.add('Fix fence', 'home');
      const items = await bl.search('fence');
      const output = bl.formatSearchResults(items, 'fence');
      expect(output).toContain('🔍');
      expect(output).toContain('fence');
      expect(output).toContain('Fix fence');
    });

    it('formats empty search results', async () => {
      const bl = createBacklog();
      const output = bl.formatSearchResults([], 'xyz');
      expect(output).toContain('No backlog items matching');
    });
  });

  describe('search (fuzzy)', () => {
    it('finds by prefix match ("blind" matches "replace blinds")', async () => {
      const bl = createBacklog();
      await bl.add('replace blinds in bedroom', 'home');
      const results = await bl.search('blind');
      expect(results.length).toBe(1);
      expect(results[0].text).toBe('replace blinds in bedroom');
    });

    it('ranks exact substring higher than word overlap', async () => {
      const bl = createBacklog();
      await bl.add('fix the garden fence', 'home');
      await bl.add('fence paint for garden shed', 'home');
      const results = await bl.search('garden fence');
      expect(results.length).toBe(2);
      expect(results[0].text).toBe('fix the garden fence');
    });

    it('finds with partial word overlap (>= half words)', async () => {
      const bl = createBacklog();
      await bl.add('research blinds options for bedroom', 'home');
      const results = await bl.search('blinds bedroom');
      expect(results.length).toBe(1);
    });
  });

  describe('purge', () => {
    it('removes promoted and archived items', async () => {
      const bl = createBacklog();
      await bl.add('Active task', 'home');
      await bl.add('Promoted task', 'home');
      await bl.markPromoted('Promoted task');

      const result = await bl.purge('home');
      expect(result.removed).toBe(1);
      expect(result.categories).toContain('home');

      const items = await bl.list('home');
      expect(items.length).toBe(1);
      expect(items[0].text).toBe('Active task');
    });

    it('purges all categories when none specified', async () => {
      const bl = createBacklog();
      await bl.add('Home promoted', 'home');
      await bl.add('Work promoted', 'work');
      await bl.markPromoted('Home promoted');
      await bl.markPromoted('Work promoted');

      const result = await bl.purge();
      expect(result.removed).toBe(2);
      expect(result.categories).toContain('home');
      expect(result.categories).toContain('work');
    });

    it('returns zero when nothing to purge', async () => {
      const bl = createBacklog();
      await bl.add('Active task', 'home');
      const result = await bl.purge();
      expect(result.removed).toBe(0);
    });
  });

  describe('retriage', () => {
    it('moves items from uncategorized to guessed categories', async () => {
      const bl = createBacklog();
      await bl.add('fix the kitchen tap', 'uncategorized');
      await bl.add('mow the lawn', 'uncategorized');

      const result = await bl.retriage();
      expect(result.moved).toBe(2);
      expect(result.destinations.home).toBe(1);
      expect(result.destinations.garden).toBe(1);

      const uncategorized = await bl.list('uncategorized');
      expect(uncategorized.length).toBe(0);
    });

    it('leaves truly uncategorizable items in uncategorized', async () => {
      const bl = createBacklog();
      await bl.add('random thing xyz', 'uncategorized');

      const result = await bl.retriage();
      expect(result.moved).toBe(0);

      const uncategorized = await bl.list('uncategorized');
      expect(uncategorized.length).toBe(1);
    });

    it('returns zero when uncategorized is empty', async () => {
      const bl = createBacklog();
      const result = await bl.retriage();
      expect(result.moved).toBe(0);
    });
  });

  describe('findByText', () => {
    it('matches exact text', async () => {
      const bl = createBacklog();
      await bl.add('Fix fence', 'home');
      const items = await bl.list('home');
      const found = bl.findByText('Fix fence', items);
      expect(found).not.toBeNull();
      expect(found!.text).toBe('Fix fence');
    });

    it('matches substring', async () => {
      const bl = createBacklog();
      await bl.add('Fix the broken fence', 'home');
      const items = await bl.list('home');
      const found = bl.findByText('fence', items);
      expect(found).not.toBeNull();
    });

    it('returns null for no match', async () => {
      const bl = createBacklog();
      await bl.add('Fix fence', 'home');
      const items = await bl.list('home');
      const found = bl.findByText('completely unrelated', items);
      expect(found).toBeNull();
    });
  });
});

describe('guessBacklogCategory', () => {
  it('detects home category', () => {
    expect(guessBacklogCategory('fix kitchen tap')).toBe('home');
  });

  it('detects garden category', () => {
    expect(guessBacklogCategory('mow the lawn')).toBe('garden');
  });

  it('detects finance category', () => {
    expect(guessBacklogCategory('file tax return')).toBe('finance');
  });

  it('detects health category', () => {
    expect(guessBacklogCategory('schedule gym checkup')).toBe('health');
  });

  it('detects shopping category', () => {
    expect(guessBacklogCategory('buy new headphones')).toBe('shopping');
  });

  it('returns uncategorized for unknown text', () => {
    expect(guessBacklogCategory('random xyz thing')).toBe('uncategorized');
  });
});

