import { describe, expect, it } from 'vitest';
import { buildPlanningPrompt, createAIPlan, parseAIPlan } from '../demo/ai-planner.js';

const validPlan = {
  steps: [
    { text: 'Check the weather.', tiny: 'Look outside.' },
    { text: 'Take out the mower.', tiny: 'Put on outdoor shoes.' },
    { text: 'Cut one strip.', tiny: 'Move the mower to the lawn.' },
  ],
};

describe('free AI planner', () => {
  it('parses a plain JSON response', () => {
    expect(parseAIPlan(JSON.stringify(validPlan))).toEqual(validPlan.steps);
  });

  it('parses Puter-style message content and fenced JSON', () => {
    const response = {
      message: { content: '```json\n' + JSON.stringify(validPlan) + '\n```' },
    };
    expect(parseAIPlan(response)).toEqual(validPlan.steps);
  });

  it('rejects incomplete and overlong plans', () => {
    expect(() => parseAIPlan('{"steps":[{"text":"One","tiny":"Tiny"}]}')).toThrow();
    const overlong = structuredClone(validPlan);
    overlong.steps[0].text = 'x'.repeat(221);
    expect(() => parseAIPlan(JSON.stringify(overlong))).toThrow(/overlong/);
  });

  it('asks for concrete, small and safety-aware output', () => {
    const prompt = buildPlanningPrompt('cut the grass', 'prep', 20);
    expect(prompt).toContain('concrete');
    expect(prompt).toContain('safety');
    expect(prompt).toContain('two minutes');
    expect(prompt).toContain('cut the grass');
  });

  it('calls the injected free chat service and validates its response', async () => {
    const calls = [];
    const chat = async (prompt) => {
      calls.push(prompt);
      return { message: { content: JSON.stringify(validPlan) } };
    };

    const result = await createAIPlan('cut the grass', 'prep', 20, chat);
    expect(result).toEqual(validPlan.steps);
    expect(calls).toHaveLength(1);
  });
});
