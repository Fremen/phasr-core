import { SessionType, PHASR_VERSION, type ParsedTrigger } from './types.js';

export interface CompressStepParams {
  task: string;
  whatIsLeft: string;
  stepsCompleted: string[];
  stepNumber: number;
  minutesLeft: number;
}

export interface RankItemsParams {
  items: string[];
  minutesLeft: number;
}

export interface RankedResult {
  top3: string[];
  bestNext: string;
}

export interface AnswerInContextParams {
  message: string;
  sessionType: SessionType;
  task: string;
  currentStep: string;
  stepIndex: number;
  stepsCompleted: string[];
  minutesLeft: number;
  context: Record<string, unknown>;
  recentExchanges?: Array<{ user: string; bot: string }>;
}

export interface ChatReplyParams {
  message: string;
}

export interface CategoriseItemParams {
  text: string;
}

export interface DetectIntentParams {
  message: string;
}

export interface LLMClient {
  compressStep(params: CompressStepParams): Promise<string | null>;
  rankItems(params: RankItemsParams): Promise<RankedResult | null>;
  detectIntent(params: DetectIntentParams): Promise<ParsedTrigger | null>;
  answerInContext(params: AnswerInContextParams): Promise<string | null>;
  chatReply(params: ChatReplyParams): Promise<string | null>;
  categoriseItem?(params: CategoriseItemParams): Promise<import('./types.js').ItemCategory | null>;
}

export interface LLMClientOptions {
  apiKey?: string;
  authToken?: string;
  baseURL?: string;
  model?: string;
  client?: any;
}

export function buildCompressStepPrompt(params: CompressStepParams): {
  system: string;
  user: string;
} {
  const system = `You are a calm, focused task coach. Given a task and what remains, produce the single next atomic action. One action, ~10 words, starts with a verb. No cheerleading. If the task seems complete, reply with exactly "DONE".`;

  const stepsStr =
    params.stepsCompleted.length > 0
      ? params.stepsCompleted.join('; ')
      : 'none';

  const user = `Task: ${params.task}. What's left: ${params.whatIsLeft}.\nSteps done: ${stepsStr}. Step ${params.stepNumber}. ${params.minutesLeft}m remaining.\nReply with ONLY the next step.`;

  return { system, user };
}

export function buildRankItemsPrompt(params: RankItemsParams): {
  system: string;
  user: string;
} {
  const system = `You are a calm prioritisation coach. Rank items by importance and urgency.`;

  const numbered = params.items.map((item, i) => `${i + 1}. ${item}`).join('\n');

  const user = `Items:\n${numbered}\nTime: ${params.minutesLeft}m.\nReply in format:\nTOP3: item1, item2, item3\nBEST: item_name`;

  return { system, user };
}

