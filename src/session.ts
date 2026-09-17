import {
  PHASR_VERSION,
  Session,
  SessionType,
  SessionState,
  TimeStatus,
  ParsedTrigger,
  CATEGORY_EMOJI,
  BACKLOG_CATEGORY_EMOJI,
  type SessionSnapshot,
} from './types.js';
import {
  parseTrigger,
  externalizeTime,
  estimateRemaining,
  driftCheck,
  nudgeCopy,
  completionPush,
  calculateTimeboxFromLeaveTime,
} from './primitives.js';
import {
  formatStarterMessage,
  formatStepMessage,
  formatWrapMessage,
  formatBrandedHeader,
  PACK_CATEGORIES,
  PACK_CATEGORIES_EXTENDED,
  PACK_ITEMS,
  type PackCategory,
} from './prompts.js';
import type { LLMClient } from './llm.js';
import type { MemoryStore, SessionRecord } from './memory.js';
import type { TaskList } from './tasklist.js';
import type { Backlog } from './backlog.js';
import type { ParsedListCommand, ParsedBacklogCommand, ItemCategory } from './types.js';
import { parseListCommand, guessCategoryFromKeywords } from './tasklist-commands.js';
import { parseBacklogCommand } from './backlog-commands.js';

const DEFAULT_TIMEBOX = 25;

const DRIFT_THRESHOLDS: Record<SessionType, number> = {
  [SessionType.PREP]: 5,
  [SessionType.PACK]: 3,
  [SessionType.PRIORITISE]: 4,
  [SessionType.PLAN]: 8,
  [SessionType.COOK]: 4,
};

export interface SessionEngineOptions {
  llm?: LLMClient | null;
  memory?: MemoryStore;
  tasklist?: TaskList;
  backlog?: Backlog;
}

export class SessionEngine {
  private sessionStack: Session[] = [];
  private llm: LLMClient | null;
  private memory: MemoryStore | null;
  private tasklist: TaskList | null;
  private backlog: Backlog | null;

  constructor(options?: SessionEngineOptions) {
    this.llm = options?.llm ?? null;
    this.memory = options?.memory ?? null;
    this.tasklist = options?.tasklist ?? null;
    this.backlog = options?.backlog ?? null;
  }

  private get session(): Session | null {
    return this.sessionStack.at(-1) ?? null;
  }

  private set session(value: Session | null) {
    if (value === null) {
      this.sessionStack.pop();
    } else if (this.sessionStack.length > 0 && this.sessionStack.at(-1) === value) {
      // Already the top — no-op (property mutations are direct)
    } else {
      this.sessionStack.push(value);
    }
  }

  get stackDepth(): number {
    return this.sessionStack.length;
  }

  get isActive(): boolean {
    return this.session !== null && this.session.state !== SessionState.IDLE;
  }

  get timeStatus(): TimeStatus | null {
    if (!this.session) return null;
    return externalizeTime(new Date(), this.session.endTime);
  }

