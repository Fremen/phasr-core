import { createHash } from 'node:crypto';
import type { BacklogItem, BacklogCategory } from './types.js';
import { BACKLOG_CATEGORY_EMOJI } from './types.js';
import type { BacklogStore } from './backlog-store.js';
import { guessCategoryFromKeywords } from './tasklist-commands.js';

function backlogId(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 12);
}

const BACKLOG_EXTRA_KEYWORDS: Record<string, string[]> = {
  finance: ['tax', 'bank', 'insurance', 'mortgage', 'budget', 'invest', 'pension', 'savings', 'bill', 'payment'],
  health: ['doctor', 'dentist', 'gym', 'exercise', 'medication', 'appointment', 'checkup', 'physio', 'therapy'],
  ideas: ['idea', 'brainstorm', 'concept', 'research', 'explore', 'try', 'experiment'],
  shopping: ['buy', 'order', 'purchase', 'shop', 'amazon', 'return', 'refund'],
  events: ['birthday', 'party', 'wedding', 'holiday', 'trip', 'travel', 'book', 'reservation', 'ticket'],
};

export function guessBacklogCategory(text: string): string {
  // First try the standard hot-list categories
  const hotCat = guessCategoryFromKeywords(text);
  if (hotCat !== 'other') return hotCat;

  // Then try backlog-specific categories
  const lower = text.toLowerCase();
  let bestCat = 'uncategorized';
  let bestScore = 0;
  for (const [cat, keywords] of Object.entries(BACKLOG_EXTRA_KEYWORDS)) {
    const score = keywords.filter(kw => lower.includes(kw)).length;
    if (score > bestScore) {
      bestScore = score;
      bestCat = cat;
    }
  }
  return bestCat;
}

export class Backlog {
  private store: BacklogStore;

  constructor(store: BacklogStore) {
    this.store = store;
  }

  async list(category?: string): Promise<BacklogItem[]> {
    if (category) {
      return this.store.loadCategory(category);
    }
    return this.store.loadAll();
  }

  async search(query: string): Promise<BacklogItem[]> {
    const all = await this.store.loadAll();
    const lower = query.toLowerCase();
    const queryWords = lower.split(/\s+/);

    // Score each item and return those above threshold
    const scored: { item: BacklogItem; score: number }[] = [];
    for (const item of all) {
      const text = item.text.toLowerCase();

      // Exact substring — highest confidence
      if (text.includes(lower)) {
        scored.push({ item, score: 3 });
        continue;
      }

      // Word overlap — count query words found in item text
      const wordHits = queryWords.filter(w => text.includes(w)).length;
      if (wordHits > 0 && wordHits >= Math.ceil(queryWords.length / 2)) {
        scored.push({ item, score: 1 + wordHits / queryWords.length });
        continue;
      }

      // Partial word matching — any query word is a prefix of an item word (e.g. "blind" matches "blinds")
      const itemWords = text.split(/\s+/);
      const prefixHits = queryWords.filter(qw =>
        itemWords.some(iw => iw.startsWith(qw) || qw.startsWith(iw)),
      ).length;
      if (prefixHits > 0 && prefixHits >= Math.ceil(queryWords.length / 2)) {
        scored.push({ item, score: 0.5 + prefixHits / queryWords.length });
      }
    }

    return scored.sort((a, b) => b.score - a.score).map(s => s.item);
  }

  async add(text: string, category: string): Promise<BacklogItem> {
    const items = await this.store.loadCategory(category);
    const item: BacklogItem = {
      id: backlogId(text),
      text,
      category,
      status: 'active',
    };
    items.push(item);
    await this.store.saveCategory(category, items);
    return item;
  }

  async markPromoted(textOrId: string): Promise<BacklogItem | null> {
    const categories = await this.store.listCategories();
    for (const cat of categories) {
      const items = await this.store.loadCategory(cat);
      const item = this.findByText(textOrId, items) ?? items.find(i => i.id === textOrId);
      if (item && item.status === 'active') {
        item.status = 'promoted';
        await this.store.saveCategory(cat, items);
        return item;
      }
    }
    return null;
  }

  async markActive(textOrId: string): Promise<BacklogItem | null> {
    const categories = await this.store.listCategories();
    for (const cat of categories) {
      const items = await this.store.loadCategory(cat);
      const item = this.findByText(textOrId, items) ?? items.find(i => i.id === textOrId);
      if (item && item.status === 'promoted') {
        item.status = 'active';
        await this.store.saveCategory(cat, items);
        return item;
      }
    }
    return null;
  }

  async archive(textOrId: string): Promise<BacklogItem | null> {
    const categories = await this.store.listCategories();
    for (const cat of categories) {
      const items = await this.store.loadCategory(cat);
      const item = this.findByText(textOrId, items) ?? items.find(i => i.id === textOrId);
      if (item) {
        item.status = 'archived';
        item.completedAt = new Date().toISOString().slice(0, 10);
        // Remove from current, add to archive
        const remaining = items.filter(i => i !== item);
        await this.store.saveCategory(cat, remaining);
        const archived = await this.store.loadArchive(cat);
        archived.push(item);
        await this.store.saveArchive(cat, archived);
        return item;
      }
    }
    return null;
  }