export function parseCompressStepResponse(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (trimmed.toUpperCase() === 'DONE') return null;
  // Strip leading numbers/bullets and quotes
  const cleaned = trimmed.replace(/^[\d.\-*)\s]+/, '').replace(/^["']|["']$/g, '');
  return cleaned || null;
}

export function parseRankItemsResponse(
  text: string,
  originalItems: string[],
): RankedResult | null {
  const lines = text.trim().split('\n');

  let top3: string[] = [];
  let bestNext: string | null = null;

  for (const line of lines) {
    const top3Match = line.match(/^\s*TOP3:\s*(.+)/i);
    if (top3Match) {
      top3 = top3Match[1]
        .split(',')
        .map(s => s.trim())
        .filter(s => s.length > 0);
    }

    const bestMatch = line.match(/^\s*BEST:\s*(.+)/i);
    if (bestMatch) {
      bestNext = bestMatch[1].trim();
    }
  }

  if (top3.length === 0 || !bestNext) return null;

  return { top3: top3.slice(0, 3), bestNext };
}

export function buildDetectIntentPrompt(params: DetectIntentParams): {
  system: string;
  user: string;
} {
  const system = `You classify user messages into session types. Only classify if the user clearly wants to START doing something now.

Types:
- PREP: User wants to work on, finish, or make progress on a specific task
- PACK: User needs to pack for a trip or outing
- PRIORITISE: User is overwhelmed by too many tasks and needs to triage
- PLAN: User needs to plan a trip, event, or activity
- COOK: User wants to cook a meal or recipe and needs step-by-step guidance
- NONE: Not a session request (greeting, question, chitchat)

Reply in exactly this format:
TYPE: PREP|PACK|PRIORITISE|PLAN|COOK|NONE
TASK: short task description
MINUTES: number|null
LEAVE: HH:MM|null`;

  const user = params.message;

  return { system, user };
}

const TYPE_MAP: Record<string, SessionType> = {
  PREP: SessionType.PREP,
  PACK: SessionType.PACK,
  PRIORITISE: SessionType.PRIORITISE,
  PRIORITIZE: SessionType.PRIORITISE,
  PLAN: SessionType.PLAN,
  COOK: SessionType.COOK,
};

export function parseDetectIntentResponse(text: string): ParsedTrigger | null {
  const lines = text.trim().split('\n');

  let type: SessionType | null = null;
  let task: string | null = null;
  let timeboxMinutes: number | null = null;
  let leaveAt: string | undefined;

  for (const line of lines) {
    const typeMatch = line.match(/^\s*TYPE:\s*(.+)/i);
    if (typeMatch) {
      const raw = typeMatch[1].trim().toUpperCase();
      if (raw === 'NONE') return null;
      type = TYPE_MAP[raw] ?? null;
    }

    const taskMatch = line.match(/^\s*TASK:\s*(.+)/i);
    if (taskMatch) {
      const val = taskMatch[1].trim();
      if (val && val.toLowerCase() !== 'null') {
        task = val;
      }
    }

    const minutesMatch = line.match(/^\s*MINUTES:\s*(.+)/i);
    if (minutesMatch) {
      const val = minutesMatch[1].trim();
      const num = parseInt(val, 10);
      if (!isNaN(num) && num > 0) {
        timeboxMinutes = num;
      }
    }

    const leaveMatch = line.match(/^\s*LEAVE:\s*(.+)/i);
    if (leaveMatch) {
      const val = leaveMatch[1].trim();
      if (/^\d{1,2}:\d{2}$/.test(val)) {
        leaveAt = val;
      }
    }
  }

  if (!type) return null;

  // Default task to type name when missing (matches BARE_PATTERNS behaviour)
  task ??= type.toLowerCase();

  const result: ParsedTrigger = { type, task, timeboxMinutes };
  if (leaveAt) result.leaveAt = leaveAt;
  return result;
}

export function buildAnswerInContextPrompt(params: AnswerInContextParams): {
  system: string;
  user: string;
} {
  const system = `You are a calm task coach inside an active ${params.sessionType} session. The user is working on "${params.task}". They are on step ${params.stepIndex}: "${params.currentStep}". ${params.minutesLeft}m left.

Answer their question helpfully in 1-3 short sentences. Stay grounded in the session context. Do not cheerleader. Do not dump lists unless asked.`;

  let contextDetails = '';
  if (params.sessionType === SessionType.PACK) {
    if (params.context.hasLaundry !== undefined) {
      contextDetails += `\nLaundry available: ${params.context.hasLaundry ? 'yes' : 'no'}.`;
    }
    if (params.context.categories) {
      contextDetails += `\nCategories: ${(params.context.categories as string[]).join(', ')}.`;
    }
  } else if (params.sessionType === SessionType.PREP) {
    if (params.context.whatIsLeft) {
      contextDetails += `\nWhat's left: ${params.context.whatIsLeft}.`;
    }
  } else if (params.sessionType === SessionType.PLAN) {
    if (params.context.constraints) {
      contextDetails += `\nConstraints: ${params.context.constraints}.`;
    }
  } else if (params.sessionType === SessionType.PRIORITISE) {
    if (params.context.ranked) {
      contextDetails += `\nTop items: ${(params.context.ranked as string[]).join(', ')}.`;
    }
  }

  if (params.stepsCompleted.length > 0) {
    contextDetails += `\nSteps completed: ${params.stepsCompleted.join('; ')}.`;
  }

  let historyBlock = '';
  if (params.recentExchanges && params.recentExchanges.length > 0) {
    const lines = params.recentExchanges.map(
      e => `User: ${e.user}\nAssistant: ${e.bot}`,
    );
    historyBlock = `Recent conversation:\n${lines.join('\n')}\n\n`;
  }

  const user = `${contextDetails ? contextDetails.trim() + '\n\n' : ''}${historyBlock}User asks: "${params.message}"`;

  return { system, user };
}

export function parseAnswerInContextResponse(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  // Cap at 3 sentences
  const sentences = trimmed.match(/[^.!?]+[.!?]+/g);
  if (sentences && sentences.length > 3) {
    return sentences.slice(0, 3).join('').trim();
  }
  return trimmed;
}

export function buildChatReplyPrompt(params: ChatReplyParams): {
  system: string;
  user: string;
} {
  const system = `You are Phasr v${PHASR_VERSION}, a calm executive function companion that helps people get things done through focused sessions.

You support 5 session types:
- Prep: Break a task into atomic steps and work through them one at a time. Start with "Prep: task (30m)".
- Pack: Pack for a trip using a category checklist. Start with "Pack: trip (25m)".
- Prioritise: Paste a list of tasks, get the top 3 ranked, then work through them. Start with "Prioritise: items (15m)".
- Plan: Plan a trip or event one decision at a time. Start with "Plan: topic (60m)".
- Cook: Guided cooking — coordinates multiple components in space and time, one step at a time. Designed for dyspraxia support. Start with "Cook: dish (45m)".

Be helpful, short (1-3 sentences), and grounded. No cheerleading. When relevant, nudge the user toward starting a session. If they seem to want to do something, suggest the matching session type with an example trigger phrase. If asked about your version, you are Phasr v${PHASR_VERSION}.`;

  const user = params.message;

  return { system, user };
}

export const parseChatReplyResponse = parseAnswerInContextResponse;

export function createLLMClient(options?: LLMClientOptions): LLMClient | null {
  const model = options?.model ?? process.env.PHASR_MODEL ?? 'claude-haiku-4-5-20251001';

  let getClient: () => Promise<any>;

  if (options?.client) {
    // Pre-built client provided — use it directly
    getClient = async () => options.client;
  } else {
    // Resolve credentials: apiKey → env → authToken → env
    const apiKey = options?.apiKey ?? process.env.ANTHROPIC_API_KEY;
    const authToken = options?.authToken ?? process.env.ANTHROPIC_AUTH_TOKEN;
    const baseURL = options?.baseURL;

    if (!apiKey && !authToken) return null;

    // Lazy-load the SDK to keep the module importable without it installed
    let clientInstance: any = null;
    getClient = async () => {
      if (!clientInstance) {
        const { default: Anthropic } = await import('@anthropic-ai/sdk');
        const clientOptions: Record<string, string> = {};
        if (apiKey) clientOptions.apiKey = apiKey;
        if (authToken) clientOptions.authToken = authToken;
        if (baseURL) clientOptions.baseURL = baseURL;
        clientInstance = new Anthropic(clientOptions);
      }
      return clientInstance;
    };
  }

  return {
    async compressStep(params: CompressStepParams): Promise<string | null> {
      try {
        const client = await getClient();
        const { system, user } = buildCompressStepPrompt(params);

        const response = await client.messages.create({
          model,
          max_tokens: 100,
          system,
          messages: [{ role: 'user', content: user }],
        });

        const text = response.content[0]?.type === 'text'
          ? response.content[0].text
          : '';

        return parseCompressStepResponse(text);
      } catch {
        return null;
      }
    },

    async rankItems(params: RankItemsParams): Promise<RankedResult | null> {
      try {
        const client = await getClient();
        const { system, user } = buildRankItemsPrompt(params);

        const response = await client.messages.create({
          model,
          max_tokens: 200,
          system,
          messages: [{ role: 'user', content: user }],
        });

        const text = response.content[0]?.type === 'text'
          ? response.content[0].text
          : '';

        return parseRankItemsResponse(text, params.items);
      } catch {
        return null;
      }
    },

    async detectIntent(params: DetectIntentParams): Promise<ParsedTrigger | null> {
      try {
        const client = await getClient();
        const { system, user } = buildDetectIntentPrompt(params);

        const response = await client.messages.create({
          model,
          max_tokens: 100,
          system,
          messages: [{ role: 'user', content: user }],
        });

        const text = response.content[0]?.type === 'text'
          ? response.content[0].text
          : '';

        return parseDetectIntentResponse(text);
      } catch {
        return null;
      }
    },

    async answerInContext(params: AnswerInContextParams): Promise<string | null> {
      try {
        const client = await getClient();
        const { system, user } = buildAnswerInContextPrompt(params);

        const response = await client.messages.create({
          model,
          max_tokens: 200,
          system,
          messages: [{ role: 'user', content: user }],
        });

        const text = response.content[0]?.type === 'text'
          ? response.content[0].text
          : '';

        return parseAnswerInContextResponse(text);
      } catch {
        return null;
      }
    },

    async chatReply(params: ChatReplyParams): Promise<string | null> {
      try {
        const client = await getClient();
        const { system, user } = buildChatReplyPrompt(params);

        const response = await client.messages.create({
          model,
          max_tokens: 200,
          system,
          messages: [{ role: 'user', content: user }],
        });

        const text = response.content[0]?.type === 'text'
          ? response.content[0].text
          : '';

        return parseChatReplyResponse(text);
      } catch {
        return null;
      }
    },

    async categoriseItem(params: CategoriseItemParams): Promise<import('./types.js').ItemCategory | null> {
      try {
        const client = await getClient();
        const system = 'Categorise this task into exactly one of: home, garden, work, tech, family, food, other. Reply with only the category name, nothing else.';

        const response = await client.messages.create({
          model,
          max_tokens: 20,
          system,
          messages: [{ role: 'user', content: params.text }],
        });

        const text = (response.content[0]?.type === 'text'
          ? response.content[0].text
          : '').trim().toLowerCase();

        const valid = ['home', 'garden', 'work', 'tech', 'family', 'food', 'other'] as const;
        return (valid as readonly string[]).includes(text) ? text as import('./types.js').ItemCategory : null;
      } catch {
        return null;
      }
    },
  };
}
