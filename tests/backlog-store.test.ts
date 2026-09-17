import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MarkdownBacklogStore, InMemoryBacklogStore } from '../src/backlog-store.js';
import type { BacklogItem } from '../src/types.js';
import { writeFile, mkdir, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('InMemoryBacklogStore', () => {
  it('starts empty', async () => {
    const store = new InMemoryBacklogStore();
    expect(await store.listCategories()).toEqual([]);
    expect(await store.loadAll()).toEqual([]);
  });

  it('saves and loads category items', async () => {
    const store = new InMemoryBacklogStore();
    const items: BacklogItem[] = [
      { id: 'a1', text: 'Fix fence', category: 'home', status: 'active' },
    ];
    await store.saveCategory('home', items);
    const loaded = await store.loadCategory('home');
    expect(loaded.length).toBe(1);
    expect(loaded[0].text).toBe('Fix fence');
  });

  it('listCategories returns saved categories sorted', async () => {
    const store = new InMemoryBacklogStore();
    await store.saveCategory('work', [{ id: 'w1', text: 'Report', category: 'work', status: 'active' }]);
    await store.saveCategory('home', [{ id: 'h1', text: 'Fix tap', category: 'home', status: 'active' }]);
    const cats = await store.listCategories();
    expect(cats).toEqual(['home', 'work']);
  });

  it('saves and loads archive', async () => {
    const store = new InMemoryBacklogStore();
    const items: BacklogItem[] = [
      { id: 'a1', text: 'Old task', category: 'home', status: 'archived', completedAt: '2026-03-01' },
    ];
    await store.saveArchive('home', items);
    const loaded = await store.loadArchive('home');
    expect(loaded.length).toBe(1);
    expect(loaded[0].text).toBe('Old task');
  });

  it('loadAll aggregates all categories', async () => {
    const store = new InMemoryBacklogStore();
    await store.saveCategory('home', [{ id: 'h1', text: 'Fix tap', category: 'home', status: 'active' }]);
    await store.saveCategory('work', [{ id: 'w1', text: 'Report', category: 'work', status: 'active' }]);
    const all = await store.loadAll();
    expect(all.length).toBe(2);
  });
});

describe('MarkdownBacklogStore', () => {
  let dir: string;

  beforeEach(async () => {
    dir = join(tmpdir(), `phasr-backlog-test-${Date.now()}`);
    await mkdir(dir, { recursive: true });
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('returns empty for missing dir', async () => {
    const store = new MarkdownBacklogStore(join(dir, 'nonexistent'));
    expect(await store.listCategories()).toEqual([]);
    expect(await store.loadAll()).toEqual([]);
  });

  it('returns empty for category with no current.md', async () => {
    const store = new MarkdownBacklogStore(dir);
    await mkdir(join(dir, 'home'), { recursive: true });
    // No current.md
    expect(await store.listCategories()).toEqual([]);
  });

  it('lists categories that have current.md', async () => {
    const store = new MarkdownBacklogStore(dir);
    await mkdir(join(dir, 'home'), { recursive: true });
    await writeFile(join(dir, 'home', 'current.md'), '- [ ] Fix fence\n', 'utf-8');
    await mkdir(join(dir, 'work'), { recursive: true });
    await writeFile(join(dir, 'work', 'current.md'), '- [ ] Report\n', 'utf-8');
    const cats = await store.listCategories();
    expect(cats).toEqual(['home', 'work']);
  });

  it('loads items from current.md', async () => {
    const store = new MarkdownBacklogStore(dir);
    const md = [
      '## Repairs',
      '- [ ] Fix fence',
      '- [ ] Paint wall',
      '',
    ].join('\n');
    await mkdir(join(dir, 'home'), { recursive: true });
    await writeFile(join(dir, 'home', 'current.md'), md, 'utf-8');

    const items = await store.loadCategory('home');
    expect(items.length).toBe(2);
    expect(items[0].text).toBe('Fix fence');
    expect(items[0].category).toBe('home');
    expect(items[0].subcategory).toBe('Repairs');
    expect(items[1].text).toBe('Paint wall');
  });

  it('parses source and imported tags', async () => {
    const store = new MarkdownBacklogStore(dir);
    const md = '- [ ] Buy nails [source:hardware-store] [imported:2026-03-01]\n';
    await mkdir(join(dir, 'home'), { recursive: true });
    await writeFile(join(dir, 'home', 'current.md'), md, 'utf-8');

    const items = await store.loadCategory('home');
    expect(items.length).toBe(1);
    expect(items[0].text).toBe('Buy nails');
    expect(items[0].source).toBe('hardware-store');
    expect(items[0].importedAt).toBe('2026-03-01');
  });

  it('round-trips through save and load', async () => {
    const store = new MarkdownBacklogStore(dir);
    const items: BacklogItem[] = [
      { id: 'a1', text: 'Fix fence', category: 'home', status: 'active', subcategory: 'Repairs' },
      { id: 'a2', text: 'Paint wall', category: 'home', status: 'active', subcategory: 'Repairs' },
    ];
    await store.saveCategory('home', items);
    const loaded = await store.loadCategory('home');
    expect(loaded.length).toBe(2);
    expect(loaded[0].text).toBe('Fix fence');
    expect(loaded[1].text).toBe('Paint wall');
  });

  it('saves and loads archive', async () => {
    const store = new MarkdownBacklogStore(dir);
    const items: BacklogItem[] = [
      { id: 'a1', text: 'Old task', category: 'home', status: 'archived', completedAt: '2026-03-01' },
    ];
    await store.saveArchive('home', items);
    const loaded = await store.loadArchive('home');
    expect(loaded.length).toBe(1);
    expect(loaded[0].text).toBe('Old task');
    expect(loaded[0].status).toBe('archived');
  });

  it('creates directories on save', async () => {
    const store = new MarkdownBacklogStore(dir);
    const items: BacklogItem[] = [
      { id: 'n1', text: 'New thing', category: 'newcat', status: 'active' },
    ];
    await store.saveCategory('newcat', items);
    const content = await readFile(join(dir, 'newcat', 'current.md'), 'utf-8');
    expect(content).toContain('New thing');
  });

  it('loadAll aggregates across categories', async () => {
    const store = new MarkdownBacklogStore(dir);
    await mkdir(join(dir, 'home'), { recursive: true });
    await writeFile(join(dir, 'home', 'current.md'), '- [ ] Fix fence\n', 'utf-8');
    await mkdir(join(dir, 'work'), { recursive: true });
    await writeFile(join(dir, 'work', 'current.md'), '- [ ] Write report\n', 'utf-8');

    const all = await store.loadAll();
    expect(all.length).toBe(2);
    expect(all.map(i => i.text).sort()).toEqual(['Fix fence', 'Write report']);
  });

  it('filters out archived items from saveCategory', async () => {
    const store = new MarkdownBacklogStore(dir);
    const items: BacklogItem[] = [
      { id: 'a1', text: 'Active task', category: 'home', status: 'active' },
      { id: 'a2', text: 'Archived task', category: 'home', status: 'archived' },
    ];
    await store.saveCategory('home', items);
    const loaded = await store.loadCategory('home');
    expect(loaded.length).toBe(1);
    expect(loaded[0].text).toBe('Active task');
  });
});

