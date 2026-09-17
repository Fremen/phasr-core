import { describe, it, expect } from 'vitest';
import { SessionEngine } from '../src/session.js';
import { InMemoryStore } from '../src/memory.js';

/**
 * Tests the MCP tool logic via SessionEngine directly.
 * This validates the full lifecycle that MCP tools expose
 * without requiring MCP transport plumbing.
 */

function makeTime(base: string, addMinutes: number = 0): Date {
  const d = new Date(base);
  d.setMinutes(d.getMinutes() + addMinutes);
  return d;
}

const T0 = '2026-02-15T10:00:00Z';

describe('MCP tool lifecycle', () => {
  it('phasr_start → phasr_step → phasr_status → phasr_pause → phasr_stop', async () => {
    const memory = new InMemoryStore();
    const engine = new SessionEngine({ memory });

    // phasr_start: construct trigger and handle
    const startResponse = await engine.handle('Prep: board memo (30m)', makeTime(T0));
    expect(startResponse).toContain('Phasr');
    expect(startResponse).toContain('30 minutes');
    expect(engine.isActive).toBe(true);

    // Answer the starter question
    const stepResponse = await engine.handle('Final pass.', makeTime(T0, 1));
    expect(stepResponse).toContain('Step 1');
    expect(stepResponse).toContain('Phasr');

    // phasr_status: getSnapshot
    const snapshot = engine.getSnapshot(makeTime(T0, 2));
    expect(snapshot).not.toBeNull();
    expect(snapshot!.type).toBe('PREP');
    expect(snapshot!.state).toBe('RUNNING');
    expect(snapshot!.task).toBe('board memo');
    expect(snapshot!.stepIndex).toBe(1);
    expect(snapshot!.currentStep).toContain('read top-to-bottom');
    expect(snapshot!.stepsCompleted).toHaveLength(0);
    expect(snapshot!.minutesLeft).toBeLessThanOrEqual(29);
    expect(snapshot!.nudgeEnabled).toBe(true);
    expect(snapshot!.stackDepth).toBe(1);

    // phasr_step: say "done" to advance
    const doneResponse = await engine.handle('done', makeTime(T0, 5));
    expect(doneResponse).toContain('Step 2');

    // Verify snapshot updated
    const snapshot2 = engine.getSnapshot(makeTime(T0, 6));
    expect(snapshot2!.stepIndex).toBe(2);
    expect(snapshot2!.stepsCompleted).toHaveLength(1);

    // phasr_pause
    const pauseResponse = await engine.handle('pause', makeTime(T0, 8));
    expect(pauseResponse).toContain('Phasr');
    expect(pauseResponse).toContain('paused');

    const pausedSnapshot = engine.getSnapshot(makeTime(T0, 9));
    expect(pausedSnapshot!.state).toBe('PAUSED');

    // phasr_stop
    const stopResponse = await engine.handle('stop', makeTime(T0, 10));
    expect(stopResponse).toContain('Done:');
    expect(engine.isActive).toBe(false);

    // After stop, snapshot returns null
    expect(engine.getSnapshot(makeTime(T0, 11))).toBeNull();
  });

  it('getSnapshot returns null when no session', () => {
    const engine = new SessionEngine();
    expect(engine.getSnapshot()).toBeNull();
  });

  it('getSnapshot includes leaveTime when set', async () => {
    const engine = new SessionEngine();
    await engine.handle('Prep: report (leave at 10:30)', makeTime(T0));
    await engine.handle('Final pass.', makeTime(T0, 0.5));

    const snapshot = engine.getSnapshot(makeTime(T0, 1));
    expect(snapshot!.leaveTime).toBe('10:30');
  });

  it('getSnapshot reflects stack depth with stacked sessions', async () => {
    const engine = new SessionEngine();
    await engine.handle('Prep: report (60m)', makeTime(T0));
    await engine.handle('Final pass', makeTime(T0, 1));
    await engine.handle('pause', makeTime(T0, 5));

    expect(engine.getSnapshot(makeTime(T0, 6))!.stackDepth).toBe(1);

    await engine.handle('Pack: trip (20m)', makeTime(T0, 6));
    expect(engine.getSnapshot(makeTime(T0, 7))!.stackDepth).toBe(2);
    expect(engine.getSnapshot(makeTime(T0, 7))!.type).toBe('PACK');
  });

  it('branded headers appear in drift and time checks', async () => {
    const engine = new SessionEngine();
    await engine.handle('Prep: task (10m)', makeTime(T0));
    await engine.handle('Final pass', makeTime(T0, 0.5));

    // Drift check (6m after last interaction, past 5m threshold)
    const drift = engine.checkDrift(makeTime(T0, 6.5));
    expect(drift).toContain('Phasr');
    expect(drift).toContain('m left');

    // Time check (5m left)
    const time = engine.checkTime(makeTime(T0, 5));
    expect(time).toContain('Phasr');
    expect(time).toContain('5 minutes left');
  });

  it('session history records are saved via memory store', async () => {
    const memory = new InMemoryStore();
    const engine = new SessionEngine({ memory });

    await engine.handle('Prep: task (30m)', makeTime(T0));
    await engine.handle('Final pass', makeTime(T0, 0.5));
    await engine.handle('stop', makeTime(T0, 5));

    const records = await memory.getRecent(10);
    expect(records).toHaveLength(1);
    expect(records[0].type).toBe('PREP');
    expect(records[0].task).toBe('task');
    expect(records[0].outcome).toBe('stopped');
  });
});

