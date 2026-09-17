import { SessionType, TimeStatus, ParsedTrigger } from './types.js';

const TRIGGER_PATTERNS: Array<{ type: SessionType; pattern: RegExp }> = [
  { type: SessionType.PREP, pattern: /^(?:prep(?:aring)?(?:\s+for)?)[:\s]+(.+?)(?:\s*\((\d+)m\))?$/i },
  { type: SessionType.PACK, pattern: /^(?:pack(?:ing)?(?:\s+for)?)[:\s]+(.+?)(?:\s*\((\d+)m\))?$/i },
  { type: SessionType.PRIORITISE, pattern: /^(?:prioriti[sz](?:e|ing))[:\s]+(.+?)(?:\s*\((\d+)m\))?$/i },
  { type: SessionType.PLAN, pattern: /^(?:plan(?:ning)?(?:\s+(?:a|the))?)[:\s]+(.+?)(?:\s*\((\d+)m\))?$/i },
  { type: SessionType.COOK, pattern: /^(?:cook(?:ing)?(?:\s+(?:a|the))?)[:\s]+(.+?)(?:\s*\((\d+)m\))?$/i },
];

// Also match bare keywords: "Preparing for X", "Packing for trip"
const BARE_PATTERNS: Array<{ type: SessionType; pattern: RegExp }> = [
  { type: SessionType.PREP, pattern: /^preparing\s+(?:for\s+)?(.+?)(?:\s*\((\d+)m\))?$/i },
  { type: SessionType.PACK, pattern: /^packing\s+(?:for\s+)?(.+?)(?:\s*\((\d+)m\))?$/i },
  { type: SessionType.PRIORITISE, pattern: /^prioriti[sz]ing(?:\s+(.+?))?(?:\s*\((\d+)m\))?$/i },
  { type: SessionType.PLAN, pattern: /^planning\s+(?:a\s+|the\s+)?(.+?)(?:\s*\((\d+)m\))?$/i },
  { type: SessionType.COOK, pattern: /^cooking\s+(?:a\s+|the\s+)?(.+?)(?:\s*\((\d+)m\))?$/i },
];

export function normalizeTimeString(raw: string): string {
  const trimmed = raw.trim().toLowerCase();

  // Match "3:30pm", "3:30 pm", "15:30"
  const colonMatch = trimmed.match(/^(\d{1,2}):(\d{2})\s*(am|pm)?$/);
  if (colonMatch) {
    let hours = parseInt(colonMatch[1], 10);
    const minutes = colonMatch[2];
    const period = colonMatch[3];
    if (period === 'pm' && hours < 12) hours += 12;
    if (period === 'am' && hours === 12) hours = 0;
    return `${hours.toString().padStart(2, '0')}:${minutes}`;
  }

  // Match "3pm", "3 pm", "15"
  const bareMatch = trimmed.match(/^(\d{1,2})\s*(am|pm)?$/);
  if (bareMatch) {
    let hours = parseInt(bareMatch[1], 10);
    const period = bareMatch[2];
    if (period === 'pm' && hours < 12) hours += 12;
    if (period === 'am' && hours === 12) hours = 0;
    return `${hours.toString().padStart(2, '0')}:00`;
  }

  return trimmed;
}

export function calculateTimeboxFromLeaveTime(leaveTimeHHMM: string, now: Date): number {
  const [hours, minutes] = leaveTimeHHMM.split(':').map(Number);
  const target = new Date(now);
  target.setHours(hours, minutes, 0, 0);
  const diff = Math.round((target.getTime() - now.getTime()) / 60000);
  return Math.max(0, diff);
}

export function parseTrigger(msg: string): ParsedTrigger | null {
  let trimmed = msg.trim();
  let leaveAt: string | undefined;

  // Check for "(leave at/by X)" suffix before running trigger regexes
  const leaveMatch = trimmed.match(/\s*\(leave\s+(?:at|by)\s+(.+?)\)\s*$/i);
  if (leaveMatch) {
    leaveAt = normalizeTimeString(leaveMatch[1]);
    trimmed = trimmed.slice(0, leaveMatch.index!).trim();
  }

  for (const { type, pattern } of TRIGGER_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match) {
      return {
        type,
        task: match[1].trim(),
        timeboxMinutes: match[2] ? parseInt(match[2], 10) : null,
        ...(leaveAt && { leaveAt }),
      };
    }
  }

  for (const { type, pattern } of BARE_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match) {
      return {
        type,
        task: (match[1] || '').trim() || type.toLowerCase(),
        timeboxMinutes: match[2] ? parseInt(match[2], 10) : null,
        ...(leaveAt && { leaveAt }),
      };
    }
  }

  return null;
}

export function externalizeTime(now: Date, endTime: Date): TimeStatus {
  const msLeft = endTime.getTime() - now.getTime();
  const minutesLeft = Math.max(0, Math.round(msLeft / 60000));
  const warnings: string[] = [];

  if (minutesLeft <= 1 && minutesLeft > 0) warnings.push('1 minute left.');
  else if (minutesLeft <= 2) warnings.push('2 minutes left — wrap the current step and stop.');
  else if (minutesLeft <= 5) warnings.push(`${minutesLeft} minutes left — start wrapping up.`);
  else if (minutesLeft <= 10) warnings.push(`${minutesLeft} minutes left.`);

  const leaveTime = formatClockTime(endTime);

  return { minutesLeft, leaveTime, warnings };
}

export function estimateRemaining(stepCount: number): [number, number] {
  return [stepCount * 2, stepCount * 5];
}

export function driftCheck(
  lastInteraction: Date,
  now: Date,
  thresholdMinutes: number = 5,
): boolean {
  const elapsed = (now.getTime() - lastInteraction.getTime()) / 60000;
  return elapsed >= thresholdMinutes;
}

const NUDGE_BANK = [
  'Still on it?',
  'Quick check — still finishing this?',
  'Still going?',
  'Checking in — how\'s it going?',
  'Still working on this?',
  'Hey — still here?',
  'Need a nudge? Still on track?',
  'Just checking — still at it?',
];

export function nudgeCopy(): string {
  return NUDGE_BANK[Math.floor(Math.random() * NUDGE_BANK.length)];
}

export function completionPush(minutesLeft: number): string {
  if (minutesLeft <= 1) return 'Time\'s up — stop where you are.';
  if (minutesLeft <= 2) return `${minutesLeft} minutes left — wrap the current step and stop.`;
  if (minutesLeft <= 5) return `${minutesLeft} minutes left — finish what you\'re on and start wrapping up.`;
  return `${minutesLeft} minutes left.`;
}

export function formatTimeHeader(status: TimeStatus): string {
  if (status.leaveTime) {
    return `Leave at ${status.leaveTime} — ${status.minutesLeft}m left`;
  }
  return `Time left: ${status.minutesLeft}m`;
}

function formatClockTime(date: Date): string {
  const h = date.getHours().toString().padStart(2, '0');
  const m = date.getMinutes().toString().padStart(2, '0');
  return `${h}:${m}`;
}

