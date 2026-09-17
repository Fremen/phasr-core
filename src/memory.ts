import type { SessionType } from './types.js';

export interface SessionRecord {
  id: string;
  type: SessionType;
  task: string;
  startedAt: Date;
  endedAt: Date;
  durationMinutes: number;
  stepsCompleted: string[];
  stepsRemaining: string[];
  outcome: 'completed' | 'stopped' | 'timed_out';
}

export interface MemoryStore {
  save(record: SessionRecord): Promise<void>;
  getByType(type: SessionType): Promise<SessionRecord[]>;
  getByTask(task: string): Promise<SessionRecord[]>;
  getRecent(n: number): Promise<SessionRecord[]>;
}

export class InMemoryStore implements MemoryStore {
  private records: SessionRecord[] = [];

  async save(record: SessionRecord): Promise<void> {
    this.records.push(record);
  }

  async getByType(type: SessionType): Promise<SessionRecord[]> {
    return this.records.filter(r => r.type === type);
  }

  async getByTask(task: string): Promise<SessionRecord[]> {
    const lower = task.toLowerCase();
    return this.records.filter(r => r.task.toLowerCase().includes(lower));
  }

  async getRecent(n: number): Promise<SessionRecord[]> {
    return this.records.slice(-n);
  }
}

export class FileStore implements MemoryStore {
  private filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  private async readAll(): Promise<SessionRecord[]> {
    const fs = await import('node:fs/promises');
    try {
      const data = await fs.readFile(this.filePath, 'utf-8');
      const parsed = JSON.parse(data) as Array<Record<string, unknown>>;
      return parsed.map(r => ({
        ...r,
        startedAt: new Date(r.startedAt as string),
        endedAt: new Date(r.endedAt as string),
      })) as SessionRecord[];
    } catch {
      return [];
    }
  }

  private async writeAll(records: SessionRecord[]): Promise<void> {
    const fs = await import('node:fs/promises');
    await fs.writeFile(this.filePath, JSON.stringify(records, null, 2), 'utf-8');
  }

  async save(record: SessionRecord): Promise<void> {
    const records = await this.readAll();
    records.push(record);
    await this.writeAll(records);
  }

  async getByType(type: SessionType): Promise<SessionRecord[]> {
    const records = await this.readAll();
    return records.filter(r => r.type === type);
  }

  async getByTask(task: string): Promise<SessionRecord[]> {
    const records = await this.readAll();
    const lower = task.toLowerCase();
    return records.filter(r => r.task.toLowerCase().includes(lower));
  }

  async getRecent(n: number): Promise<SessionRecord[]> {
    const records = await this.readAll();
    return records.slice(-n);
  }
}

