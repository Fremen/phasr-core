import { describe, it, expect, afterEach } from 'vitest';
import {
  buildCompressStepPrompt,
  buildRankItemsPrompt,
  buildDetectIntentPrompt,
  buildAnswerInContextPrompt,
  buildChatReplyPrompt,
  parseCompressStepResponse,
  parseRankItemsResponse,
  parseDetectIntentResponse,
  parseAnswerInContextResponse,
  parseChatReplyResponse,
  createLLMClient,
} from '../src/llm.js';
import { SessionType } from '../src/types.js';

describe('LLM prompt construction', () => {
  describe('buildCompressStepPrompt', () => {
    it('includes task and what is left', () => {
      const { system, user } = buildCompressStepPrompt({
        task: 'board memo',
        whatIsLeft: 'final pass',
        stepsCompleted: [],
        stepNumber: 1,
        minutesLeft: 25,
      });

      expect(system).toContain('calm, focused task coach');
      expect(system).toContain('atomic action');
      expect(system).toContain('DONE');
      expect(user).toContain('board memo');
      expect(user).toContain('final pass');
      expect(user).toContain('Step 1');
      expect(user).toContain('25m remaining');
    });

    it('includes completed steps', () => {
      const { user } = buildCompressStepPrompt({
        task: 'report',
        whatIsLeft: 'draft',
        stepsCompleted: ['write intro', 'add data tables'],
        stepNumber: 3,
        minutesLeft: 15,
      });

      expect(user).toContain('write intro; add data tables');
      expect(user).toContain('Step 3');
    });

    it('shows "none" when no steps completed', () => {
      const { user } = buildCompressStepPrompt({
        task: 'task',
        whatIsLeft: 'everything',
        stepsCompleted: [],
        stepNumber: 1,
        minutesLeft: 30,
      });

      expect(user).toContain('Steps done: none');
    });
  });

  describe('buildRankItemsPrompt', () => {
    it('includes numbered items and time', () => {
      const { system, user } = buildRankItemsPrompt({
        items: ['Email boss', 'Fix bug', 'Write tests'],
        minutesLeft: 15,
      });

      expect(system).toContain('prioritisation coach');
      expect(user).toContain('1. Email boss');
      expect(user).toContain('2. Fix bug');
      expect(user).toContain('3. Write tests');
      expect(user).toContain('15m');
      expect(user).toContain('TOP3:');
      expect(user).toContain('BEST:');
    });
  });
});

describe('LLM response parsing', () => {
  describe('parseCompressStepResponse', () => {
    it('returns trimmed step text', () => {
      expect(parseCompressStepResponse('  review the first paragraph  ')).toBe(
        'review the first paragraph',
      );
    });

    it('returns null for DONE', () => {
      expect(parseCompressStepResponse('DONE')).toBeNull();
      expect(parseCompressStepResponse('  done  ')).toBeNull();
      expect(parseCompressStepResponse('Done')).toBeNull();
    });

    it('returns null for empty response', () => {
      expect(parseCompressStepResponse('')).toBeNull();
      expect(parseCompressStepResponse('   ')).toBeNull();
    });

    it('strips leading bullet/number formatting', () => {
      expect(parseCompressStepResponse('1. review the draft')).toBe('review the draft');
      expect(parseCompressStepResponse('- check formatting')).toBe('check formatting');
      expect(parseCompressStepResponse('* verify numbers')).toBe('verify numbers');
    });

    it('strips surrounding quotes', () => {
      expect(parseCompressStepResponse('"review the draft"')).toBe('review the draft');
      expect(parseCompressStepResponse("'check formatting'")).toBe('check formatting');
    });
  });

  describe('parseRankItemsResponse', () => {
    it('parses standard format', () => {
      const result = parseRankItemsResponse(
        'TOP3: Fix bug, Email boss, Write tests\nBEST: Fix bug',
        ['Email boss', 'Fix bug', 'Write tests', 'Update docs'],
      );

      expect(result).toEqual({
        top3: ['Fix bug', 'Email boss', 'Write tests'],
        bestNext: 'Fix bug',
      });
    });

    it('handles extra whitespace', () => {
      const result = parseRankItemsResponse(
        '  TOP3:  A ,  B , C  \n  BEST:  A  ',
        ['A', 'B', 'C'],
      );

      expect(result).toEqual({
        top3: ['A', 'B', 'C'],
        bestNext: 'A',
      });
    });

    it('returns null when TOP3 is missing', () => {
      const result = parseRankItemsResponse('BEST: A', ['A', 'B']);
      expect(result).toBeNull();
    });

    it('returns null when BEST is missing', () => {
      const result = parseRankItemsResponse('TOP3: A, B, C', ['A', 'B', 'C']);
      expect(result).toBeNull();
    });

    it('returns null for empty response', () => {
      expect(parseRankItemsResponse('', ['A'])).toBeNull();
    });

    it('limits top3 to 3 items', () => {
      const result = parseRankItemsResponse(
        'TOP3: A, B, C, D\nBEST: A',
        ['A', 'B', 'C', 'D'],
      );

      expect(result!.top3).toHaveLength(3);
      expect(result!.top3).toEqual(['A', 'B', 'C']);
    });
  });
});