  async purge(category?: string): Promise<{ removed: number; categories: string[] }> {
    const cats = category ? [category] : await this.store.listCategories();
    let removed = 0;
    const affected: string[] = [];

    for (const cat of cats) {
      const items = await this.store.loadCategory(cat);
      const active = items.filter(i => i.status === 'active');
      const purged = items.length - active.length;
      if (purged > 0) {
        await this.store.saveCategory(cat, active);
        removed += purged;
        affected.push(cat);
      }
    }

    return { removed, categories: affected };
  }

  async retriage(): Promise<{ moved: number; destinations: Record<string, number> }> {
    const items = await this.store.loadCategory('uncategorized');
    if (items.length === 0) return { moved: 0, destinations: {} };

    const remaining: BacklogItem[] = [];
    const destinations: Record<string, BacklogItem[]> = {};
    const counts: Record<string, number> = {};

    for (const item of items) {
      const guessed = guessBacklogCategory(item.text);
      if (guessed !== 'uncategorized') {
        const arr = destinations[guessed] ?? [];
        arr.push({ ...item, category: guessed });
        destinations[guessed] = arr;
        counts[guessed] = (counts[guessed] ?? 0) + 1;
      } else {
        remaining.push(item);
      }
    }

    // Move items to their new categories
    for (const [cat, catItems] of Object.entries(destinations)) {
      const existing = await this.store.loadCategory(cat);
      existing.push(...catItems);
      await this.store.saveCategory(cat, existing);
    }

    // Save remaining uncategorized
    await this.store.saveCategory('uncategorized', remaining);

    const moved = items.length - remaining.length;
    return { moved, destinations: counts };
  }

  async stats(): Promise<{ total: number; byCategory: Record<string, number>; promoted: number; archived: number }> {
    const categories = await this.store.listCategories();
    let total = 0;
    let promoted = 0;
    let archived = 0;
    const byCategory: Record<string, number> = {};

    for (const cat of categories) {
      const items = await this.store.loadCategory(cat);
      const active = items.filter(i => i.status === 'active');
      byCategory[cat] = active.length;
      total += items.length;
      promoted += items.filter(i => i.status === 'promoted').length;
      const arch = await this.store.loadArchive(cat);
      archived += arch.length;
    }

    return { total, byCategory, promoted, archived };
  }

  findByText(query: string, items: BacklogItem[]): BacklogItem | null {
    const lower = query.toLowerCase().trim();
    if (!lower) return null;

    // Exact match
    const exact = items.find(i => i.text.toLowerCase() === lower);
    if (exact) return exact;

    // Substring
    const sub = items.find(i => i.text.toLowerCase().includes(lower));
    if (sub) return sub;

    // Reverse substring
    const rev = items.find(i => lower.includes(i.text.toLowerCase()));
    if (rev) return rev;

    // Word overlap
    const queryWords = lower.split(/\s+/);
    let bestItem: BacklogItem | null = null;
    let bestScore = 0;
    for (const item of items) {
      const itemLower = item.text.toLowerCase();
      const score = queryWords.filter(w => itemLower.includes(w)).length;
      if (score > bestScore && score >= Math.ceil(queryWords.length / 2)) {
        bestScore = score;
        bestItem = item;
      }
    }
    return bestItem;
  }

  // --- Formatting ---

  formatList(items: BacklogItem[], category?: string): string {
    const label = category
      ? `${(category.charAt(0).toUpperCase() + category.slice(1))} Backlog KB`
      : 'Backlog KB';

    if (items.length === 0) {
      return `📂 Phasr · ${label}\n\nNo items.`;
    }

    const lines = [`📂 Phasr · ${label}`, ''];

    if (category) {
      for (const item of items) {
        lines.push(`  • ${item.text}`);
      }
    } else {
      const grouped = new Map<string, BacklogItem[]>();
      for (const item of items) {
        const arr = grouped.get(item.category) ?? [];
        arr.push(item);
        grouped.set(item.category, arr);
      }
      for (const [cat, catItems] of grouped) {
        const emoji = BACKLOG_CATEGORY_EMOJI[cat] ?? '📌';
        const catLabel = cat.charAt(0).toUpperCase() + cat.slice(1);
        lines.push(`${emoji} ${catLabel}`);
        for (const item of catItems) {
          lines.push(`  • ${item.text}`);
        }
        lines.push('');
      }
    }

    lines.push(`${items.length} item${items.length === 1 ? '' : 's'}`);
    return lines.join('\n');
  }

  formatStats(stats: { total: number; byCategory: Record<string, number>; promoted: number; archived: number }): string {
    const lines = ['📊 Phasr · Backlog Stats', ''];
    for (const [cat, count] of Object.entries(stats.byCategory)) {
      const emoji = BACKLOG_CATEGORY_EMOJI[cat] ?? '📌';
      const label = cat.charAt(0).toUpperCase() + cat.slice(1);
      lines.push(`  ${emoji} ${label}: ${count}`);
    }
    lines.push('');
    lines.push(`Total: ${stats.total} · Promoted: ${stats.promoted} · Archived: ${stats.archived}`);
    return lines.join('\n');
  }

  formatSearchResults(items: BacklogItem[], query: string): string {
    if (items.length === 0) {
      return `No backlog items matching "${query}".`;
    }

    const lines = [`🔍 Backlog results for "${query}"`, ''];
    for (const item of items) {
      const emoji = BACKLOG_CATEGORY_EMOJI[item.category] ?? '📌';
      lines.push(`  • ${item.text} (${emoji} ${item.category})`);
    }
    return lines.join('\n');
  }
}

