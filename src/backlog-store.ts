import { createHash } from 'node:crypto';
import type { BacklogItem, BacklogCategory, BacklogItemStatus } from './types.js';
import { BACKLOG_CATEGORY_EMOJI } from './types.js';

function backlogId(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 12);
}

// Reverse lookup: emoji → category
const EMOJI_BACKLOG_CATEGORY: Record<string, string> = Object.fromEntries(
  Object.entries(BACKLOG_CATEGORY_EMOJI).map(([cat, emoji]) => [emoji, cat]),
);

export interface BacklogStore {
  listCategories(): Promise<string[]>;
  loadCategory(category: string): Promise<BacklogItem[]>;
  saveCategory(category: string, items: BacklogItem[]): Promise<void>;
  loadArchive(category: string): Promise<BacklogItem[]>;
  saveArchive(category: string, items: BacklogItem[]): Promise<void>;
  loadAll(): Promise<BacklogItem[]>;
}

// --- Markdown parsing helpers ---

function parseBacklogItems(content: string, category: string): BacklogItem[] {
  const items: BacklogItem[] = [];
  let subcategory: string | undefined;

  for (const line of content.split('\n')) {
    // Subcategory heading: ## <emoji> <Name>
    const subMatch = line.match(/^## (.+)/);
    if (subMatch) {
      const raw = subMatch[1].trim();
      // Try to extract emoji-based subcategory name
      const emojiMatch = raw.match(/^(\S+)\s+(.+)/);
      if (emojiMatch) {
        subcategory = emojiMatch[2].trim();
      } else {
        subcategory = raw;
      }
      continue;
    }

    // Task item: - [ ] text [source:X] [imported:YYYY-MM-DD]
    const taskMatch = line.match(/^- \[([ x])\] (.+)/);
    if (taskMatch) {
      const checked = taskMatch[1] === 'x';
      let text = taskMatch[2].trim();
      let source: string | undefined;
      let importedAt: string | undefined;

      // Extract [source:X]
      const sourceMatch = text.match(/\[source:([^\]]+)\]/);
      if (sourceMatch) {
        source = sourceMatch[1].trim();
        text = text.replace(/\s*\[source:[^\]]+\]/, '');
      }

      // Extract [imported:YYYY-MM-DD]
      const importMatch = text.match(/\[imported:(\d{4}-\d{2}-\d{2})\]/);
      if (importMatch) {
        importedAt = importMatch[1];
        text = text.replace(/\s*\[imported:\d{4}-\d{2}-\d{2}\]/, '');
      }

      text = text.trim();

      const status: BacklogItemStatus = checked ? 'archived' : 'active';

      items.push({
        id: backlogId(text),
        text,
        category,
        subcategory,
        status,
        source,
        importedAt,
      });
    }
  }
  return items;
}

function serializeBacklogItems(items: BacklogItem[]): string {
  const lines: string[] = [];

  // Group by subcategory
  const grouped = new Map<string | undefined, BacklogItem[]>();
  for (const item of items) {
    const key = item.subcategory;
    const arr = grouped.get(key) ?? [];
    arr.push(item);
    grouped.set(key, arr);
  }

  for (const [sub, subItems] of grouped) {
    if (sub) {
      lines.push(`## ${sub}`);
    }
    for (const item of subItems) {
      const check = item.status === 'archived' ? 'x' : ' ';
      let line = `- [${check}] ${item.text}`;
      if (item.source) line += ` [source:${item.source}]`;
      if (item.importedAt) line += ` [imported:${item.importedAt}]`;
      lines.push(line);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// --- MarkdownBacklogStore ---

export class MarkdownBacklogStore implements BacklogStore {
  private baseDir: string;

  constructor(baseDir: string) {
    this.baseDir = baseDir;
  }

  async listCategories(): Promise<string[]> {
    const fs = await import('node:fs/promises');
    const { join } = await import('node:path');
    try {
      const entries = await fs.readdir(this.baseDir, { withFileTypes: true });
      const categories: string[] = [];
      for (const entry of entries) {
        if (entry.isDirectory()) {
          try {
            await fs.access(join(this.baseDir, entry.name, 'current.md'));
            categories.push(entry.name);
          } catch {
            // No current.md — skip
          }
        }
      }
      return categories.sort();
    } catch {
      return [];
    }
  }

  async loadCategory(category: string): Promise<BacklogItem[]> {
    const fs = await import('node:fs/promises');
    const { join } = await import('node:path');
    try {
      const content = await fs.readFile(join(this.baseDir, category, 'current.md'), 'utf-8');
      return parseBacklogItems(content, category);
    } catch {
      return [];
    }
  }

  async saveCategory(category: string, items: BacklogItem[]): Promise<void> {
    const fs = await import('node:fs/promises');
    const { join } = await import('node:path');
    const dir = join(this.baseDir, category);
    await fs.mkdir(dir, { recursive: true });
    const active = items.filter(i => i.status !== 'archived');
    await fs.writeFile(join(dir, 'current.md'), serializeBacklogItems(active), 'utf-8');
  }

  async loadArchive(category: string): Promise<BacklogItem[]> {
    const fs = await import('node:fs/promises');
    const { join } = await import('node:path');
    try {
      const content = await fs.readFile(join(this.baseDir, category, 'archive.md'), 'utf-8');
      return parseBacklogItems(content, category).map(i => ({ ...i, status: 'archived' as const }));
    } catch {
      return [];
    }
  }

  async saveArchive(category: string, items: BacklogItem[]): Promise<void> {
    const fs = await import('node:fs/promises');
    const { join } = await import('node:path');
    const dir = join(this.baseDir, category);
    await fs.mkdir(dir, { recursive: true });
    const archived = items.map(i => ({ ...i, status: 'archived' as const }));
    await fs.writeFile(join(dir, 'archive.md'), serializeBacklogItems(archived), 'utf-8');
  }

  async loadAll(): Promise<BacklogItem[]> {
    const categories = await this.listCategories();
    const all: BacklogItem[] = [];
    for (const cat of categories) {
      const items = await this.loadCategory(cat);
      all.push(...items);
    }
    return all;
  }
}

// --- InMemoryBacklogStore ---

export class InMemoryBacklogStore implements BacklogStore {
  private data = new Map<string, BacklogItem[]>();
  private archives = new Map<string, BacklogItem[]>();

  async listCategories(): Promise<string[]> {
    return [...this.data.keys()].sort();
  }

  async loadCategory(category: string): Promise<BacklogItem[]> {
    return [...(this.data.get(category) ?? [])];
  }

  async saveCategory(category: string, items: BacklogItem[]): Promise<void> {
    this.data.set(category, [...items]);
  }

  async loadArchive(category: string): Promise<BacklogItem[]> {
    return [...(this.archives.get(category) ?? [])];
  }

  async saveArchive(category: string, items: BacklogItem[]): Promise<void> {
    this.archives.set(category, [...items]);
  }

  async loadAll(): Promise<BacklogItem[]> {
    const all: BacklogItem[] = [];
    for (const items of this.data.values()) {
      all.push(...items);
    }
    return all;
  }
}

