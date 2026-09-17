export const PHASR_VERSION = '0.2.0';

export enum SessionType {
  PREP = 'PREP',
  PACK = 'PACK',
  PRIORITISE = 'PRIORITISE',
  PLAN = 'PLAN',
  COOK = 'COOK',
}

export const SESSION_TYPE_META: Record<SessionType, { emoji: string; description: string }> = {
  [SessionType.PREP]: { emoji: '🎯', description: 'Breaks work into atomic steps, one at a time' },
  [SessionType.PACK]: { emoji: '🎒', description: 'Walks through packing categories' },
  [SessionType.PRIORITISE]: { emoji: '⚡', description: 'Ranks items, picks best next, micro-session' },
  [SessionType.PLAN]: { emoji: '🗺️', description: 'One decision at a time, gathers constraints' },
  [SessionType.COOK]: { emoji: '🍳', description: 'Guided cooking — coordinates components in space and time' },
};

export enum SessionState {
  IDLE = 'IDLE',
  STARTING = 'STARTING',
  RUNNING = 'RUNNING',
  PAUSED = 'PAUSED',
  ENDING = 'ENDING',
}

export interface TimeStatus {
  minutesLeft: number;
  leaveTime: string | null;
  warnings: string[];
}

export interface ParsedTrigger {
  type: SessionType;
  task: string;
  timeboxMinutes: number | null;
  leaveAt?: string;
}

export interface SessionSnapshot {
  type: SessionType;
  state: SessionState;
  task: string;
  currentStep: string | null;
  stepIndex: number;
  stepsCompleted: string[];
  minutesLeft: number;
  leaveTime: string | null;
  nudgeEnabled: boolean;
  stackDepth: number;
}

// --- Task List types ---

export type ItemStatus = 'backlog' | 'hot' | 'done';

export type ItemCategory =
  | 'home' | 'garden' | 'work' | 'tech'
  | 'family' | 'food' | 'other';

export const CATEGORY_EMOJI: Record<ItemCategory, string> = {
  home: '🏠',
  garden: '🌿',
  work: '💼',
  tech: '🤖',
  family: '👨‍👩‍👦‍👦',
  food: '🍽',
  other: '📌',
};

export interface TaskItem {
  id: string;
  text: string;
  category: ItemCategory;
  status: ItemStatus;
  addedAt: Date;
  promotedAt: Date | null;
  completedAt: Date | null;
}

export interface ParsedListCommand {
  action: 'add' | 'done' | 'remove' | 'view' | 'promote' | 'backlog' | 'archive' | 'knock-out' | 'recommend';
  text?: string;
  category?: ItemCategory;
  status?: ItemStatus;
  count?: number;
  timeboxMinutes?: number;
}

// --- Backlog KB types ---

export type BacklogCategory = string;

export const BACKLOG_CATEGORY_EMOJI: Record<string, string> = {
  home: '🏠',
  garden: '🌿',
  work: '💼',
  tech: '🤖',
  family: '👨‍👩‍👦‍👦',
  food: '🍽',
  finance: '💰',
  health: '🏥',
  ideas: '💡',
  shopping: '🛒',
  events: '📅',
  uncategorized: '📌',
};

export type BacklogItemStatus = 'active' | 'promoted' | 'archived';

export interface BacklogItem {
  id: string;
  text: string;
  category: BacklogCategory;
  subcategory?: string;
  status: BacklogItemStatus;
  source?: string;
  importedAt?: string;
  completedAt?: string;
}

export interface ParsedBacklogCommand {
  action: 'list' | 'search' | 'add' | 'promote' | 'demote' | 'archive' | 'stats' | 'purge' | 'retriage';
  text?: string;
  category?: string;
}

// --- Session types ---

export interface Session {
  type: SessionType;
  state: SessionState;
  task: string;
  startTime: Date;
  endTime: Date;
  timeboxMinutes: number;
  stepsCompleted: string[];
  currentStep: string | null;
  stepIndex: number;
  nudgeEnabled: boolean;
  lastInteractionAt: Date;
  pausedAt: Date | null;
  elapsedBeforePause: number;
  context: Record<string, unknown>;
}
