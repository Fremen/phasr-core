import { SessionType } from './types.js';

export const SYSTEM_PROMPT = `You are a calm, grounded co-pilot helping the user complete a task. You are short, direct, and non-judgmental. No cheerleading. No hype. You show the user the next step and keep them on track.`;

export function formatBrandedHeader(
  icon: string,
  label: string,
): string {
  return `${icon} Phasr · ${label}`;
}

export const STARTER_QUESTIONS: Record<SessionType, string> = {
  [SessionType.PREP]: "What's left — outline, draft, or final pass?",
  [SessionType.PACK]: 'Any laundry access there? (yes/no)',
  [SessionType.PRIORITISE]: 'Paste the items.',
  [SessionType.PLAN]: 'Dates + who\'s going + must-dos?',
  [SessionType.COOK]: 'List each component (e.g. pasta, sauce, salad) — one per line.',
};

export function formatStarterMessage(
  type: SessionType,
  task: string,
  timeboxMinutes: number,
): string {
  const question = STARTER_QUESTIONS[type];
  // PRIORITISE with item count: "Paste the 8 items."
  if (type === SessionType.PRIORITISE) {
    const countMatch = task.match(/(\d+)\s*items?/i);
    if (countMatch) {
      return `Paste the ${countMatch[1]} items.`;
    }
  }
  return `${timeboxMinutes} minutes. ${question}`;
}

export function formatStepMessage(
  header: string,
  stepNumber: number,
  action: string,
): string {
  return `${header}\nStep ${stepNumber}: ${action}. Say 'done'.`;
}

export function formatWrapMessage(
  completed: string[],
  remaining: string[],
  suggestedTimebox?: number,
): string {
  const doneStr = completed.length > 0 ? completed.join(', ') : 'nothing yet';
  let msg = `Done: ${doneStr}.`;
  if (remaining.length > 0) {
    msg += ` Remaining: ${remaining.join(', ')}.`;
  }
  if (suggestedTimebox) {
    msg += ` Suggested next: ${suggestedTimebox}m session.`;
  }
  return msg;
}

export const PACK_CATEGORIES = ['clothes', 'toiletries', 'tech', 'documents'] as const;
export const PACK_CATEGORIES_EXTENDED = [
  ...PACK_CATEGORIES,
  'medications',
  'snacks',
  'entertainment',
] as const;
export type PackCategory = typeof PACK_CATEGORIES_EXTENDED[number];

export const PACK_ITEMS: Record<PackCategory, { withLaundry: string[]; noLaundry: string[] }> = {
  clothes: {
    withLaundry: ['3 tops and 2 bottoms', 'underwear for 3 days', 'sleepwear', 'one jacket or layer'],
    noLaundry: ['tops for each day', 'bottoms for each day', 'underwear for each day', 'sleepwear', 'one jacket or layer'],
  },
  toiletries: {
    withLaundry: ['toothbrush + toothpaste', 'deodorant', 'sunscreen', 'any medications'],
    noLaundry: ['toothbrush + toothpaste', 'deodorant', 'sunscreen', 'any medications'],
  },
  tech: {
    withLaundry: ['phone charger', 'laptop + charger if needed', 'headphones', 'adaptor if international'],
    noLaundry: ['phone charger', 'laptop + charger if needed', 'headphones', 'adaptor if international'],
  },
  documents: {
    withLaundry: ['passport/ID', 'boarding passes', 'hotel confirmation', 'travel insurance'],
    noLaundry: ['passport/ID', 'boarding passes', 'hotel confirmation', 'travel insurance'],
  },
  medications: {
    withLaundry: ['prescription meds', 'painkillers', 'vitamins'],
    noLaundry: ['prescription meds', 'painkillers', 'vitamins'],
  },
  snacks: {
    withLaundry: ['snack bars', 'water bottle', 'gum/mints'],
    noLaundry: ['snack bars', 'water bottle', 'gum/mints'],
  },
  entertainment: {
    withLaundry: ['book/kindle', 'travel games', 'journal'],
    noLaundry: ['book/kindle', 'travel games', 'journal'],
  },
};

