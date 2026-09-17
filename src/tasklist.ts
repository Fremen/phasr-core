import { createHash } from 'node:crypto';
import type { TaskItem, ItemCategory, ItemStatus } from './types.js';
import { CATEGORY_EMOJI } from './types.js';

// Reverse lookup: emoji → category
const EMOJI_CATEGORY: Record<string, ItemCategory> = Object.fromEntries(
  Object.entries(CATEGORY_EMOJI).map(([cat, emoji]) => [emoji, cat as ItemCategory]),
) as Record<string, ItemCategory>;

// --- Store interfaces ---

export interface TaskListStore {
  load(): Promise<TaskItem[]>;
  save(items: TaskItem[]): Promise<void>;
}

export class InMemoryTaskListStore implements TaskListStore {
  private items: TaskItem[] = [];

  async load(): Promise<TaskItem[]> {
    return [...this.items];
  }

  async save(items: TaskItem[]): Promise<void> {
    this.items = [...items];
  }
}

export class FileTaskListStore implements TaskListStore {
  private filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  async load(): Promise<TaskItem[]> {
    const fs = await import('node:fs/promises');
    try {
      const data = await fs.readFile(this.filePath, 'utf-8');
      const parsed = JSON.parse(data) as Array<Record<string, unknown>>;
      return parsed.map(r => ({
        ...r,
        addedAt: new Date(r.addedAt as string),
        promotedAt: r.promotedAt ? new Date(r.promotedAt as string) : null,
        completedAt: r.completedAt ? new Date(r.completedAt as string) : null,
      })) as TaskItem[];
    } catch {
      return [];
    }
  }

  async save(items: TaskItem[]): Promise<void> {
    const fs = await import('node:fs/promises');
    const { dirname } = await import('node:path');
    await fs.mkdir(dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(items, null, 2), 'utf-8');
  }
}

function mdId(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 12);
}

