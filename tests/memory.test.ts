import { describe, it, expect } from 'vitest';
import { InMemoryStore } from '../src/memory.js';
import { SessionEngine } from '../src/session.js';
import { SessionType } from '../src/types.js';
import type { SessionRecord } from '../src/memory.js';

function makeTime(base: string, addMinutes: number = 0): Date {
  const d = new Date(base);
  d.setMinutes(d.getMinutes() + addMinutes);
  return d;
}

const T0 = '2026-02-15T10:00:00Z';

describe('InMemoryStore', () => {
  it('saves and retrieves records', async () => {
    const store = new InMemoryStore();
    const record: SessionRecord = {
      id: 'test-1',
      type: SessionType.PREP,
      task: 'board memo',
      startedAt: new Date(T0),
      endedAt: makeTime(T0, 30),
      durationMinutes: 30,
      stepsCompleted: ['step 1', 'step 2'],
      stepsRemaining: ['step 3'],
      outcome: 'stopped',
    };

    await store.save(record);
    const recent = await store.getRecent(10);
    expect(recent).toHaveLength(1);
    expect(recent[0].task).toBe('board memo');
  });

  it('filters by type', async () => {
    const store = new InMemoryStore();
    await store.save({
      id: '1', type: SessionType.PREP, task: 'report',
      startedAt: new Date(T0), endedAt: makeTime(T0, 10),
      durationMinutes: 10, stepsCompleted: [], stepsRemaining: [], outcome: 'completed',
    });
    await store.save({
      id: '2', type: SessionType.PACK, task: 'trip',
      startedAt: new Date(T0), endedAt: makeTime(T0, 20),
      durationMinutes: 20, stepsCompleted: [], stepsRemaining: [], outcome: 'completed',
    });

    const preps = await store.getByType(SessionType.PREP);
    expect(preps).toHaveLength(1);
    expect(preps[0].task).toBe('report');
  });

  it('filters by task (case-insensitive, partial match)', async () => {
    const store = new InMemoryStore();
    await store.save({
      id: '1', type: SessionType.PREP, task: 'Board Memo Draft',
      startedAt: new Date(T0), endedAt: makeTime(T0, 10),
      durationMinutes: 10, stepsCompleted: [], stepsRemaining: [], outcome: 'completed',
    });

    const results = await store.getByTask('board memo');
    expect(results).toHaveLength(1);
  });

  it('returns last N records', async () => {
    const store = new InMemoryStore();
    for (let i = 0; i < 5; i++) {
      await store.save({
        id: `${i}`, type: SessionType.PREP, task: `task ${i}`,
        startedAt: new Date(T0), endedAt: makeTime(T0, 10),
        durationMinutes: 10, stepsCompleted: [], stepsRemaining: [], outcome: 'completed',
      });
    }

    const recent = await store.getRecent(3);
    expect(recent).toHaveLength(3);
    expect(recent[0].task).toBe('task 2');
    expect(recent[2].task).toBe('task 4');
  });
});

describe('SessionEngine memory integration', () => {
  it('saves record after session ends', async () => {
    const store = new InMemoryStore();
    const engine = new SessionEngine({ memory: store });

    await engine.handle('Prep: report (30m)', makeTime(T0));
    await engine.handle('Final pass', makeTime(T0, 1));
    // Complete step 1
    await engine.handle('done', makeTime(T0, 5));
    // Stop mid-session
    await engine.handle('stop', makeTime(T0, 8));

    // Wait for fire-and-forget save
    await new Promise(resolve => setTimeout(resolve, 10));

    const records = await store.getRecent(10);
    expect(records).toHaveLength(1);
    expect(records[0].type).toBe(SessionType.PREP);
    expect(records[0].task).toBe('report');
    expect(records[0].outcome).toBe('stopped');
    expect(records[0].stepsCompleted).toContain('read top-to-bottom once; mark only unclear sentences');
  });

  it('marks outcome as completed when all steps done', async () => {
    const store = new InMemoryStore();
    const engine = new SessionEngine({ memory: store });

    await engine.handle('Pack: trip (60m)', makeTime(T0));
    await engine.handle('Yes', makeTime(T0, 1));
    await engine.handle('done', makeTime(T0, 3)); // toiletries
    await engine.handle('done', makeTime(T0, 5)); // tech
    await engine.handle('done', makeTime(T0, 7)); // documents
    await engine.handle('done', makeTime(T0, 9)); // end

    await new Promise(resolve => setTimeout(resolve, 10));

    const records = await store.getRecent(10);
    expect(records).toHaveLength(1);
    expect(records[0].outcome).toBe('completed');
  });

  it('works without memory configured', async () => {
    const engine = new SessionEngine();
    await engine.handle('Prep: report (30m)', makeTime(T0));
    await engine.handle('Final pass', makeTime(T0, 1));
    const r = await engine.handle('stop', makeTime(T0, 5));
    expect(r).toContain('Done:');
  });
});

