import { describe, expect, it } from 'vitest';
import { classifyTask, cleanTask, createPlan } from '../demo/planner.js';

describe('browser demo planner', () => {
  it('turns cutting the grass into a practical sequence', () => {
    const plan = createPlan('prep', 'cut the grass');

    expect(classifyTask('cut the grass')).toBe('lawn');
    expect(plan).toHaveLength(5);
    expect(plan.map((item) => item.text).join(' ')).toMatch(/dry enough/i);
    expect(plan.map((item) => item.text).join(' ')).toMatch(/mower/i);
    expect(plan.map((item) => item.text).join(' ')).toMatch(/narrow strip/i);
    expect(plan.every((item) => item.tiny.length > 10)).toBe(true);
  });

  it('recognises equivalent lawn tasks', () => {
    expect(classifyTask('mow lawn')).toBe('lawn');
    expect(classifyTask('trim the back lawn')).toBe('lawn');
    expect(classifyTask('grass needs mowing')).toBe('lawn');
  });

  it('gives emails a sendable sequence', () => {
    const plan = createPlan('prep', 'reply to the difficult email');
    const text = plan.map((item) => item.text).join(' ');

    expect(classifyTask('reply to the difficult email')).toBe('email');
    expect(text).toMatch(/outcome/i);
    expect(text).toMatch(/draft/i);
    expect(text).toMatch(/send/i);
  });

  it('uses a concrete fallback without pretending to understand the task', () => {
    const plan = createPlan('prep', 'calibrate the flux manifold');
    const text = plan.map((item) => item.text).join(' ');

    expect(classifyTask('calibrate the flux manifold')).toBe('general');
    expect(text).toMatch(/done enough/i);
    expect(text).toMatch(/first tool, document or material/i);
    expect(text).not.toMatch(/smallest visible part/i);
  });

  it('creates useful smaller alternatives for every mode', () => {
    for (const mode of ['prep', 'prioritise', 'plan']) {
      const plan = createPlan(mode, 'write report, call supplier');
      expect(plan.length).toBeGreaterThanOrEqual(4);
      expect(plan.every((item) => item.text && item.tiny)).toBe(true);
      expect(plan.every((item) => item.text !== item.tiny)).toBe(true);
    }
  });

  it('normalises trailing punctuation', () => {
    expect(cleanTask('  cut the grass... ')).toBe('cut the grass');
  });
});