export class MarkdownTaskListStore implements TaskListStore {
  private filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  async load(): Promise<TaskItem[]> {
    const fs = await import('node:fs/promises');
    let content: string;
    try {
      content = await fs.readFile(this.filePath, 'utf-8');
    } catch {
      return [];
    }

    // Detect whether file uses section markers
    const hasSectionMarkers = /^# (Hot List|Backlog|✅ Completed)/im.test(content);

    const items: TaskItem[] = [];
    // If no section markers, default to 'hot' (simple list mode)
    let section: ItemStatus = hasSectionMarkers ? 'backlog' : 'hot';
    let category: ItemCategory = 'other';

    for (const line of content.split('\n')) {
      // Section headings
      if (/^# Hot List/i.test(line)) { section = 'hot'; continue; }
      if (/^# Backlog/i.test(line)) { section = 'backlog'; continue; }
      if (/^# ✅ Completed/i.test(line)) { section = 'done'; continue; }

      // Category subheadings: ## <emoji> <Name>
      const catMatch = line.match(/^## (.+?)\s+\S+/);
      if (catMatch) {
        const emoji = catMatch[1].trim();
        if (EMOJI_CATEGORY[emoji]) {
          category = EMOJI_CATEGORY[emoji];
        }
        continue;
      }

      // Task items: - [ ] text  or  - [x] text (date)
      const taskMatch = line.match(/^- \[([ x])\] (.+)/);
      if (taskMatch) {
        const checked = taskMatch[1] === 'x';
        let text = taskMatch[2].trim();
        let completedAt: Date | null = null;

        // Parse trailing date on completed items: (YYYY-MM-DD)
        const dateMatch = text.match(/\((\d{4}-\d{2}-\d{2})\)$/);
        if (dateMatch && (checked || section === 'done')) {
          completedAt = new Date(dateMatch[1]);
          text = text.replace(/\s*\(\d{4}-\d{2}-\d{2}\)$/, '');
        }

        const status: ItemStatus = checked || section === 'done' ? 'done' : section;
        items.push({
          id: mdId(text),
          text,
          category: section === 'done' ? 'other' : category,
          status,
          addedAt: completedAt ?? new Date(),
          promotedAt: status === 'hot' ? new Date() : null,
          completedAt,
        });
        continue;
      }
    }
    return items;
  }

  async save(items: TaskItem[]): Promise<void> {
    const fs = await import('node:fs/promises');
    const { dirname } = await import('node:path');
    await fs.mkdir(dirname(this.filePath), { recursive: true });

    const hot = items.filter(i => i.status === 'hot');
    const backlog = items.filter(i => i.status === 'backlog');
    const done = items.filter(i => i.status === 'done');

    const lines: string[] = [];
    const today = new Date().toISOString().slice(0, 10);

    if (hot.length > 0) {
      lines.push('# Hot List 🔥');
      lines.push(`*Last updated: ${today}*`);
      lines.push('');
      this.appendGrouped(lines, hot);
    }

    if (backlog.length > 0) {
      if (lines.length > 0) lines.push('');
      lines.push('# Backlog 📋');
      lines.push('');
      this.appendGrouped(lines, backlog);
    }

    if (done.length > 0) {
      if (lines.length > 0) lines.push('');
      const now = new Date();
      const month = now.toLocaleString('en-US', { month: 'long' });
      lines.push(`# ✅ Completed (${month} ${now.getFullYear()})`);
      lines.push('');
      for (const item of done) {
        const dateStr = item.completedAt
          ? ` (${item.completedAt.toISOString().slice(0, 10)})`
          : '';
        lines.push(`- [x] ${item.text}${dateStr}`);
      }
    }

    lines.push('');
    await fs.writeFile(this.filePath, lines.join('\n'), 'utf-8');
  }

  private appendGrouped(lines: string[], items: TaskItem[]): void {
    const grouped = new Map<ItemCategory, TaskItem[]>();
    for (const item of items) {
      const arr = grouped.get(item.category) ?? [];
      arr.push(item);
      grouped.set(item.category, arr);
    }
    for (const [cat, catItems] of grouped) {
      const emoji = CATEGORY_EMOJI[cat];
      const label = cat.charAt(0).toUpperCase() + cat.slice(1);
      lines.push(`## ${emoji} ${label}`);
      for (const item of catItems) {
        lines.push(`- [ ] ${item.text}`);
      }
      lines.push('');
    }
  }
}

// --- TaskList class ---

export class TaskList {
  private store: TaskListStore;
  private items: TaskItem[] | null = null;

  constructor(store: TaskListStore) {
    this.store = store;
  }

  private async ensureLoaded(): Promise<TaskItem[]> {
    if (this.items === null) {
      this.items = await this.store.load();
    }
    return this.items;
  }

  private async persist(): Promise<void> {
    if (this.items !== null) {
      await this.store.save(this.items);
    }
  }

  // --- Mutations ---

  async add(text: string, category: ItemCategory, status: ItemStatus = 'backlog'): Promise<TaskItem> {
    const items = await this.ensureLoaded();
    const item: TaskItem = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      text,
      category,
      status,
      addedAt: new Date(),
      promotedAt: status === 'hot' ? new Date() : null,
      completedAt: null,
    };
    items.push(item);
    await this.persist();
    return item;
  }

  async promote(textOrId: string): Promise<TaskItem | null> {
    const items = await this.ensureLoaded();
    const backlog = items.filter(i => i.status === 'backlog');
    const item = this.findByText(textOrId, backlog) ?? items.find(i => i.id === textOrId && i.status === 'backlog');
    if (!item) return null;
    item.status = 'hot';
    item.promotedAt = new Date();
    await this.persist();
    return item;
  }

  async markDone(textOrId: string): Promise<TaskItem | null> {
    const items = await this.ensureLoaded();
    const hot = items.filter(i => i.status === 'hot');
    const item = this.findByText(textOrId, hot) ?? items.find(i => i.id === textOrId && i.status === 'hot');
    if (!item) return null;
    item.status = 'done';
    item.completedAt = new Date();
    await this.persist();
    return item;
  }

  async remove(textOrId: string): Promise<TaskItem | null> {
    const items = await this.ensureLoaded();
    const item = this.findByText(textOrId, items) ?? items.find(i => i.id === textOrId);
    if (!item) return null;
    const idx = items.indexOf(item);
    items.splice(idx, 1);
    await this.persist();
    return item;
  }

  // --- Queries ---

  async getHotList(): Promise<TaskItem[]> {
    const items = await this.ensureLoaded();
    return items.filter(i => i.status === 'hot');
  }

  async getBacklog(category?: ItemCategory): Promise<TaskItem[]> {
    const items = await this.ensureLoaded();
    return items.filter(i => i.status === 'backlog' && (!category || i.category === category));
  }

  async getArchive(category?: ItemCategory): Promise<TaskItem[]> {
    const items = await this.ensureLoaded();
    return items.filter(i => i.status === 'done' && (!category || i.category === category));
  }

  async getByCategory(category: ItemCategory): Promise<TaskItem[]> {
    const items = await this.ensureLoaded();
    return items.filter(i => i.category === category);
  }

  async getAllItems(): Promise<TaskItem[]> {
    return this.ensureLoaded();
  }

  // --- Fuzzy match ---

  findByText(query: string, items: TaskItem[]): TaskItem | null {
    const lower = query.toLowerCase().trim();
    if (!lower) return null;

    // Exact match first
    const exact = items.find(i => i.text.toLowerCase() === lower);
    if (exact) return exact;

    // Substring match
    const sub = items.find(i => i.text.toLowerCase().includes(lower));
    if (sub) return sub;

    // Reverse substring (query contains item text)
    const rev = items.find(i => lower.includes(i.text.toLowerCase()));
    if (rev) return rev;

    // Word overlap — score by number of query words found in item text
    const queryWords = lower.split(/\s+/);
    let bestItem: TaskItem | null = null;
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

  // --- Display formatting ---

  formatHotList(items: TaskItem[]): string {
    if (items.length === 0) {
      return '🔥 Phasr · Hot List\n\nNo items — say "add X to hot list" to get started.';
    }

    const grouped = this.groupByCategory(items);
    const lines = ['🔥 Phasr · Hot List', ''];
    for (const [category, catItems] of grouped) {
      const emoji = CATEGORY_EMOJI[category];
      const label = category.charAt(0).toUpperCase() + category.slice(1);
      lines.push(`${emoji} ${label}`);
      for (const item of catItems) {
        lines.push(`  • ${item.text}`);
      }
      lines.push('');
    }
    lines.push(`${items.length} item${items.length === 1 ? '' : 's'} — say "knock out ${Math.min(items.length, 3)} in 20m" to start`);
    return lines.join('\n');
  }

  formatBacklog(items: TaskItem[], category?: ItemCategory): string {
    const label = category
      ? `${category.charAt(0).toUpperCase() + category.slice(1)} Backlog`
      : 'Backlog';

    if (items.length === 0) {
      return `📋 Phasr · ${label}\n\nNo items — say "add X" to get started.`;
    }

    const lines = [`📋 Phasr · ${label}`, ''];
    if (category) {
      for (const item of items) {
        lines.push(`  • ${item.text}`);
      }
    } else {
      const grouped = this.groupByCategory(items);
      for (const [cat, catItems] of grouped) {
        const emoji = CATEGORY_EMOJI[cat];
        const catLabel = cat.charAt(0).toUpperCase() + cat.slice(1);
        lines.push(`${emoji} ${catLabel}`);
        for (const item of catItems) {
          lines.push(`  • ${item.text}`);
        }
        lines.push('');
      }
    }
    lines.push(`${items.length} item${items.length === 1 ? '' : 's'} — say "promote X" to add to hot list.`);
    return lines.join('\n');
  }

  formatArchive(items: TaskItem[], category?: ItemCategory): string {
    const label = category
      ? `${category.charAt(0).toUpperCase() + category.slice(1)} Archive`
      : 'Archive';

    if (items.length === 0) {
      return `✅ Phasr · ${label}\n\nNo completed items yet.`;
    }

    const lines = [`✅ Phasr · ${label}`, ''];
    for (const item of items) {
      const dateStr = item.completedAt
        ? item.completedAt.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' })
        : '';
      lines.push(`  • ${item.text}${dateStr ? ` (${dateStr})` : ''}`);
    }
    return lines.join('\n');
  }

  formatAdded(item: TaskItem): string {
    const emoji = CATEGORY_EMOJI[item.category];
    const statusLabel = item.status === 'hot' ? 'hot list' : 'backlog';
    return `${emoji} Added to ${statusLabel}: "${item.text}"`;
  }

  formatPromoted(item: TaskItem): string {
    const emoji = CATEGORY_EMOJI[item.category];
    return `${emoji} Promoted to hot list: "${item.text}"`;
  }

  formatDone(item: TaskItem): string {
    return `✅ Done: "${item.text}"`;
  }

  private groupByCategory(items: TaskItem[]): [ItemCategory, TaskItem[]][] {
    const map = new Map<ItemCategory, TaskItem[]>();
    for (const item of items) {
      const arr = map.get(item.category) ?? [];
      arr.push(item);
      map.set(item.category, arr);
    }
    return [...map.entries()];
  }
}

