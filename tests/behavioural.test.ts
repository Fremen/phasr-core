import { describe, expect, it } from 'vitest';
import { SessionEngine } from '../src/session.js';
import { SessionState, SessionType } from '../src/types.js';

const at = (minute: number) => new Date(2026, 1, 15, 10, minute, 0);

describe('synthetic behavioural scenarios', () => {
  it('gives an overwhelmed person one action rather than the whole plan', async () => {
    const engine = new SessionEngine();
    await engine.handle('Prep: write a difficult project update (20m)', at(0));
    const reply = await engine.handle('I have a rough draft but cannot face it', at(1));

    expect(reply).toContain('Step 1');
    expect(reply).not.toContain('Step 2');
    expect(engine.getSnapshot(at(1))?.currentStep).toBeTruthy();
  });

  it('preserves the exact step across a pause and return', async () => {
    const engine = new SessionEngine();
    await engine.handle('Prep: sort the paperwork (20m)', at(0));
    await engine.handle('I need to review it', at(1));
    const before = engine.getSnapshot(at(1))?.currentStep;

    await engine.handle('pause', at(3));
    expect(engine.getSnapshot(at(3))?.state).toBe(SessionState.PAUSED);

    const reply = await engine.handle('resume', at(8));
    expect(reply).toContain(before);
    expect(engine.getSnapshot(at(8))?.currentStep).toBe(before);
  });

  it('keeps an interrupted session underneath a short urgent session', async () => {
    const engine = new SessionEngine();
    await engine.handle('Prep: finish the proposal (30m)', at(0));
    await engine.handle('Final pass', at(1));
    await engine.handle('pause', at(2));
    await engine.handle('Prep: send the access code (5m)', at(3));

    expect(engine.stackDepth).toBe(2);
    expect(engine.getSnapshot(at(3))?.task).toBe('send the access code');
  });

  it('respects a request for no nudges', async () => {
    const engine = new SessionEngine();
    await engine.handle('Prep: organise the desk (20m)', at(0));
    await engine.handle('Clear one corner', at(1));
    await engine.handle('no nudges', at(2));

    expect(engine.checkDrift(at(19))).toBeNull();
    expect(engine.getSnapshot(at(19))?.nudgeEnabled).toBe(false);
  });

  it('parses a local leave time into a visible timebox', async () => {
    const engine = new SessionEngine();
    const reply = await engine.handle('Plan: tomorrow (leave at 10:30)', at(0));

    expect(reply).toContain('30 minutes');
    expect(engine.getSnapshot(at(0))).toMatchObject({
      type: SessionType.PLAN,
      minutesLeft: 30,
      leaveTime: '10:30',
    });
  });
});