describe('buildDetectIntentPrompt', () => {
  it('includes the user message as-is', () => {
    const { system, user } = buildDetectIntentPrompt({
      message: "I've got too many things on my plate",
    });

    expect(system).toContain('PREP');
    expect(system).toContain('PACK');
    expect(system).toContain('PRIORITISE');
    expect(system).toContain('PLAN');
    expect(system).toContain('NONE');
    expect(system).toContain('TYPE:');
    expect(user).toBe("I've got too many things on my plate");
  });

  it('includes classification guidance', () => {
    const { system } = buildDetectIntentPrompt({ message: 'test' });
    expect(system).toContain('Only classify if the user clearly wants to START');
  });
});

describe('parseDetectIntentResponse', () => {
  it('parses PREP type', () => {
    const result = parseDetectIntentResponse(
      'TYPE: PREP\nTASK: board memo\nMINUTES: 30\nLEAVE: null',
    );
    expect(result).toEqual({
      type: SessionType.PREP,
      task: 'board memo',
      timeboxMinutes: 30,
    });
  });

  it('parses PACK type', () => {
    const result = parseDetectIntentResponse(
      'TYPE: PACK\nTASK: Rome trip\nMINUTES: 25\nLEAVE: null',
    );
    expect(result).toEqual({
      type: SessionType.PACK,
      task: 'Rome trip',
      timeboxMinutes: 25,
    });
  });

  it('parses PRIORITISE type', () => {
    const result = parseDetectIntentResponse(
      'TYPE: PRIORITISE\nTASK: tasks\nMINUTES: null\nLEAVE: null',
    );
    expect(result).toEqual({
      type: SessionType.PRIORITISE,
      task: 'tasks',
      timeboxMinutes: null,
    });
  });

  it('parses PLAN type', () => {
    const result = parseDetectIntentResponse(
      'TYPE: PLAN\nTASK: weekend trip\nMINUTES: 60\nLEAVE: null',
    );
    expect(result).toEqual({
      type: SessionType.PLAN,
      task: 'weekend trip',
      timeboxMinutes: 60,
    });
  });

  it('returns null for NONE', () => {
    const result = parseDetectIntentResponse(
      'TYPE: NONE\nTASK: null\nMINUTES: null\nLEAVE: null',
    );
    expect(result).toBeNull();
  });

  it('returns null for empty input', () => {
    expect(parseDetectIntentResponse('')).toBeNull();
    expect(parseDetectIntentResponse('   ')).toBeNull();
  });

  it('returns null for malformed input (no TYPE line)', () => {
    expect(parseDetectIntentResponse('TASK: something\nMINUTES: 30')).toBeNull();
  });

  it('returns null for unrecognised type', () => {
    expect(parseDetectIntentResponse('TYPE: FOCUS\nTASK: something')).toBeNull();
  });

  it('handles PRIORITIZE spelling', () => {
    const result = parseDetectIntentResponse(
      'TYPE: PRIORITIZE\nTASK: my todos\nMINUTES: null\nLEAVE: null',
    );
    expect(result).not.toBeNull();
    expect(result!.type).toBe(SessionType.PRIORITISE);
    expect(result!.task).toBe('my todos');
  });

  it('defaults missing task to type name', () => {
    const result = parseDetectIntentResponse('TYPE: PREP\nMINUTES: null\nLEAVE: null');
    expect(result).not.toBeNull();
    expect(result!.task).toBe('prep');
  });

  it('defaults null task to type name', () => {
    const result = parseDetectIntentResponse('TYPE: PACK\nTASK: null\nMINUTES: null\nLEAVE: null');
    expect(result).not.toBeNull();
    expect(result!.task).toBe('pack');
  });

  it('extracts leave-time', () => {
    const result = parseDetectIntentResponse(
      'TYPE: PREP\nTASK: memo\nMINUTES: null\nLEAVE: 14:30',
    );
    expect(result).not.toBeNull();
    expect(result!.leaveAt).toBe('14:30');
  });

  it('ignores invalid leave-time format', () => {
    const result = parseDetectIntentResponse(
      'TYPE: PREP\nTASK: memo\nMINUTES: null\nLEAVE: afternoon',
    );
    expect(result).not.toBeNull();
    expect(result!.leaveAt).toBeUndefined();
  });
});