  async handle(message: string, now?: Date): Promise<string> {
    const currentTime = now ?? new Date();
    const trimmed = message.trim();

    // Handle "no nudges" command
    if (this.session && /^no\s+nudges?$/i.test(trimmed)) {
      this.session.nudgeEnabled = false;
      return 'Nudges disabled for this session.';
    }

    // Handle "stop" command
    if (this.session && /^stop$/i.test(trimmed)) {
      return this.end();
    }

    // Handle "pause" command
    if (this.session && this.session.state === SessionState.RUNNING && /^pause$/i.test(trimmed)) {
      return this.pause(currentTime);
    }

    // Handle "resume"/"continue" command
    if (this.session && this.session.state === SessionState.PAUSED && /^(?:resume|continue)$/i.test(trimmed)) {
      return this.resume(currentTime);
    }

    // Version query
    if (/^(?:version|--version|-v|what version|what(?:'s| is) (?:your |the |phasr )?version)[\s?!]*$/i.test(trimmed)) {
      return `Phasr v${PHASR_VERSION}`;
    }

    // Backlog KB commands (checked before hot list)
    if (this.backlog) {
      const cmd = parseBacklogCommand(trimmed);
      if (cmd) return this.handleBacklogCommand(cmd);
    }

    // Hot list / backlog commands (work from any state)
    if (this.tasklist) {
      const listCmd = parseListCommand(trimmed);
      if (listCmd) return this.handleListCommand(listCmd, currentTime);
    }

    // If no active session, try to parse a trigger
    if (!this.session || this.session.state === SessionState.IDLE) {
      const parsed = parseTrigger(trimmed);
      if (parsed) {
        return this.start(parsed, currentTime);
      }
      if (this.llm) {
        const llmParsed = await this.llm.detectIntent({ message: trimmed });
        if (llmParsed) {
          return this.start(llmParsed, currentTime);
        }
      }
      if (this.llm) {
        const reply = await this.llm.chatReply({ message: trimmed });
        if (reply) return reply;
      }
      return 'Start a session: "Prep: task (30m)", "Pack: trip (25m)", "Prioritise: items (15m)", "Plan: topic (60m)", or "Cook: dish (45m)".';
    }

    // Active session — route based on state
    if (this.session.state === SessionState.STARTING) {
      this.session.lastInteractionAt = currentTime;
      return this.handleStartingResponse(trimmed, currentTime);
    }

    if (this.session.state === SessionState.RUNNING) {
      this.session.lastInteractionAt = currentTime;
      if (/^done$/i.test(trimmed)) {
        return this.advanceStep(currentTime);
      }
      // Any other message during running — treat as progress update, re-show current step
      return this.handleProgressUpdate(trimmed, currentTime);
    }

    // PAUSED state — try to start a stacked session, otherwise show hint
    if (this.session.state === SessionState.PAUSED) {
      const parsed = parseTrigger(trimmed);
      if (parsed) {
        return this.start(parsed, currentTime);
      }
      if (this.llm) {
        const llmParsed = await this.llm.detectIntent({ message: trimmed });
        if (llmParsed) {
          return this.start(llmParsed, currentTime);
        }
      }
      return `${formatBrandedHeader('⏸', 'Paused')}\nSay "resume" to continue or "stop" to end.`;
    }

    return this.end();
  }

  checkDrift(now?: Date): string | null {
    if (!this.session || this.session.state !== SessionState.RUNNING) return null;
    if (!this.session.nudgeEnabled) return null;

    const currentTime = now ?? new Date();
    const threshold = DRIFT_THRESHOLDS[this.session.type];
    if (driftCheck(this.session.lastInteractionAt, currentTime, threshold)) {
      const status = externalizeTime(currentTime, this.session.endTime);
      const header = this.getBrandedHeader(status);
      return `${header}\n${nudgeCopy()}`;
    }
    return null;
  }

  checkTime(now?: Date): string | null {
    if (!this.session || this.session.state !== SessionState.RUNNING) return null;

    const currentTime = now ?? new Date();
    const status = externalizeTime(currentTime, this.session.endTime);

    if (status.minutesLeft <= 0) {
      return this.end('timed_out');
    }

    if (status.minutesLeft <= 5) {
      const header = this.getBrandedHeader(status);
      return `${header}\n${completionPush(status.minutesLeft)}`;
    }

    return null;
  }

  private getBrandedHeader(status: TimeStatus): string {
    const typeName = this.session!.type.charAt(0) + this.session!.type.slice(1).toLowerCase();
    const timeStr = this.session?.context.leaveAt
      ? `Leave at ${this.session.context.leaveAt} — ${status.minutesLeft}m left`
      : `${status.minutesLeft}m left`;
    return formatBrandedHeader('⏱', `${typeName} · ${timeStr}`);
  }

  getSnapshot(now?: Date): SessionSnapshot | null {
    if (!this.session) return null;
    const currentTime = now ?? new Date();
    const status = externalizeTime(currentTime, this.session.endTime);
    return {
      type: this.session.type,
      state: this.session.state,
      task: this.session.task,
      currentStep: this.session.currentStep,
      stepIndex: this.session.stepIndex,
      stepsCompleted: [...this.session.stepsCompleted],
      minutesLeft: status.minutesLeft,
      leaveTime: (this.session.context.leaveAt as string) ?? null,
      nudgeEnabled: this.session.nudgeEnabled,
      stackDepth: this.sessionStack.length,
    };
  }

  private start(parsed: ParsedTrigger, now: Date): string {
    let timeboxMinutes = parsed.timeboxMinutes ?? DEFAULT_TIMEBOX;

    // If leave-time is set and no explicit timebox, compute timebox from leave time
    if (parsed.leaveAt && !parsed.timeboxMinutes) {
      timeboxMinutes = calculateTimeboxFromLeaveTime(parsed.leaveAt, now);
      if (timeboxMinutes <= 0) timeboxMinutes = DEFAULT_TIMEBOX;
    }

    const endTime = new Date(now.getTime() + timeboxMinutes * 60000);

    this.session = {
      type: parsed.type,
      state: SessionState.STARTING,
      task: parsed.task,
      startTime: now,
      endTime,
      timeboxMinutes,
      stepsCompleted: [],
      currentStep: null,
      stepIndex: 0,
      nudgeEnabled: true,
      lastInteractionAt: now,
      pausedAt: null,
      elapsedBeforePause: 0,
      context: {},
    };

    if (parsed.leaveAt) {
      this.session.context.leaveAt = parsed.leaveAt;
    }

    const status = externalizeTime(now, endTime);
    const header = this.getBrandedHeader(status);
    return `${header}\n${formatStarterMessage(parsed.type, parsed.task, timeboxMinutes)}`;
  }

  private async handleStartingResponse(response: string, now: Date): Promise<string> {
    if (!this.session) return '';
    const status = externalizeTime(now, this.session.endTime);

    switch (this.session.type) {
      case SessionType.PREP:
        return this.startPrep(response, status);
      case SessionType.PACK:
        return this.startPack(response, status);
      case SessionType.PRIORITISE:
        return this.startPrioritise(response, status);
      case SessionType.PLAN:
        return this.startPlan(response, status);
      case SessionType.COOK:
        return this.startCook(response, status);
    }
  }

  private async startPrep(response: string, status: TimeStatus): Promise<string> {
    if (!this.session) return '';
    this.session.state = SessionState.RUNNING;
    this.session.context.whatIsLeft = response;

    // Try LLM first, fall back to template
    let step: string | null = null;
    if (this.llm) {
      step = await this.llm.compressStep({
        task: this.session.task,
        whatIsLeft: response,
        stepsCompleted: [],
        stepNumber: 1,
        minutesLeft: status.minutesLeft,
      });
    }
    step ??= this.getNextPrepStep(response, 1) ?? 'identify the single most important thing to finish';
    this.session.currentStep = step;
    this.session.stepIndex = 1;

    return formatStepMessage(this.getBrandedHeader(status), 1, step);
  }

  private startPack(response: string, status: TimeStatus): string {
    if (!this.session) return '';
    this.session.state = SessionState.RUNNING;

    const hasLaundry = /yes/i.test(response);
    const useFull = /\b(?:full|everything)\b/i.test(response);
    const categories = useFull
      ? [...PACK_CATEGORIES_EXTENDED]
      : [...PACK_CATEGORIES];

    this.session.context.hasLaundry = hasLaundry;
    this.session.context.categoryIndex = 0;
    this.session.context.categories = categories;

    const step = this.packStepForCategory(0, hasLaundry);
    this.session.currentStep = step;
    this.session.stepIndex = 1;

    return formatStepMessage(this.getBrandedHeader(status), 1, step);
  }

  private getActiveCategories(): readonly string[] {
    return (this.session?.context.categories as string[]) ?? PACK_CATEGORIES;
  }

  private packStepForCategory(catIdx: number, hasLaundry: boolean): string {
    const categories = this.getActiveCategories();
    const category = categories[catIdx] as PackCategory;
    const items = hasLaundry ? PACK_ITEMS[category].withLaundry : PACK_ITEMS[category].noLaundry;
    const itemList = items.join(', ');

    if (catIdx === 0) return `grab suitcase + lay out ${itemList}`;
    if (category === 'toiletries') return `toiletries bag — ${itemList}`;
    return `${category} — ${itemList}`;
  }

  private async startPrioritise(response: string, status: TimeStatus): Promise<string> {
    if (!this.session) return '';
    this.session.state = SessionState.RUNNING;

    // Parse items from response (newline or comma separated)
    const items = response
      .split(/[\n,]+/)
      .map(s => s.trim())
      .filter(s => s.length > 0);

    this.session.context.items = items;

    // Try LLM ranking first, fall back to naive slice
    let top3: string[];
    let bestNext: string;

    if (this.llm) {
      const ranked = await this.llm.rankItems({
        items,
        minutesLeft: status.minutesLeft,
      });
      if (ranked) {
        top3 = ranked.top3;
        bestNext = ranked.bestNext;
      } else {
        top3 = items.slice(0, Math.min(3, items.length));
        bestNext = top3[0];
      }
    } else {
      top3 = items.slice(0, Math.min(3, items.length));
      bestNext = top3[0];
    }

    this.session.context.ranked = top3;
    this.session.context.bestNext = bestNext;

    const rankedStr = top3.join(', ');
    const step = `open ${bestNext} and start working on it`;
    this.session.currentStep = step;
    this.session.stepIndex = 1;

    return `${this.getBrandedHeader(status)}\nTop 3: ${rankedStr}. Best next: ${bestNext}. Step 1: ${step}. Say 'done'.`;
  }

  private startPlan(response: string, status: TimeStatus): string {
    if (!this.session) return '';
    this.session.state = SessionState.RUNNING;
    this.session.context.constraints = response;
    this.session.context.decisions = [];

    const step = 'confirm base area + daily pace (chill/medium/packed)';
    this.session.currentStep = step;
    this.session.stepIndex = 1;

    return formatStepMessage(this.getBrandedHeader(status), 1, step);
  }

  private startCook(response: string, status: TimeStatus): string {
    if (!this.session) return '';
    this.session.state = SessionState.RUNNING;

    // Parse components from response (newline or comma separated)
    const components = response
      .split(/[\n,]+/)
      .map(s => s.trim())
      .filter(s => s.length > 0);

    this.session.context.components = components;

    // Build step sequence: clear → gather → prep each → cook each → plate
    const steps: string[] = [
      'clear the worktop — move everything off that you don\'t need',
      'read through the full recipe once before touching anything',
    ];

    if (components.length > 0) {
      steps.push(`get all ingredients out for: ${components.join(', ')} — line them up left to right`);
      steps.push('get all pans, boards, and tools out — place next to their ingredients');
    }

    // For multiple components, identify longest-cooking first
    if (components.length > 1) {
      steps.push(`start the longest-cooking component first (likely ${components[0]}) — set a timer`);
      for (let i = 1; i < components.length; i++) {
        steps.push(`prep ${components[i]} while ${components[i - 1]} cooks`);
        if (i < components.length - 1) {
          steps.push('quick check — stir/flip anything that\'s on the hob');
        }
      }
    } else if (components.length === 1) {
      steps.push(`start prepping ${components[0]} — one ingredient at a time`);
      steps.push(`cook ${components[0]} — set a timer`);
    }

    steps.push('taste and season — salt, pepper, adjust');
    steps.push('plate up — one component at a time, left to right');

    this.session.context.cookSteps = steps;

    const step = steps[0];
    this.session.currentStep = step;
    this.session.stepIndex = 1;

    return formatStepMessage(this.getBrandedHeader(status), 1, step);
  }

  private advanceCook(status: TimeStatus): string {
    if (!this.session) return '';
    this.session.stepIndex++;

    const steps = this.session.context.cookSteps as string[];
    if (this.session.stepIndex > steps.length) {
      return this.end('completed');
    }

    const step = steps[this.session.stepIndex - 1];
    this.session.currentStep = step;
    return formatStepMessage(this.getBrandedHeader(status), this.session.stepIndex, step);
  }

  private async advanceStep(now: Date): Promise<string> {
    if (!this.session) return '';
    const status = externalizeTime(now, this.session.endTime);

    // Record completed step
    if (this.session.currentStep) {
      this.session.stepsCompleted.push(this.session.currentStep);

      // Auto-mark-done: if this session is a knock-out, mark matching hot list items
      if (this.tasklist && this.session.context.hotListItemIds) {
        const ids = this.session.context.hotListItemIds as string[];
        const stepIdx = this.session.stepsCompleted.length - 1;
        if (stepIdx < ids.length) {
          this.tasklist.markDone(ids[stepIdx]).catch(() => {});
        }
      }
    }

    if (status.minutesLeft <= 0) {
      return this.end('timed_out');
    }

    switch (this.session.type) {
      case SessionType.PREP:
        return this.advancePrep(status);
      case SessionType.PACK:
        return this.advancePack(status);
      case SessionType.PRIORITISE:
        return this.advancePrioritise(status);
      case SessionType.PLAN:
        return this.advancePlan(status);
      case SessionType.COOK:
        return this.advanceCook(status);
    }
  }

  private async advancePrep(status: TimeStatus): Promise<string> {
    if (!this.session) return '';
    this.session.stepIndex++;

    const whatIsLeft = (this.session.context.whatIsLeft as string) || '';

    // Try LLM first, fall back to template
    let step: string | null = null;
    if (this.llm) {
      step = await this.llm.compressStep({
        task: this.session.task,
        whatIsLeft,
        stepsCompleted: [...this.session.stepsCompleted],
        stepNumber: this.session.stepIndex,
        minutesLeft: status.minutesLeft,
      });
    }
    step ??= this.getNextPrepStep(whatIsLeft, this.session.stepIndex);

    if (!step) {
      return this.end('completed');
    }

    this.session.currentStep = step;
    return formatStepMessage(this.getBrandedHeader(status), this.session.stepIndex, step);
  }

  private advancePack(status: TimeStatus): string {
    if (!this.session) return '';
    const hasLaundry = this.session.context.hasLaundry as boolean;
    const catIdx = (this.session.context.categoryIndex as number) + 1;
    this.session.context.categoryIndex = catIdx;

    const categories = this.getActiveCategories();
    if (catIdx >= categories.length) {
      return this.end('completed');
    }

    this.session.stepIndex++;
    const step = this.packStepForCategory(catIdx, hasLaundry);
    this.session.currentStep = step;
    return formatStepMessage(this.getBrandedHeader(status), this.session.stepIndex, step);
  }

  private advancePrioritise(status: TimeStatus): string {
    if (!this.session) return '';
    this.session.stepIndex++;

    const items = this.session.context.items as string[];
    const ranked = this.session.context.ranked as string[];

    if (this.session.stepIndex > ranked.length) {
      return this.end('completed');
    }

    const nextItem = ranked[this.session.stepIndex - 1];
    const step = `move to ${nextItem} and start working on it`;
    this.session.currentStep = step;
    return formatStepMessage(this.getBrandedHeader(status), this.session.stepIndex, step);
  }

  private advancePlan(status: TimeStatus): string {
    if (!this.session) return '';
    this.session.stepIndex++;

    const step = this.getNextPlanStep(this.session.stepIndex);
    if (!step) {
      return this.end('completed');
    }

    this.session.currentStep = step;
    return formatStepMessage(this.getBrandedHeader(status), this.session.stepIndex, step);
  }

  private async handleProgressUpdate(message: string, now: Date): Promise<string> {
    if (!this.session) return '';
    const status = externalizeTime(now, this.session.endTime);
    const header = this.getBrandedHeader(status);
    const fallback = `${header}\nGot it. Still on step ${this.session.stepIndex}: ${this.session.currentStep}. Say 'done' when ready.`;

    const recentExchanges = (this.session.context.recentExchanges as Array<{ user: string; bot: string }>) ?? [];

    if (this.llm && this.session.currentStep) {
      try {
        const answer = await this.llm.answerInContext({
          message,
          sessionType: this.session.type,
          task: this.session.task,
          currentStep: this.session.currentStep,
          stepIndex: this.session.stepIndex,
          stepsCompleted: [...this.session.stepsCompleted],
          minutesLeft: status.minutesLeft,
          context: { ...this.session.context },
          recentExchanges: [...recentExchanges],
        });
        if (answer) {
          const response = `${header}\n${answer} Still on step ${this.session.stepIndex}: ${this.session.currentStep}. Say 'done'.`;
          this.pushExchange(message, answer);
          return response;
        }
      } catch {
        // Fall through to template
      }
    }

    this.pushExchange(message, fallback);
    return fallback;
  }

  private pushExchange(user: string, bot: string): void {
    if (!this.session) return;
    const exchanges = (this.session.context.recentExchanges as Array<{ user: string; bot: string }>) ?? [];
    exchanges.push({ user, bot });
    // Keep only last 5 exchanges
    if (exchanges.length > 5) exchanges.splice(0, exchanges.length - 5);
    this.session.context.recentExchanges = exchanges;
  }

  private pause(now: Date): string {
    if (!this.session) return '';
    this.session.state = SessionState.PAUSED;
    this.session.pausedAt = now;
    return `${formatBrandedHeader('⏸', 'Session paused')}\nSay "resume" to continue or "stop" to end.`;
  }

  private resume(now: Date): string {
    if (!this.session || !this.session.pausedAt) return '';
    const pauseDuration = now.getTime() - this.session.pausedAt.getTime();
    this.session.endTime = new Date(this.session.endTime.getTime() + pauseDuration);
    this.session.state = SessionState.RUNNING;
    this.session.pausedAt = null;
    this.session.lastInteractionAt = now;

    const status = externalizeTime(now, this.session.endTime);
    const header = this.getBrandedHeader(status);
    const step = this.session.currentStep ?? '';
    return `${header}\nResumed. Step ${this.session.stepIndex}: ${step}. Say 'done'.`;
  }

  private end(reason: 'completed' | 'stopped' | 'timed_out' = 'stopped'): string {
    const endingSession = this.session;
    if (!endingSession) return '';
    endingSession.state = SessionState.ENDING;

    const completed = [...endingSession.stepsCompleted];
    if (endingSession.currentStep && !completed.includes(endingSession.currentStep)) {
      // Current step wasn't completed
    }

    const remaining = this.getRemainingSteps();
    let suggestedTimebox: number | undefined;
    if (remaining.length > 0) {
      const [min, max] = estimateRemaining(remaining.length);
      suggestedTimebox = Math.ceil((min + max) / 2 / 5) * 5;
    }

    const endIcon = reason === 'completed' ? '✅' : '⏸';
    const endLabel = reason === 'completed' ? 'Session complete' : 'Session ended';
    let msg = `${formatBrandedHeader(endIcon, endLabel)}\n${formatWrapMessage(completed, remaining, suggestedTimebox)}`;

    // Save session record (fire-and-forget)
    if (this.memory) {
      const now = new Date();
      const durationMinutes = Math.round(
        (now.getTime() - endingSession.startTime.getTime()) / 60000,
      );
      const outcome: SessionRecord['outcome'] = reason;
      const record: SessionRecord = {
        id: `${endingSession.startTime.getTime()}-${endingSession.type}`,
        type: endingSession.type,
        task: endingSession.task,
        startedAt: endingSession.startTime,
        endedAt: now,
        durationMinutes,
        stepsCompleted: completed,
        stepsRemaining: remaining,
        outcome,
      };
      this.memory.save(record).catch(() => {});
    }

    // Pop the top session
    this.sessionStack.pop();

    // If there's an underlying paused session, hint about it
    const underlying = this.session;
    if (underlying && underlying.state === SessionState.PAUSED) {
      msg += ` "${underlying.task}" is paused — say "resume" to continue.`;
    }

    return msg;
  }

  private getNextPrepStep(whatIsLeft: string, stepNumber: number): string | null {
    const lower = whatIsLeft.toLowerCase();

    if (lower.includes('final pass') || lower.includes('final review')) {
      const steps = [
        'read top-to-bottom once; mark only unclear sentences',
        'fix each marked sentence — one at a time',
        'read the conclusion and confirm it matches the opening',
        'check formatting and numbers',
        'one final skim — then submit',
      ];
      return stepNumber <= steps.length ? steps[stepNumber - 1] : null;
    }

    if (lower.includes('draft')) {
      const steps = [
        'write the opening paragraph — state the main point',
        'write the next section — supporting argument or evidence',
        'write the closing — summarise and state next steps',
        'quick read-through for flow',
      ];
      return stepNumber <= steps.length ? steps[stepNumber - 1] : null;
    }

    if (lower.includes('outline')) {
      const steps = [
        'write the 3 main points as bullet headers',
        'add 1-2 sub-bullets under each header',
        'order the bullets — strongest argument first',
        'review the outline and flag any gaps',
      ];
      return stepNumber <= steps.length ? steps[stepNumber - 1] : null;
    }

    // Generic prep steps
    const steps = [
      'identify the single most important thing to finish',
      'work on that one thing — nothing else',
      'review what you just did',
      'identify the next most important thing',
      'work on that — stay focused',
    ];
    return stepNumber <= steps.length ? steps[stepNumber - 1] : null;
  }

  private getNextPlanStep(stepNumber: number): string | null {
    const steps = [
      'confirm base area + daily pace (chill/medium/packed)',
      'pick day 1 activities — morning and afternoon',
      'pick day 2 activities — morning and afternoon',
      'book or confirm accommodation',
      'plan transport between locations',
      'list any reservations needed and book them',
      'final review — anything missing?',
    ];
    return stepNumber <= steps.length ? steps[stepNumber - 1] : null;
  }

  private getRemainingSteps(): string[] {
    if (!this.session) return [];

    switch (this.session.type) {
      case SessionType.PACK: {
        const catIdx = this.session.context.categoryIndex as number;
        const categories = this.getActiveCategories();
        return categories.slice(catIdx + 1).map(c => `pack ${c}`);
      }
      case SessionType.PRIORITISE: {
        const ranked = this.session.context.ranked as string[];
        return ranked.slice(this.session.stepIndex);
      }
      case SessionType.COOK: {
        const cookSteps = this.session.context.cookSteps as string[] | undefined;
        if (cookSteps) {
          return cookSteps.slice(this.session.stepIndex);
        }
        return [];
      }
      default:
        return [];
    }
  }

  // --- Backlog KB command handling ---

  private async handleBacklogCommand(cmd: ParsedBacklogCommand): Promise<string> {
    if (!this.backlog) return '';

    switch (cmd.action) {
      case 'list': {
        const items = await this.backlog.list(cmd.category);
        return this.backlog.formatList(items, cmd.category);
      }

      case 'search': {
        if (!cmd.text) return 'What do you want to search for?';
        const items = await this.backlog.search(cmd.text);
        return this.backlog.formatSearchResults(items, cmd.text);
      }

      case 'add': {
        if (!cmd.text) return 'What do you want to add to the backlog?';
        let category = cmd.category;
        if (!category && this.llm) {
          const llmCat = await this.llm.categoriseItem?.({ text: cmd.text });
          if (llmCat && llmCat !== 'other') category = llmCat;
        }
        category ??= guessCategoryFromKeywords(cmd.text);
        if (category === 'other') category = 'uncategorized';
        const item = await this.backlog.add(cmd.text, category);
        const emoji = BACKLOG_CATEGORY_EMOJI[category] ?? '📌';
        return `${emoji} Added to backlog (${category}): "${item.text}"`;
      }

      case 'promote': {
        if (!cmd.text) return 'Which backlog item do you want to promote?';
        const item = await this.backlog.markPromoted(cmd.text);
        if (!item) return `Couldn't find "${cmd.text}" in the backlog.`;
        // Also add to hot list if tasklist is available
        if (this.tasklist) {
          const cat = (item.category in CATEGORY_EMOJI ? item.category : 'other') as ItemCategory;
          await this.tasklist.add(item.text, cat, 'hot');
        }
        return `⬆️ Promoted from backlog to hot list: "${item.text}"`;
      }

      case 'demote': {
        if (!cmd.text) return 'Which hot list item do you want to demote?';
        // Remove from hot list
        let removed = false;
        if (this.tasklist) {
          const item = await this.tasklist.remove(cmd.text);
          if (item) removed = true;
        }
        // Mark active in backlog
        const backlogItem = await this.backlog.markActive(cmd.text);
        if (!removed && !backlogItem) return `Couldn't find "${cmd.text}".`;
        return `⬇️ Demoted back to backlog: "${cmd.text}"`;
      }

      case 'archive': {
        if (!cmd.text) return 'Which backlog item do you want to archive?';
        const item = await this.backlog.archive(cmd.text);
        if (!item) return `Couldn't find "${cmd.text}" in the backlog.`;
        return `📦 Archived: "${item.text}"`;
      }

      case 'stats': {
        const s = await this.backlog.stats();
        return this.backlog.formatStats(s);
      }

      case 'purge': {
        const result = await this.backlog.purge(cmd.category);
        if (result.removed === 0) return 'Nothing to purge — all items are active.';
        const catStr = result.categories.join(', ');
        return `🗑 Purged ${result.removed} promoted/archived item${result.removed === 1 ? '' : 's'} from: ${catStr}`;
      }

      case 'retriage': {
        const result = await this.backlog.retriage();
        if (result.moved === 0) return 'No uncategorized items to retriage.';
        const moves = Object.entries(result.destinations)
          .map(([cat, n]) => `${cat} (${n})`)
          .join(', ');
        return `🏷 Retriaged ${result.moved} item${result.moved === 1 ? '' : 's'}: ${moves}`;
      }
    }
  }

  // --- Task List command handling ---

  private async handleListCommand(cmd: ParsedListCommand, now: Date): Promise<string> {
    if (!this.tasklist) return '';

    switch (cmd.action) {
      case 'view': {
        const items = await this.tasklist.getHotList();
        return this.tasklist.formatHotList(items);
      }

      case 'add': {
        if (!cmd.text) return 'What do you want to add?';
        let category = cmd.category;
        if (!category && this.llm) {
          category = await this.llm.categoriseItem?.({ text: cmd.text }) ?? undefined;
        }
        category ??= guessCategoryFromKeywords(cmd.text);
        const status = cmd.status ?? 'backlog';
        const item = await this.tasklist.add(cmd.text, category, status);
        return this.tasklist.formatAdded(item);
      }

      case 'done': {
        if (!cmd.text) return 'Which item did you finish?';
        const item = await this.tasklist.markDone(cmd.text);
        if (!item) return `Couldn't find "${cmd.text}" on the hot list.`;
        // Auto-archive matching backlog item if it was promoted
        if (this.backlog) {
          this.backlog.archive(item.text).catch(() => {});
        }
        return this.tasklist.formatDone(item);
      }

      case 'remove': {
        if (!cmd.text) return 'Which item do you want to remove?';
        const item = await this.tasklist.remove(cmd.text);
        if (!item) return `Couldn't find "${cmd.text}".`;
        return `Removed: "${item.text}"`;
      }

      case 'promote': {
        if (!cmd.text) return 'Which item do you want to promote?';
        const item = await this.tasklist.promote(cmd.text);
        if (!item) return `Couldn't find "${cmd.text}" in the backlog.`;
        return this.tasklist.formatPromoted(item);
      }

      case 'backlog': {
        const items = await this.tasklist.getBacklog(cmd.category);
        return this.tasklist.formatBacklog(items, cmd.category);
      }

      case 'archive': {
        const items = await this.tasklist.getArchive(cmd.category);
        return this.tasklist.formatArchive(items, cmd.category);
      }

      case 'knock-out': {
        return this.startKnockOut(cmd.count ?? 3, cmd.timeboxMinutes ?? 20, now);
      }

      case 'recommend': {
        return this.recommendItems();
      }
    }
  }

  private async startKnockOut(count: number, timeboxMinutes: number, now: Date): Promise<string> {
    if (!this.tasklist) return '';
    const hotItems = await this.tasklist.getHotList();
    if (hotItems.length === 0) {
      return 'Hot list is empty — add items first.';
    }

    const selected = hotItems.slice(0, Math.min(count, hotItems.length));
    const itemTexts = selected.map(i => i.text);
    const itemIds = selected.map(i => i.id);

    const endTime = new Date(now.getTime() + timeboxMinutes * 60000);

    this.session = {
      type: SessionType.PRIORITISE,
      state: SessionState.RUNNING,
      task: `knock out ${selected.length} items`,
      startTime: now,
      endTime,
      timeboxMinutes,
      stepsCompleted: [],
      currentStep: null,
      stepIndex: 0,
      nudgeEnabled: true,
      lastInteractionAt: now,
      pausedAt: null,
      elapsedBeforePause: 0,
      context: {
        items: itemTexts,
        ranked: itemTexts,
        bestNext: itemTexts[0],
        hotListItemIds: itemIds,
      },
    };

    const step = `start on: ${itemTexts[0]}`;
    this.session.currentStep = step;
    this.session.stepIndex = 1;

    const status = externalizeTime(now, endTime);
    const header = this.getBrandedHeader(status);
    return `${header}\n${selected.length} items from hot list, ${timeboxMinutes}m. Step 1: ${step}. Say 'done'.`;
  }

  private async recommendItems(): Promise<string> {
    if (!this.tasklist) return '';
    const backlog = await this.tasklist.getBacklog();
    if (backlog.length === 0) {
      return 'Backlog is empty — nothing to recommend.';
    }

    // Sort oldest first, take 3
    const sorted = [...backlog].sort((a, b) => a.addedAt.getTime() - b.addedAt.getTime());
    const picks = sorted.slice(0, 3);

    const lines = ['Here are 3 from your backlog to consider promoting:'];
    for (const item of picks) {
      const emoji = CATEGORY_EMOJI[item.category];
      const label = item.category.charAt(0).toUpperCase() + item.category.slice(1);
      lines.push(`  • ${item.text} (${emoji} ${label})`);
    }
    lines.push('Say "promote X" to add to hot list.');
    return lines.join('\n');
  }
}

