import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TaskList, InMemoryTaskListStore, MarkdownTaskListStore } from '../src/tasklist.js';
import type { ItemCategory, TaskItem } from '../src/types.js';
import { writeFile, mkdir, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

function createTaskList() {
  const store = new InMemoryTaskListStore();
  return new TaskList(store);
}

describe('TaskList', () => {
  describe('add', () => {
    it('adds item to backlog by default', async () => {
      const tl = createTaskList();
      const item = await tl.add('research blinds options', 'home');
      expect(item.status).toBe('backlog');
      expect(item.category).toBe('home');
      expect(item.text).toBe('research blinds options');
      expect(item.promotedAt).toBeNull();
      expect(item.completedAt).toBeNull();
      expect(item.id).toBeTruthy();
    });

    it('adds item directly to hot list', async () => {
      const tl = createTaskList();
      const item = await tl.add('fix kitchen tap', 'home', 'hot');
      expect(item.status).toBe('hot');
      expect(item.promotedAt).toBeInstanceOf(Date);
    });
  });

  describe('promote', () => {
    it('moves item from backlog to hot', async () => {
      const tl = createTaskList();
      await tl.add('repaint hallway', 'home');
      const promoted = await tl.promote('repaint hallway');
      expect(promoted).not.toBeNull();
      expect(promoted!.status).toBe('hot');
      expect(promoted!.promotedAt).toBeInstanceOf(Date);
    });

    it('returns null for non-existent item', async () => {
      const tl = createTaskList();
      const result = await tl.promote('nonexistent');
      expect(result).toBeNull();
    });

    it('does not promote items already on hot list', async () => {
      const tl = createTaskList();
      await tl.add('task', 'work', 'hot');
      const result = await tl.promote('task');
      expect(result).toBeNull();
    });
  });

  describe('markDone', () => {
    it('moves hot item to done', async () => {
      const tl = createTaskList();
      await tl.add('fix tap', 'home', 'hot');
      const done = await tl.markDone('fix tap');
      expect(done).not.toBeNull();
      expect(done!.status).toBe('done');
      expect(done!.completedAt).toBeInstanceOf(Date);
    });

    it('returns null for backlog item', async () => {
      const tl = createTaskList();
      await tl.add('fix tap', 'home');
      const result = await tl.markDone('fix tap');
      expect(result).toBeNull();
    });
  });

  describe('remove', () => {
    it('removes item from list', async () => {
      const tl = createTaskList();
      await tl.add('delete me', 'other');
      const removed = await tl.remove('delete me');
      expect(removed).not.toBeNull();
      const all = await tl.getAllItems();
      expect(all.length).toBe(0);
    });
  });

  describe('queries', () => {
    it('getHotList returns only hot items', async () => {
      const tl = createTaskList();
      await tl.add('backlog item', 'work');
      await tl.add('hot item', 'work', 'hot');
      const hot = await tl.getHotList();
      expect(hot.length).toBe(1);
      expect(hot[0].text).toBe('hot item');
    });

    it('getBacklog filters by category', async () => {
      const tl = createTaskList();
      await tl.add('home task', 'home');
      await tl.add('work task', 'work');
      const homeBacklog = await tl.getBacklog('home');
      expect(homeBacklog.length).toBe(1);
      expect(homeBacklog[0].text).toBe('home task');
    });

    it('getArchive filters by category', async () => {
      const tl = createTaskList();
      const item = await tl.add('done task', 'work', 'hot');
      await tl.markDone('done task');
      const archive = await tl.getArchive('work');
      expect(archive.length).toBe(1);
      const otherArchive = await tl.getArchive('home');
      expect(otherArchive.length).toBe(0);
    });
  });

  describe('fuzzy matching', () => {
    it('matches exact text', async () => {
      const tl = createTaskList();
      const item = await tl.add('research blinds options', 'home', 'hot');
      const items = await tl.getHotList();
      const found = tl.findByText('research blinds options', items);
      expect(found).not.toBeNull();
      expect(found!.id).toBe(item.id);
    });

    it('matches substring ("blinds" matches "research blinds options")', async () => {
      const tl = createTaskList();
      await tl.add('research blinds options', 'home', 'hot');
      const items = await tl.getHotList();
      const found = tl.findByText('blinds', items);
      expect(found).not.toBeNull();
      expect(found!.text).toBe('research blinds options');
    });

    it('matches by word overlap', async () => {
      const tl = createTaskList();
      await tl.add('research blinds options', 'home', 'hot');
      const items = await tl.getHotList();
      const found = tl.findByText('blinds research', items);
      expect(found).not.toBeNull();
    });

    it('returns null for no match', async () => {
      const tl = createTaskList();
      await tl.add('fix tap', 'home', 'hot');
      const items = await tl.getHotList();
      const found = tl.findByText('completely unrelated', items);
      expect(found).toBeNull();
    });
  });

  describe('persistence', () => {
    it('round-trips through InMemoryTaskListStore', async () => {
      const store = new InMemoryTaskListStore();
      const tl1 = new TaskList(store);
      await tl1.add('persist me', 'work');

      // Create new TaskList with same store
      const tl2 = new TaskList(store);
      const items = await tl2.getBacklog();
      expect(items.length).toBe(1);
      expect(items[0].text).toBe('persist me');
    });
  });

  describe('formatting', () => {
    it('formats empty hot list', async () => {
      const tl = createTaskList();
      const items = await tl.getHotList();
      const output = tl.formatHotList(items);
      expect(output).toContain('No items');
    });

    it('formats hot list grouped by category', async () => {
      const tl = createTaskList();
      await tl.add('research blinds', 'home', 'hot');
      await tl.add('fix tap', 'home', 'hot');
      await tl.add('finish report', 'work', 'hot');
      const items = await tl.getHotList();
      const output = tl.formatHotList(items);
      expect(output).toContain('🔥 Phasr · Hot List');
      expect(output).toContain('🏠 Home');
      expect(output).toContain('💼 Work');
      expect(output).toContain('research blinds');
      expect(output).toContain('3 items');
    });

    it('formats added item', async () => {
      const tl = createTaskList();
      const item = await tl.add('new task', 'tech');
      const output = tl.formatAdded(item);
      expect(output).toContain('🤖');
      expect(output).toContain('backlog');
      expect(output).toContain('new task');
    });

    it('formats done item', async () => {
      const tl = createTaskList();
      const item = await tl.add('finished', 'work', 'hot');
      await tl.markDone('finished');
      const output = tl.formatDone(item);
      expect(output).toContain('✅');
      expect(output).toContain('finished');
    });

    it('formats backlog', async () => {
      const tl = createTaskList();
      await tl.add('backlog item', 'home');
      const items = await tl.getBacklog('home');
      const output = tl.formatBacklog(items, 'home');
      expect(output).toContain('📋 Phasr · Home Backlog');
      expect(output).toContain('backlog item');
    });

    it('formats archive', async () => {
      const tl = createTaskList();
      await tl.add('done item', 'work', 'hot');
      await tl.markDone('done item');
      const items = await tl.getArchive('work');
      const output = tl.formatArchive(items, 'work');
      expect(output).toContain('✅ Phasr · Work Archive');
      expect(output).toContain('done item');
    });
  });
});

describe('MarkdownTaskListStore', () => {
  let dir: string;

  beforeEach(async () => {
    dir = join(tmpdir(), `phasr-test-${Date.now()}`);
    await mkdir(dir, { recursive: true });
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('returns empty array for missing file', async () => {
    const store = new MarkdownTaskListStore(join(dir, 'missing.md'));
    const items = await store.load();
    expect(items).toEqual([]);
  });

  it('parses markdown with hot + backlog + completed sections', async () => {
    const md = [
      '# Hot List 🔥',
      '*Last updated: 2026-03-07*',
      '',
      '## 🏠 Home',
      '- [ ] Fix blind in main bedroom',
      '- [ ] Glue down saddle board',
      '',
      '## 💼 Work',
      '- [ ] Finish Q2 report',
      '',
      '# Backlog 📋',
      '',
      '## 🌿 Garden',
      '- [ ] Spray algae cleaner on walls',
      '',
      '# ✅ Completed (March 2026)',
      '',
      '- [x] Measure patio fall (2026-03-06)',
      '',
    ].join('\n');

    const filePath = join(dir, 'tasklist.md');
    await writeFile(filePath, md, 'utf-8');
    const store = new MarkdownTaskListStore(filePath);
    const items = await store.load();

    expect(items.length).toBe(5);

    const hot = items.filter(i => i.status === 'hot');
    expect(hot.length).toBe(3);
    expect(hot[0].text).toBe('Fix blind in main bedroom');
    expect(hot[0].category).toBe('home');
    expect(hot[1].text).toBe('Glue down saddle board');
    expect(hot[1].category).toBe('home');
    expect(hot[2].text).toBe('Finish Q2 report');
    expect(hot[2].category).toBe('work');

    const backlog = items.filter(i => i.status === 'backlog');
    expect(backlog.length).toBe(1);
    expect(backlog[0].text).toBe('Spray algae cleaner on walls');
    expect(backlog[0].category).toBe('garden');

    const done = items.filter(i => i.status === 'done');
    expect(done.length).toBe(1);
    expect(done[0].text).toBe('Measure patio fall');
    expect(done[0].completedAt).toEqual(new Date('2026-03-06'));
  });

  it('round-trips items through save and load', async () => {
    const filePath = join(dir, 'tasklist.md');
    const store = new MarkdownTaskListStore(filePath);

    const items: TaskItem[] = [
      {
        id: 'a1', text: 'Fix blind', category: 'home', status: 'hot',
        addedAt: new Date(), promotedAt: new Date(), completedAt: null,
      },
      {
        id: 'b1', text: 'Spray walls', category: 'garden', status: 'backlog',
        addedAt: new Date(), promotedAt: null, completedAt: null,
      },
      {
        id: 'c1', text: 'File taxes', category: 'work', status: 'done',
        addedAt: new Date(), promotedAt: null, completedAt: new Date('2026-03-05'),
      },
    ];

    await store.save(items);
    const loaded = await store.load();

    expect(loaded.length).toBe(3);
    expect(loaded.find(i => i.text === 'Fix blind')?.status).toBe('hot');
    expect(loaded.find(i => i.text === 'Spray walls')?.status).toBe('backlog');
    expect(loaded.find(i => i.text === 'File taxes')?.status).toBe('done');
    expect(loaded.find(i => i.text === 'File taxes')?.completedAt).toEqual(new Date('2026-03-05'));
  });

  it('generates deterministic IDs from text', async () => {
    const filePath = join(dir, 'tasklist.md');
    const store = new MarkdownTaskListStore(filePath);

    const items: TaskItem[] = [
      {
        id: 'will-change', text: 'Test item', category: 'work', status: 'hot',
        addedAt: new Date(), promotedAt: new Date(), completedAt: null,
      },
    ];

    await store.save(items);
    const loaded1 = await store.load();
    await store.save(loaded1);
    const loaded2 = await store.load();

    // ID is deterministic from text, so survives round-trips
    expect(loaded1[0].id).toBe(loaded2[0].id);
  });

  it('omits empty sections on save', async () => {
    const filePath = join(dir, 'tasklist.md');
    const store = new MarkdownTaskListStore(filePath);

    const items: TaskItem[] = [
      {
        id: 'a1', text: 'Only hot item', category: 'home', status: 'hot',
        addedAt: new Date(), promotedAt: new Date(), completedAt: null,
      },
    ];

    await store.save(items);
    const content = await readFile(filePath, 'utf-8');
    expect(content).toContain('# Hot List');
    expect(content).not.toContain('# Backlog');
    expect(content).not.toContain('# ✅ Completed');
  });

  it('treats all unchecked items as hot when no section markers present', async () => {
    const md = [
      '- [ ] Buy milk',
      '- [ ] Fix kitchen tap',
      '- [x] Already done (2026-03-01)',
      '',
    ].join('\n');

    const filePath = join(dir, 'plain.md');
    await writeFile(filePath, md, 'utf-8');
    const store = new MarkdownTaskListStore(filePath);
    const items = await store.load();

    expect(items.length).toBe(3);
    const hot = items.filter(i => i.status === 'hot');
    expect(hot.length).toBe(2);
    expect(hot[0].text).toBe('Buy milk');
    expect(hot[1].text).toBe('Fix kitchen tap');

    const done = items.filter(i => i.status === 'done');
    expect(done.length).toBe(1);
    expect(done[0].text).toBe('Already done');
  });

  it('uses structured parsing when section markers are present', async () => {
    const md = [
      '# Hot List 🔥',
      '- [ ] Hot item',
      '',
      '# Backlog 📋',
      '- [ ] Backlog item',
      '',
    ].join('\n');

    const filePath = join(dir, 'structured.md');
    await writeFile(filePath, md, 'utf-8');
    const store = new MarkdownTaskListStore(filePath);
    const items = await store.load();

    expect(items.length).toBe(2);
    expect(items.find(i => i.text === 'Hot item')?.status).toBe('hot');
    expect(items.find(i => i.text === 'Backlog item')?.status).toBe('backlog');
  });

  it('maps category headers correctly via emoji', async () => {
    const md = [
      '# Hot List 🔥',
      '',
      '## 🤖 Tech',
      '- [ ] Update firmware',
      '',
      '## 👨‍👩‍👦‍👦 Family',
      '- [ ] Book dentist',
      '',
      '## 🍽 Food',
      '- [ ] Meal prep',
      '',
    ].join('\n');

    const filePath = join(dir, 'tasklist.md');
    await writeFile(filePath, md, 'utf-8');
    const store = new MarkdownTaskListStore(filePath);
    const items = await store.load();

    expect(items.find(i => i.text === 'Update firmware')?.category).toBe('tech');
    expect(items.find(i => i.text === 'Book dentist')?.category).toBe('family');
    expect(items.find(i => i.text === 'Meal prep')?.category).toBe('food');
  });
});