describe('buildAnswerInContextPrompt', () => {
  const baseParams = {
    message: 'how many tops?',
    sessionType: SessionType.PACK,
    task: 'Rome trip',
    currentStep: 'grab suitcase + lay out 3 tops and 2 bottoms',
    stepIndex: 1,
    stepsCompleted: [],
    minutesLeft: 22,
    context: { hasLaundry: true, categories: ['clothes', 'toiletries', 'tech', 'documents'] },
  };

  it('includes session type, task, current step, and minutes left in system prompt', () => {
    const { system } = buildAnswerInContextPrompt(baseParams);
    expect(system).toContain('PACK');
    expect(system).toContain('Rome trip');
    expect(system).toContain('step 1');
    expect(system).toContain('grab suitcase');
    expect(system).toContain('22m left');
  });

  it('includes user message in user prompt', () => {
    const { user } = buildAnswerInContextPrompt(baseParams);
    expect(user).toContain('how many tops?');
  });

  it('includes PACK-specific context (laundry, categories)', () => {
    const { user } = buildAnswerInContextPrompt(baseParams);
    expect(user).toContain('Laundry available: yes');
    expect(user).toContain('clothes, toiletries, tech, documents');
  });

  it('includes PREP-specific context (whatIsLeft)', () => {
    const { user } = buildAnswerInContextPrompt({
      ...baseParams,
      sessionType: SessionType.PREP,
      context: { whatIsLeft: 'final pass on the intro' },
    });
    expect(user).toContain("What's left: final pass on the intro");
  });

  it('includes PLAN-specific context (constraints)', () => {
    const { user } = buildAnswerInContextPrompt({
      ...baseParams,
      sessionType: SessionType.PLAN,
      context: { constraints: '3 days, just me' },
    });
    expect(user).toContain('Constraints: 3 days, just me');
  });

  it('includes PRIORITISE-specific context (ranked items)', () => {
    const { user } = buildAnswerInContextPrompt({
      ...baseParams,
      sessionType: SessionType.PRIORITISE,
      context: { ranked: ['Fix bug', 'Email boss', 'Write tests'] },
    });
    expect(user).toContain('Top items: Fix bug, Email boss, Write tests');
  });

  it('includes completed steps when present', () => {
    const { user } = buildAnswerInContextPrompt({
      ...baseParams,
      stepsCompleted: ['grabbed suitcase', 'packed toiletries'],
    });
    expect(user).toContain('Steps completed: grabbed suitcase; packed toiletries');
  });

  it('includes recent conversation history in user prompt', () => {
    const { user } = buildAnswerInContextPrompt({
      ...baseParams,
      recentExchanges: [
        { user: 'how many days?', bot: 'The step says 5 days.' },
        { user: 'ok thanks', bot: 'Got it.' },
      ],
    });
    expect(user).toContain('Recent conversation:');
    expect(user).toContain('User: how many days?');
    expect(user).toContain('Assistant: The step says 5 days.');
    expect(user).toContain('User: ok thanks');
    expect(user).toContain('Assistant: Got it.');
    // History should appear before the current question
    const historyIdx = user.indexOf('Recent conversation:');
    const questionIdx = user.indexOf('User asks:');
    expect(historyIdx).toBeLessThan(questionIdx);
  });

  it('omits history block when recentExchanges is empty', () => {
    const { user } = buildAnswerInContextPrompt({
      ...baseParams,
      recentExchanges: [],
    });
    expect(user).not.toContain('Recent conversation:');
  });

  it('omits history block when recentExchanges is undefined', () => {
    const { user } = buildAnswerInContextPrompt(baseParams);
    expect(user).not.toContain('Recent conversation:');
  });
});

