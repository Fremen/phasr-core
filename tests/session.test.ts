import { describe, it, expect } from 'vitest';
import { SessionEngine } from '../src/session.js';
import { SessionType } from '../src/types.js';
import type { LLMClient } from '../src/llm.js';

function makeTime(base: string, addMinutes: number = 0): Date {
  const d = new Date(base);
  d.setMinutes(d.getMinutes() + addMinutes);
  return d;
}

// Leave-time inputs are local clock times, so use a local baseline. This keeps
// the behaviour deterministic in every CI timezone.
const T0 = '2026-02-15T10:00:00';

describe('SessionEngine', () => {
  describe('general', () => {
    it('shows help when no session is active', async () => {
      const engine = new SessionEngine();
      const result = await engine.handle('hello', makeTime(T0));
      expect(result).toContain('Start a session');
    });

    it('reports inactive when no session', () => {
      const engine = new SessionEngine();
      expect(engine.isActive).toBe(false);
    });
  });

  describe('PREP session', () => {
    it('runs the full spec transcript', async () => {
      const engine = new SessionEngine();

      // Start
      const r1 = await engine.handle('Prep: board memo (30m)', makeTime(T0));
      expect(r1).toContain('30 minutes');
      expect(r1).toContain("What's left");
      expect(engine.isActive).toBe(true);

      // Clarifying response
      const r2 = await engine.handle('Final pass.', makeTime(T0, 0.5));
      expect(r2).toContain('Phasr');
      expect(r2).toContain('m left');
      expect(r2).toContain('Step 1');
      expect(r2).toContain('read top-to-bottom');
      expect(r2).toContain("Say 'done'");

      // Advance step
      const r3 = await engine.handle('done', makeTime(T0, 5));
      expect(r3).toContain('Step 2');
      expect(r3).toContain('m left');
    });

    it('defaults to 25m timebox when not specified', async () => {
      const engine = new SessionEngine();
      const r = await engine.handle('Prep: something', makeTime(T0));
      expect(r).toContain('25 minutes');
    });

    it('handles draft prep steps', async () => {
      const engine = new SessionEngine();
      await engine.handle('Prep: report (20m)', makeTime(T0));
      const r = await engine.handle('Draft.', makeTime(T0, 0.5));
      expect(r).toContain('opening paragraph');
    });

    it('handles outline prep steps', async () => {
      const engine = new SessionEngine();
      await engine.handle('Prep: report (20m)', makeTime(T0));
      const r = await engine.handle('Outline.', makeTime(T0, 0.5));
      expect(r).toContain('main points');
    });

    it('ends session with stop command', async () => {
      const engine = new SessionEngine();
      await engine.handle('Prep: board memo (30m)', makeTime(T0));
      await engine.handle('Final pass.', makeTime(T0, 0.5));
      const r = await engine.handle('stop', makeTime(T0, 5));
      expect(r).toContain('Done:');
      expect(engine.isActive).toBe(false);
    });

    it('handles progress update (non-done message)', async () => {
      const engine = new SessionEngine();
      await engine.handle('Prep: board memo (30m)', makeTime(T0));
      await engine.handle('Final pass.', makeTime(T0, 0.5));
      const r = await engine.handle('halfway through', makeTime(T0, 5));
      expect(r).toContain('Got it');
      expect(r).toContain('step 1');
    });
  });

  describe('PACK session', () => {
    it('runs the full spec transcript', async () => {
      const engine = new SessionEngine();

      // Start
      const r1 = await engine.handle('Pack: Rome (25m)', makeTime(T0));
      expect(r1).toContain('25 minutes');
      expect(r1).toContain('laundry');

      // Clarifying response — yes to laundry
      const r2 = await engine.handle('Yes.', makeTime(T0, 0.5));
      expect(r2).toContain('m left');
      expect(r2).toContain('Step 1');
      expect(r2).toContain('3 tops and 2 bottoms');

      // Advance to next category (toiletries)
      const r3 = await engine.handle('done', makeTime(T0, 3));
      expect(r3).toContain('Step 2');
      expect(r3).toContain('toiletries');
    });

    it('uses extended categories when user says "full"', async () => {
      const engine = new SessionEngine();
      await engine.handle('Pack: trip (60m)', makeTime(T0));
      const r = await engine.handle('Yes, full', makeTime(T0, 1));
      expect(r).toContain('Step 1');

      // Step through all 4 base categories
      await engine.handle('done', makeTime(T0, 3));
      await engine.handle('done', makeTime(T0, 5));
      await engine.handle('done', makeTime(T0, 7));
      const r5 = await engine.handle('done', makeTime(T0, 9)); // medications
      expect(r5).toContain('medications');

      const r6 = await engine.handle('done', makeTime(T0, 11)); // snacks
      expect(r6).toContain('snack');

      const r7 = await engine.handle('done', makeTime(T0, 13)); // entertainment
      expect(r7).toContain('book/kindle');

      const r8 = await engine.handle('done', makeTime(T0, 15)); // end
      expect(r8).toContain('Done:');
      expect(engine.isActive).toBe(false);
    });

    it('uses extended categories when user says "everything"', async () => {
      const engine = new SessionEngine();
      await engine.handle('Pack: trip (60m)', makeTime(T0));
      await engine.handle('No, everything', makeTime(T0, 1));

      // Step through 4 base + should still have more
      await engine.handle('done', makeTime(T0, 3));
      await engine.handle('done', makeTime(T0, 5));
      await engine.handle('done', makeTime(T0, 7));
      const r5 = await engine.handle('done', makeTime(T0, 9));
      expect(r5).toContain('medications');
    });

    it('steps through one category per step', async () => {
      const engine = new SessionEngine();
      await engine.handle('Pack: trip (60m)', makeTime(T0));
      await engine.handle('Yes', makeTime(T0, 0.5));

      // Step 1 = clothes, Step 2 = toiletries, Step 3 = tech, Step 4 = documents → end
      const r2 = await engine.handle('done', makeTime(T0, 2)); // toiletries
      expect(r2).toContain('toiletries');

      const r3 = await engine.handle('done', makeTime(T0, 4)); // tech
      expect(r3).toContain('tech');

      const r4 = await engine.handle('done', makeTime(T0, 6)); // documents
      expect(r4).toContain('documents');

      const r5 = await engine.handle('done', makeTime(T0, 8)); // end
      expect(r5).toContain('Done:');
      expect(engine.isActive).toBe(false);
    });
  });

  describe('PRIORITISE session', () => {
    it('runs the full spec transcript', async () => {
      const engine = new SessionEngine();

      // Start
      const r1 = await engine.handle('Prioritise: 8 items (15m)', makeTime(T0));
      expect(r1).toContain('Paste');
      expect(r1).toContain('8 items');

      // Paste items
      const r2 = await engine.handle('A, B, C, D, E, F, G, H', makeTime(T0, 0.5));
      expect(r2).toContain('Top 3');
      expect(r2).toContain('Best next');
      expect(r2).toContain('Step 1');

      // Advance
      const r3 = await engine.handle('done', makeTime(T0, 5));
      expect(r3).toContain('Step 2');
    });
  });

  describe('PLAN session', () => {
    it('runs the full spec transcript', async () => {
      const engine = new SessionEngine();

      // Start
      const r1 = await engine.handle('Plan: Lisbon itinerary (60m)', makeTime(T0));
      expect(r1).toContain('60 minutes');
      expect(r1).toContain('Dates');
      expect(r1).toContain('must-dos');

      // Provide constraints
      const r2 = await engine.handle('3 days, just me, pasteis de nata', makeTime(T0, 1));
      expect(r2).toContain('Step 1');
      expect(r2).toContain('base area');
      expect(r2).toContain('pace');

      // Advance
      const r3 = await engine.handle('done', makeTime(T0, 5));
      expect(r3).toContain('Step 2');
    });
  });

  describe('drift detection', () => {
    it('returns null when within threshold', async () => {
      const engine = new SessionEngine();
      await engine.handle('Prep: task (30m)', makeTime(T0));
      await engine.handle('Final pass', makeTime(T0, 0.5));

      // 3 minutes later — within 5m threshold
      const drift = engine.checkDrift(makeTime(T0, 3.5));
      expect(drift).toBeNull();
    });

    it('returns nudge when past threshold', async () => {
      const engine = new SessionEngine();
      await engine.handle('Prep: task (30m)', makeTime(T0));
      await engine.handle('Final pass', makeTime(T0, 0.5));

      // 6 minutes later — past 5m threshold
      const drift = engine.checkDrift(makeTime(T0, 6.5));
      expect(drift).not.toBeNull();
      expect(typeof drift).toBe('string');
    });

    it('returns null when nudges disabled', async () => {
      const engine = new SessionEngine();
      await engine.handle('Prep: task (30m)', makeTime(T0));
      await engine.handle('Final pass', makeTime(T0, 0.5));
      await engine.handle('no nudges', makeTime(T0, 1));

      const drift = engine.checkDrift(makeTime(T0, 10));
      expect(drift).toBeNull();
    });

    it('returns null when no session active', () => {
      const engine = new SessionEngine();
      expect(engine.checkDrift(makeTime(T0))).toBeNull();
    });

    it('uses 3m threshold for PACK sessions', async () => {
      const engine = new SessionEngine();
      await engine.handle('Pack: trip (60m)', makeTime(T0));
      await engine.handle('Yes', makeTime(T0, 1));

      // 1m after last interaction — within PACK threshold (3m)
      expect(engine.checkDrift(makeTime(T0, 2))).toBeNull();
      // 4m after — past PACK threshold
      expect(engine.checkDrift(makeTime(T0, 5))).not.toBeNull();
    });

    it('uses 8m threshold for PLAN sessions', async () => {
      const engine = new SessionEngine();
      await engine.handle('Plan: trip (60m)', makeTime(T0));
      await engine.handle('3 days, me, food', makeTime(T0, 1));

      // 6m after last interaction — within PLAN threshold (8m)
      expect(engine.checkDrift(makeTime(T0, 7))).toBeNull();
      // 9m after — past PLAN threshold
      expect(engine.checkDrift(makeTime(T0, 10))).not.toBeNull();
    });

    it('uses 4m threshold for PRIORITISE sessions', async () => {
      const engine = new SessionEngine();
      await engine.handle('Prioritise: items (60m)', makeTime(T0));
      await engine.handle('A, B, C, D, E', makeTime(T0, 1));

      // 2m after last interaction — within PRIORITISE threshold (4m)
      expect(engine.checkDrift(makeTime(T0, 3))).toBeNull();
      // 5m after — past PRIORITISE threshold
      expect(engine.checkDrift(makeTime(T0, 6))).not.toBeNull();
    });
  });

  describe('time checking', () => {
    it('returns null when plenty of time left', async () => {
      const engine = new SessionEngine();
      await engine.handle('Prep: task (30m)', makeTime(T0));
      await engine.handle('Final pass', makeTime(T0, 0.5));

      const check = engine.checkTime(makeTime(T0, 5));
      expect(check).toBeNull();
    });

    it('returns push message when 5 minutes left', async () => {
      const engine = new SessionEngine();
      await engine.handle('Prep: task (30m)', makeTime(T0));
      await engine.handle('Final pass', makeTime(T0, 0.5));

      const check = engine.checkTime(makeTime(T0, 25));
      expect(check).not.toBeNull();
      expect(check).toContain('5 minutes left');
    });

    it('returns push message when 2 minutes left', async () => {
      const engine = new SessionEngine();
      await engine.handle('Prep: task (30m)', makeTime(T0));
      await engine.handle('Final pass', makeTime(T0, 0.5));

      const check = engine.checkTime(makeTime(T0, 28));
      expect(check).toContain('wrap');
    });

    it('ends session when time is up', async () => {
      const engine = new SessionEngine();
      await engine.handle('Prep: task (30m)', makeTime(T0));
      await engine.handle('Final pass', makeTime(T0, 0.5));

      const check = engine.checkTime(makeTime(T0, 31));
      expect(check).toContain('Done:');
      expect(engine.isActive).toBe(false);
    });

    it('returns null when no session active', () => {
      const engine = new SessionEngine();
      expect(engine.checkTime(makeTime(T0))).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('handles empty input', async () => {
      const engine = new SessionEngine();
      await engine.handle('Prep: task (30m)', makeTime(T0));
      await engine.handle('Final pass', makeTime(T0, 0.5));
      const r = await engine.handle('', makeTime(T0, 1));
      // Should treat as progress update since it's empty
      expect(r).toBeDefined();
    });

    it('can start a new session after ending one', async () => {
      const engine = new SessionEngine();
      await engine.handle('Prep: task (10m)', makeTime(T0));
      await engine.handle('Final pass', makeTime(T0, 0.5));
      await engine.handle('stop', makeTime(T0, 1));
      expect(engine.isActive).toBe(false);

      const r = await engine.handle('Pack: trip (20m)', makeTime(T0, 2));
      expect(r).toContain('20 minutes');
      expect(engine.isActive).toBe(true);
    });

    it('disabling nudges returns confirmation', async () => {
      const engine = new SessionEngine();
      await engine.handle('Prep: task (30m)', makeTime(T0));
      const r = await engine.handle('no nudges', makeTime(T0, 0.5));
      expect(r).toContain('Nudges disabled');
    });
  });

  describe('pause/resume', () => {
    it('pauses and resumes a session', async () => {
      const engine = new SessionEngine();
      await engine.handle('Prep: task (30m)', makeTime(T0));
      await engine.handle('Final pass', makeTime(T0, 1));
      expect(engine.isActive).toBe(true);

      const pauseR = await engine.handle('pause', makeTime(T0, 5));
      expect(pauseR).toContain('paused');
      expect(engine.isActive).toBe(true);

      const resumeR = await engine.handle('resume', makeTime(T0, 15));
      expect(resumeR).toContain('Resumed');
      expect(resumeR).toContain('Step 1');
    });

    it('extends endTime by pause duration', async () => {
      const engine = new SessionEngine();
      await engine.handle('Prep: task (30m)', makeTime(T0));
      await engine.handle('Final pass', makeTime(T0, 1));

      // Pause at T0+5, resume at T0+15 → 10m pause
      await engine.handle('pause', makeTime(T0, 5));
      await engine.handle('resume', makeTime(T0, 15));

      // Originally 30m from T0 → T0+30. After 10m pause → T0+40.
      // At T0+35, should still have time (5m left) instead of being past end
      const check = engine.checkTime(makeTime(T0, 35));
      expect(check).toContain('5 minutes left');
    });

    it('returns null for drift/time checks while paused', async () => {
      const engine = new SessionEngine();
      await engine.handle('Prep: task (30m)', makeTime(T0));
      await engine.handle('Final pass', makeTime(T0, 1));
      await engine.handle('pause', makeTime(T0, 5));

      expect(engine.checkDrift(makeTime(T0, 20))).toBeNull();
      expect(engine.checkTime(makeTime(T0, 35))).toBeNull();
    });

    it('allows "continue" as resume alias', async () => {
      const engine = new SessionEngine();
      await engine.handle('Prep: task (30m)', makeTime(T0));
      await engine.handle('Final pass', makeTime(T0, 1));
      await engine.handle('pause', makeTime(T0, 5));

      const r = await engine.handle('continue', makeTime(T0, 10));
      expect(r).toContain('Resumed');
    });

    it('shows hint for non-command messages while paused', async () => {
      const engine = new SessionEngine();
      await engine.handle('Prep: task (30m)', makeTime(T0));
      await engine.handle('Final pass', makeTime(T0, 1));
      await engine.handle('pause', makeTime(T0, 5));

      const r = await engine.handle('hello', makeTime(T0, 10));
      expect(r).toContain('Paused');
      expect(r).toContain('resume');
    });

    it('supports multiple pause/resume cycles', async () => {
      const engine = new SessionEngine();
      await engine.handle('Prep: task (30m)', makeTime(T0));
      await engine.handle('Final pass', makeTime(T0, 1));

      await engine.handle('pause', makeTime(T0, 5));
      await engine.handle('resume', makeTime(T0, 10)); // 5m pause
      await engine.handle('pause', makeTime(T0, 12));
      await engine.handle('resume', makeTime(T0, 17)); // 5m pause

      // Total 10m paused. At T0+35, should have 5m left
      const check = engine.checkTime(makeTime(T0, 35));
      expect(check).toContain('5 minutes left');
    });

    it('can stop while paused', async () => {
      const engine = new SessionEngine();
      await engine.handle('Prep: task (30m)', makeTime(T0));
      await engine.handle('Final pass', makeTime(T0, 1));
      await engine.handle('pause', makeTime(T0, 5));

      const r = await engine.handle('stop', makeTime(T0, 10));
      expect(r).toContain('Done:');
      expect(engine.isActive).toBe(false);
    });
  });

  describe('session stacking', () => {
    it('stacks a new session on top of a paused one', async () => {
      const engine = new SessionEngine();
      await engine.handle('Prep: report (30m)', makeTime(T0));
      await engine.handle('Final pass', makeTime(T0, 1));
      await engine.handle('pause', makeTime(T0, 5));
      expect(engine.stackDepth).toBe(1);

      // Start a new session while paused
      const r = await engine.handle('Pack: trip (20m)', makeTime(T0, 6));
      expect(r).toContain('20 minutes');
      expect(engine.stackDepth).toBe(2);
      expect(engine.isActive).toBe(true);
    });

    it('returns to paused session after completing stacked session', async () => {
      const engine = new SessionEngine();
      await engine.handle('Prep: report (30m)', makeTime(T0));
      await engine.handle('Final pass', makeTime(T0, 1));
      await engine.handle('pause', makeTime(T0, 5));

      // Start and complete a stacked pack session
      await engine.handle('Pack: trip (60m)', makeTime(T0, 6));
      await engine.handle('Yes', makeTime(T0, 7));
      await engine.handle('done', makeTime(T0, 9));
      await engine.handle('done', makeTime(T0, 11));
      await engine.handle('done', makeTime(T0, 13));
      const endR = await engine.handle('done', makeTime(T0, 15));
      expect(endR).toContain('Done:');
      expect(endR).toContain('report');
      expect(endR).toContain('resume');

      expect(engine.stackDepth).toBe(1);
      expect(engine.isActive).toBe(true);

      // Resume the underlying session
      const resumeR = await engine.handle('resume', makeTime(T0, 16));
      expect(resumeR).toContain('Resumed');
      expect(resumeR).toContain('Step 1');
    });

    it('supports three-deep stack', async () => {
      const engine = new SessionEngine();
      await engine.handle('Prep: report (60m)', makeTime(T0));
      await engine.handle('Final pass', makeTime(T0, 1));
      await engine.handle('pause', makeTime(T0, 5));
      expect(engine.stackDepth).toBe(1);

      await engine.handle('Pack: trip (60m)', makeTime(T0, 6));
      await engine.handle('Yes', makeTime(T0, 7));
      await engine.handle('pause', makeTime(T0, 9));
      expect(engine.stackDepth).toBe(2);

      await engine.handle('Plan: dinner (60m)', makeTime(T0, 10));
      expect(engine.stackDepth).toBe(3);
      await engine.handle('just me, casual', makeTime(T0, 11));

      // Stop the top session
      const r = await engine.handle('stop', makeTime(T0, 12));
      expect(r).toContain('Done:');
      expect(r).toContain('trip'); // hint about paused pack session
      expect(engine.stackDepth).toBe(2);
    });

    it('isActive reflects top session', async () => {
      const engine = new SessionEngine();
      await engine.handle('Prep: task (30m)', makeTime(T0));
      await engine.handle('Final pass', makeTime(T0, 1));
      await engine.handle('pause', makeTime(T0, 5));

      // Paused session is still active
      expect(engine.isActive).toBe(true);

      // Start stacked session
      await engine.handle('Pack: trip (20m)', makeTime(T0, 6));
      expect(engine.isActive).toBe(true);
    });
  });

  describe('leave-time', () => {
    it('uses leave-at format in step messages', async () => {
      const engine = new SessionEngine();
      // 10:00 UTC, leave at 10:30 UTC = 30m timebox
      const r1 = await engine.handle('Prep: report (leave at 10:30)', makeTime(T0));
      expect(r1).toContain('30 minutes');

      const r2 = await engine.handle('Final pass.', makeTime(T0, 0.5));
      expect(r2).toContain('Leave at 10:30');
      expect(r2).toContain('m left');
      expect(r2).toContain('Step 1');
    });

    it('shows leave-at format in progress updates', async () => {
      const engine = new SessionEngine();
      await engine.handle('Prep: report (leave at 10:30)', makeTime(T0));
      await engine.handle('Final pass.', makeTime(T0, 0.5));
      const r = await engine.handle('halfway through', makeTime(T0, 5));
      expect(r).toContain('Leave at 10:30');
    });
  });

  describe('LLM integration', () => {
    function mockLLM(overrides?: Partial<LLMClient>): LLMClient {
      return {
        compressStep: overrides?.compressStep ?? (async () => null),
        rankItems: overrides?.rankItems ?? (async () => null),
        detectIntent: overrides?.detectIntent ?? (async () => null),
        answerInContext: overrides?.answerInContext ?? (async () => null),
        chatReply: overrides?.chatReply ?? (async () => null),
      };
    }

    it('uses LLM-generated step for PREP when available', async () => {
      const llm = mockLLM({
        compressStep: async () => 'review the executive summary paragraph',
      });
      const engine = new SessionEngine({ llm });

      await engine.handle('Prep: board memo (30m)', makeTime(T0));
      const r = await engine.handle('Final pass.', makeTime(T0, 0.5));
      expect(r).toContain('review the executive summary paragraph');
      expect(r).toContain('Step 1');
    });

    it('uses LLM-generated step when advancing PREP', async () => {
      let callCount = 0;
      const llm = mockLLM({
        compressStep: async () => {
          callCount++;
          return callCount === 1
            ? 'check the introduction'
            : 'verify all citations';
        },
      });
      const engine = new SessionEngine({ llm });

      await engine.handle('Prep: report (30m)', makeTime(T0));
      await engine.handle('Final pass.', makeTime(T0, 0.5));
      const r = await engine.handle('done', makeTime(T0, 5));
      expect(r).toContain('verify all citations');
      expect(r).toContain('Step 2');
    });

    it('falls back to template when LLM returns null for PREP', async () => {
      const llm = mockLLM({
        compressStep: async () => null,
      });
      const engine = new SessionEngine({ llm });

      await engine.handle('Prep: report (30m)', makeTime(T0));
      const r = await engine.handle('Final pass.', makeTime(T0, 0.5));
      // Should fall back to template step
      expect(r).toContain('read top-to-bottom');
    });

    it('uses LLM ranking for PRIORITISE when available', async () => {
      const llm = mockLLM({
        rankItems: async () => ({
          top3: ['C', 'A', 'F'],
          bestNext: 'C',
        }),
      });
      const engine = new SessionEngine({ llm });

      await engine.handle('Prioritise: items (15m)', makeTime(T0));
      const r = await engine.handle('A, B, C, D, E, F', makeTime(T0, 0.5));
      expect(r).toContain('Top 3: C, A, F');
      expect(r).toContain('Best next: C');
      expect(r).toContain('open C and start working on it');
    });

    it('falls back to naive slice when LLM returns null for PRIORITISE', async () => {
      const llm = mockLLM({
        rankItems: async () => null,
      });
      const engine = new SessionEngine({ llm });

      await engine.handle('Prioritise: items (15m)', makeTime(T0));
      const r = await engine.handle('A, B, C, D, E, F', makeTime(T0, 0.5));
      expect(r).toContain('Top 3: A, B, C');
      expect(r).toContain('Best next: A');
    });

    it('works without LLM (null constructor arg)', async () => {
      const engine = new SessionEngine({ llm: null });

      await engine.handle('Prep: task (30m)', makeTime(T0));
      const r = await engine.handle('Final pass.', makeTime(T0, 0.5));
      expect(r).toContain('read top-to-bottom');
    });

    it('falls back to LLM intent detection when regex fails', async () => {
      const llm = mockLLM({
        detectIntent: async () => ({
          type: SessionType.PRIORITISE,
          task: 'tasks',
          timeboxMinutes: 15,
        }),
      });
      const engine = new SessionEngine({ llm });

      const r = await engine.handle("I've got too many things on my plate", makeTime(T0));
      expect(r).toContain('Paste');
      expect(engine.isActive).toBe(true);
    });

    it('detects PREP from natural language', async () => {
      const llm = mockLLM({
        detectIntent: async () => ({
          type: SessionType.PREP,
          task: 'board memo',
          timeboxMinutes: 30,
        }),
      });
      const engine = new SessionEngine({ llm });

      const r = await engine.handle('I need to finish that board memo', makeTime(T0));
      expect(r).toContain('30 minutes');
      expect(r).toContain("What's left");
      expect(engine.isActive).toBe(true);
    });

    it('detects PACK from natural language', async () => {
      const llm = mockLLM({
        detectIntent: async () => ({
          type: SessionType.PACK,
          task: 'Rome trip',
          timeboxMinutes: 25,
        }),
      });
      const engine = new SessionEngine({ llm });

      const r = await engine.handle('I need to pack for Rome', makeTime(T0));
      expect(r).toContain('25 minutes');
      expect(r).toContain('laundry');
    });

    it('detects PLAN from natural language', async () => {
      const llm = mockLLM({
        detectIntent: async () => ({
          type: SessionType.PLAN,
          task: 'weekend trip',
          timeboxMinutes: 60,
        }),
      });
      const engine = new SessionEngine({ llm });

      const r = await engine.handle('help me plan a weekend trip', makeTime(T0));
      expect(r).toContain('60 minutes');
    });

    it('shows help when LLM also returns null', async () => {
      const llm = mockLLM({
        detectIntent: async () => null,
      });
      const engine = new SessionEngine({ llm });

      const r = await engine.handle('hello there', makeTime(T0));
      expect(r).toContain('Start a session');
    });

    it('does NOT call LLM when regex succeeds (fast path)', async () => {
      let detectCalled = false;
      const llm = mockLLM({
        detectIntent: async () => {
          detectCalled = true;
          return null;
        },
      });
      const engine = new SessionEngine({ llm });

      await engine.handle('Prep: task (30m)', makeTime(T0));
      expect(detectCalled).toBe(false);
      expect(engine.isActive).toBe(true);
    });

    it('works without LLM client for intent detection', async () => {
      const engine = new SessionEngine();

      const r = await engine.handle('I need to finish something', makeTime(T0));
      expect(r).toContain('Start a session');
    });

    it('uses LLM intent detection for stacked session from paused state', async () => {
      const llm = mockLLM({
        detectIntent: async () => ({
          type: SessionType.PACK,
          task: 'trip',
          timeboxMinutes: 20,
        }),
      });
      const engine = new SessionEngine({ llm });

      // Start and pause a session using regex trigger
      await engine.handle('Prep: report (30m)', makeTime(T0));
      await engine.handle('Final pass', makeTime(T0, 1));
      await engine.handle('pause', makeTime(T0, 5));
      expect(engine.stackDepth).toBe(1);

      // Natural language should start a stacked session
      const r = await engine.handle('I need to pack for my trip', makeTime(T0, 6));
      expect(r).toContain('20 minutes');
      expect(engine.stackDepth).toBe(2);
    });

    it('uses LLM answer in progress update when available', async () => {
      const llm = mockLLM({
        answerInContext: async () => 'Pack 3 tops and 2 bottoms for a 5-day trip.',
      });
      const engine = new SessionEngine({ llm });

      await engine.handle('Pack: Rome (25m)', makeTime(T0));
      await engine.handle('Yes', makeTime(T0, 0.5));
      const r = await engine.handle('how many tops?', makeTime(T0, 3));
      expect(r).toContain('Pack 3 tops and 2 bottoms for a 5-day trip.');
      expect(r).toContain('Phasr');
      expect(r).toContain('m left');
      expect(r).toContain('Still on step 1');
      expect(r).toContain("Say 'done'");
    });

    it('falls back to template when LLM answerInContext returns null', async () => {
      const llm = mockLLM({
        answerInContext: async () => null,
      });
      const engine = new SessionEngine({ llm });

      await engine.handle('Pack: Rome (25m)', makeTime(T0));
      await engine.handle('Yes', makeTime(T0, 0.5));
      const r = await engine.handle('how many tops?', makeTime(T0, 3));
      expect(r).toContain('Got it');
      expect(r).toContain('step 1');
    });

    it('falls back to template when LLM answerInContext throws', async () => {
      const llm = mockLLM({
        answerInContext: async () => { throw new Error('API down'); },
      });
      const engine = new SessionEngine({ llm });

      await engine.handle('Pack: Rome (25m)', makeTime(T0));
      await engine.handle('Yes', makeTime(T0, 0.5));
      const r = await engine.handle('how many tops?', makeTime(T0, 3));
      expect(r).toContain('Got it');
      expect(r).toContain('step 1');
    });

    it('passes conversation history to answerInContext on follow-up messages', async () => {
      let capturedParams: any = null;
      let callCount = 0;
      const llm = mockLLM({
        answerInContext: async (params) => {
          callCount++;
          capturedParams = params;
          return callCount === 1
            ? 'How many days is your trip?'
            : 'Pack 3 tops for a 3-day trip.';
        },
      });
      const engine = new SessionEngine({ llm });

      await engine.handle('Pack: Rome (25m)', makeTime(T0));
      await engine.handle('Yes', makeTime(T0, 0.5));

      // First question — no history yet
      await engine.handle('how many tops?', makeTime(T0, 2));
      expect(capturedParams.recentExchanges).toHaveLength(0);

      // Follow-up — should include the previous exchange
      await engine.handle('3', makeTime(T0, 3));
      expect(capturedParams.recentExchanges).toHaveLength(1);
      expect(capturedParams.recentExchanges[0].user).toBe('how many tops?');
      expect(capturedParams.recentExchanges[0].bot).toContain('How many days');
    });

    it('caps conversation history at 5 exchanges', async () => {
      let capturedParams: any = null;
      const llm = mockLLM({
        answerInContext: async (params) => {
          capturedParams = params;
          return 'Noted.';
        },
      });
      const engine = new SessionEngine({ llm });

      await engine.handle('Pack: Rome (60m)', makeTime(T0));
      await engine.handle('Yes', makeTime(T0, 0.5));

      // Send 7 messages to exceed the cap
      for (let i = 0; i < 7; i++) {
        await engine.handle(`msg ${i}`, makeTime(T0, 2 + i));
      }

      expect(capturedParams.recentExchanges).toHaveLength(5);
      // History is read before push, so after 7 messages the oldest is msg 1
      expect(capturedParams.recentExchanges[0].user).toBe('msg 1');
    });

    it('stores fallback response in history when LLM returns null', async () => {
      let capturedParams: any = null;
      let callCount = 0;
      const llm = mockLLM({
        answerInContext: async (params) => {
          callCount++;
          capturedParams = params;
          if (callCount === 1) return null; // First call returns null → fallback
          return 'Context-aware reply.';
        },
      });
      const engine = new SessionEngine({ llm });

      await engine.handle('Pack: Rome (25m)', makeTime(T0));
      await engine.handle('Yes', makeTime(T0, 0.5));

      // First message — LLM returns null, fallback is stored
      await engine.handle('hello', makeTime(T0, 2));

      // Second message — should have the fallback in history
      await engine.handle('how many tops?', makeTime(T0, 3));
      expect(capturedParams.recentExchanges).toHaveLength(1);
      expect(capturedParams.recentExchanges[0].user).toBe('hello');
      expect(capturedParams.recentExchanges[0].bot).toContain('Got it');
    });

    it('uses LLM chatReply for idle messages when available', async () => {
      const llm = mockLLM({
        detectIntent: async () => null,
        chatReply: async () => 'I help you get things done. Try "Prep: task (30m)" to start.',
      });
      const engine = new SessionEngine({ llm });

      const r = await engine.handle('What can you do?', makeTime(T0));
      expect(r).toContain('I help you get things done');
      expect(r).not.toContain('Start a session');
    });

    it('falls back to static help when chatReply returns null', async () => {
      const llm = mockLLM({
        detectIntent: async () => null,
        chatReply: async () => null,
      });
      const engine = new SessionEngine({ llm });

      const r = await engine.handle('hello', makeTime(T0));
      expect(r).toContain('Start a session');
    });

    it('handles LLM-detected leave time', async () => {
      const llm = mockLLM({
        detectIntent: async () => ({
          type: SessionType.PREP,
          task: 'memo',
          timeboxMinutes: null,
          leaveAt: '14:30',
        }),
      });
      const engine = new SessionEngine({ llm });

      // T0 is 10:00 UTC, leave at 14:30 = 270m timebox
      const r = await engine.handle('I need to work on that memo before I leave at 2:30', makeTime(T0));
      expect(r).toContain('270 minutes');
      expect(engine.isActive).toBe(true);
    });
  });

  describe('version command', () => {
    it('responds with version when asked "version"', async () => {
      const engine = new SessionEngine();
      const r = await engine.handle('version', makeTime(T0));
      expect(r).toContain('Phasr v0.2');
    });

    it('responds to --version flag', async () => {
      const engine = new SessionEngine();
      const r = await engine.handle('--version', makeTime(T0));
      expect(r).toContain('Phasr v');
    });

    it('responds to "what version" query', async () => {
      const engine = new SessionEngine();
      const r = await engine.handle('what version', makeTime(T0));
      expect(r).toContain('Phasr v');
    });

    it('responds to "what\'s your version" query', async () => {
      const engine = new SessionEngine();
      const r = await engine.handle("what's your version", makeTime(T0));
      expect(r).toContain('Phasr v');
    });

    it('responds to "what is your version?" query', async () => {
      const engine = new SessionEngine();
      const r = await engine.handle('what is your version?', makeTime(T0));
      expect(r).toContain('Phasr v');
    });
  });

  describe('COOK session', () => {
    it('starts a cook session with trigger', async () => {
      const engine = new SessionEngine();
      const r1 = await engine.handle('Cook: pasta bolognese (45m)', makeTime(T0));
      expect(r1).toContain('45 minutes');
      expect(r1).toContain('component');
      expect(engine.isActive).toBe(true);
    });

    it('parses components and walks through steps', async () => {
      const engine = new SessionEngine();
      await engine.handle('Cook: dinner (45m)', makeTime(T0));

      const r2 = await engine.handle('pasta, sauce, salad', makeTime(T0, 0.5));
      expect(r2).toContain('Step 1');
      expect(r2).toContain('clear the worktop');

      const r3 = await engine.handle('done', makeTime(T0, 2));
      expect(r3).toContain('Step 2');
      expect(r3).toContain('recipe');

      const r4 = await engine.handle('done', makeTime(T0, 4));
      expect(r4).toContain('Step 3');
      expect(r4).toContain('ingredients');
    });

    it('handles single component', async () => {
      const engine = new SessionEngine();
      await engine.handle('Cook: omelette (15m)', makeTime(T0));

      const r = await engine.handle('omelette', makeTime(T0, 0.5));
      expect(r).toContain('Step 1');
      expect(r).toContain('clear');
    });

    it('completes the session after all steps', async () => {
      const engine = new SessionEngine();
      await engine.handle('Cook: soup (10m)', makeTime(T0));
      await engine.handle('soup', makeTime(T0, 0.5));

      // Walk through all steps until session ends
      let result = '';
      for (let i = 0; i < 20; i++) {
        result = await engine.handle('done', makeTime(T0, 1 + i));
        if (!engine.isActive) break;
      }
      expect(result).toContain('complete');
    });

    it('matches "cooking" trigger pattern', async () => {
      const engine = new SessionEngine();
      const r = await engine.handle('Cooking stir fry (30m)', makeTime(T0));
      expect(r).toContain('30 minutes');
      expect(r).toContain('component');
      expect(engine.isActive).toBe(true);
    });
  });
});
