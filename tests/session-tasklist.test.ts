import { describe, it, expect } from 'vitest';
import { SessionEngine } from '../src/session.js';
import { TaskList, InMemoryTaskListStore } from '../src/tasklist.js';

function makeTime(base: string, addMinutes: number = 0): Date {
  const d = new Date(base);
  d.setMinutes(d.getMinutes() + addMinutes);
  return d;
}

const T0 = '2026-02-15T10:00:00Z';

function createEngine() {
  const store = new InMemoryTaskListStore();
  const tasklist = new TaskList(store);
  return { engine: new SessionEngine({ tasklist }), tasklist };
}

describe('SessionEngine + TaskList', () => {
  it('list command works when idle', async () => {
    const { engine, tasklist } = createEngine();
    await tasklist.add('fix tap', 'home', 'hot');

    const result = await engine.handle('hot list', makeTime(T0));
    expect(result).toContain('🔥 Phasr · Hot List');
    expect(result).toContain('fix tap');
  });

  it('add command works when idle', async () => {
    const { engine } = createEngine();
    const result = await engine.handle('add fix the blinds to home', makeTime(T0));
    expect(result).toContain('Added to backlog');
    expect(result).toContain('fix the blinds');
  });

  it('add to hot list works', async () => {
    const { engine } = createEngine();
    const result = await engine.handle('add urgent task to hot list', makeTime(T0));
    expect(result).toContain('Added to hot list');
  });

  it('done X marks hot list item as done', async () => {
    const { engine, tasklist } = createEngine();
    await tasklist.add('fix tap', 'home', 'hot');

    const result = await engine.handle('done fix tap', makeTime(T0));
    expect(result).toContain('✅');
    expect(result).toContain('fix tap');

    const hot = await tasklist.getHotList();
    expect(hot.length).toBe(0);
    const archive = await tasklist.getArchive();
    expect(archive.length).toBe(1);
  });

  it('promote moves backlog item to hot list', async () => {
    const { engine, tasklist } = createEngine();
    await tasklist.add('repaint hallway', 'home');

    const result = await engine.handle('promote repaint hallway', makeTime(T0));
    expect(result).toContain('Promoted to hot list');

    const hot = await tasklist.getHotList();
    expect(hot.length).toBe(1);
    expect(hot[0].text).toBe('repaint hallway');
  });

  it('list command works mid-session', async () => {
    const { engine, tasklist } = createEngine();
    await tasklist.add('existing task', 'work', 'hot');

    // Start a session
    await engine.handle('Prep: memo (30m)', makeTime(T0));
    await engine.handle('Final pass.', makeTime(T0, 0.5));
    expect(engine.isActive).toBe(true);

    // Add item while session is running
    const addResult = await engine.handle('add call dentist', makeTime(T0, 1));
    expect(addResult).toContain('Added to backlog');

    // View hot list while session is running
    const viewResult = await engine.handle('hot list', makeTime(T0, 1.5));
    expect(viewResult).toContain('existing task');
  });

  it('knock out starts a session from hot list', async () => {
    const { engine, tasklist } = createEngine();
    await tasklist.add('task 1', 'home', 'hot');
    await tasklist.add('task 2', 'work', 'hot');
    await tasklist.add('task 3', 'tech', 'hot');

    const result = await engine.handle('knock out 3 in 20m', makeTime(T0));
    expect(result).toContain('3 items from hot list');
    expect(result).toContain('20m');
    expect(result).toContain('task 1');
    expect(engine.isActive).toBe(true);
  });

  it('knock out auto-marks items done', async () => {
    const { engine, tasklist } = createEngine();
    await tasklist.add('task 1', 'home', 'hot');
    await tasklist.add('task 2', 'work', 'hot');

    await engine.handle('knock out 2 in 20m', makeTime(T0));

    // Complete first step
    await engine.handle('done', makeTime(T0, 2));

    // task 1 should now be marked done
    const hot = await tasklist.getHotList();
    expect(hot.length).toBe(1);
    expect(hot[0].text).toBe('task 2');

    const archive = await tasklist.getArchive();
    expect(archive.length).toBe(1);
    expect(archive[0].text).toBe('task 1');
  });

  it('recommend suggests backlog items', async () => {
    const { engine, tasklist } = createEngine();
    await tasklist.add('old task 1', 'home');
    await tasklist.add('old task 2', 'work');
    await tasklist.add('old task 3', 'tech');

    const result = await engine.handle('recommend', makeTime(T0));
    expect(result).toContain('backlog to consider promoting');
    expect(result).toContain('old task 1');
    expect(result).toContain('promote X');
  });

  it('engine works fine without tasklist (null)', async () => {
    const engine = new SessionEngine();
    const result = await engine.handle('hot list', makeTime(T0));
    // Should fall through to normal handling, not crash
    expect(typeof result).toBe('string');
  });

  it('show backlog with category', async () => {
    const { engine, tasklist } = createEngine();
    await tasklist.add('home task', 'home');
    await tasklist.add('work task', 'work');

    const result = await engine.handle('show home backlog', makeTime(T0));
    expect(result).toContain('Home Backlog');
    expect(result).toContain('home task');
    expect(result).not.toContain('work task');
  });

  it('show archive', async () => {
    const { engine, tasklist } = createEngine();
    await tasklist.add('done task', 'work', 'hot');
    await tasklist.markDone('done task');

    const result = await engine.handle('show work archive', makeTime(T0));
    expect(result).toContain('Work Archive');
    expect(result).toContain('done task');
  });

  it('auto-categorises with keyword fallback', async () => {
    const { engine, tasklist } = createEngine();

    await engine.handle('add mow the lawn', makeTime(T0));
    const items = await tasklist.getBacklog();
    expect(items[0].category).toBe('garden');
  });

  it('knock out with empty hot list', async () => {
    const { engine } = createEngine();
    const result = await engine.handle('knock out 3 in 20m', makeTime(T0));
    expect(result).toContain('empty');
  });
});