describe('parseAnswerInContextResponse', () => {
  it('returns trimmed text', () => {
    expect(parseAnswerInContextResponse('  Pack 3 tops.  ')).toBe('Pack 3 tops.');
  });

  it('returns null for empty input', () => {
    expect(parseAnswerInContextResponse('')).toBeNull();
    expect(parseAnswerInContextResponse('   ')).toBeNull();
  });

  it('caps response at 3 sentences', () => {
    const input = 'First sentence. Second sentence. Third sentence. Fourth sentence.';
    const result = parseAnswerInContextResponse(input);
    expect(result).toBe('First sentence. Second sentence. Third sentence.');
  });

  it('preserves responses with 3 or fewer sentences', () => {
    const input = 'One sentence. Two sentences.';
    expect(parseAnswerInContextResponse(input)).toBe('One sentence. Two sentences.');
  });

  it('handles sentences ending with ! or ?', () => {
    const input = 'Great question! Pack 3 tops. You have enough room? Extra detail here.';
    const result = parseAnswerInContextResponse(input);
    expect(result).toBe('Great question! Pack 3 tops. You have enough room?');
  });
});

describe('buildChatReplyPrompt', () => {
  it('includes session types in system prompt', () => {
    const { system } = buildChatReplyPrompt({ message: 'hello' });
    expect(system).toContain('Prep');
    expect(system).toContain('Pack');
    expect(system).toContain('Prioritise');
    expect(system).toContain('Plan');
  });

  it('includes user message as user prompt', () => {
    const { user } = buildChatReplyPrompt({ message: 'What can you do?' });
    expect(user).toBe('What can you do?');
  });

  it('describes Phasr identity in system prompt', () => {
    const { system } = buildChatReplyPrompt({ message: 'hi' });
    expect(system).toContain('Phasr');
    expect(system).toContain('executive function');
  });
});

describe('parseChatReplyResponse', () => {
  it('reuses parseAnswerInContextResponse', () => {
    expect(parseChatReplyResponse).toBe(parseAnswerInContextResponse);
  });
});

describe('createLLMClient', () => {
  const savedApiKey = process.env.ANTHROPIC_API_KEY;
  const savedAuthToken = process.env.ANTHROPIC_AUTH_TOKEN;

  afterEach(() => {
    // Restore env vars
    if (savedApiKey) process.env.ANTHROPIC_API_KEY = savedApiKey;
    else delete process.env.ANTHROPIC_API_KEY;
    if (savedAuthToken) process.env.ANTHROPIC_AUTH_TOKEN = savedAuthToken;
    else delete process.env.ANTHROPIC_AUTH_TOKEN;
  });

  it('returns null when no credentials are provided', () => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_AUTH_TOKEN;

    const client = createLLMClient();
    expect(client).toBeNull();
  });

  it('returns null when explicit empty key is passed', () => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_AUTH_TOKEN;

    const client = createLLMClient({ apiKey: '' });
    expect(client).toBeNull();
  });

  it('returns client when API key is provided', () => {
    const client = createLLMClient({ apiKey: 'test-key-123' });
    expect(client).not.toBeNull();
    expect(client!.compressStep).toBeTypeOf('function');
    expect(client!.rankItems).toBeTypeOf('function');
    expect(client!.detectIntent).toBeTypeOf('function');
  });

  it('returns client when authToken is provided', () => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_AUTH_TOKEN;

    const client = createLLMClient({ authToken: 'oauth-token-abc' });
    expect(client).not.toBeNull();
    expect(client!.compressStep).toBeTypeOf('function');
    expect(client!.rankItems).toBeTypeOf('function');
    expect(client!.detectIntent).toBeTypeOf('function');
  });

  it('returns client when ANTHROPIC_AUTH_TOKEN env var is set', () => {
    delete process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_AUTH_TOKEN = 'env-auth-token';

    const client = createLLMClient();
    expect(client).not.toBeNull();
  });

  it('returns client when pre-built client is injected', () => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_AUTH_TOKEN;

    const fakeClient = { messages: { create: async () => ({}) } };
    const client = createLLMClient({ client: fakeClient });
    expect(client).not.toBeNull();
    expect(client!.compressStep).toBeTypeOf('function');
    expect(client!.rankItems).toBeTypeOf('function');
  });
});

