#!/usr/bin/env node
// @ts-nocheck — MCP SDK types resolved at runtime via package.json exports wildcard
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { resolve } from 'node:path';
import { homedir } from 'node:os';
import { SessionEngine } from './session.js';
import { InMemoryStore, FileStore } from './memory.js';
import type { MemoryStore } from './memory.js';
import { TaskList, InMemoryTaskListStore, MarkdownTaskListStore } from './tasklist.js';
import { Backlog } from './backlog.js';
import { InMemoryBacklogStore, MarkdownBacklogStore } from './backlog-store.js';

const sessions = new Map<string, SessionEngine>();

const workspace = process.env.PHASR_DATA_DIR;
const memoryStore: MemoryStore = workspace
  ? new FileStore(resolve(workspace, 'memory', 'sessions.json'))
  : new InMemoryStore();
const tasklistStore = workspace
  ? new MarkdownTaskListStore(resolve(workspace, 'memory', 'todo.md'))
  : new InMemoryTaskListStore();
const tasklist = new TaskList(tasklistStore);
const backlogStore = workspace
  ? new MarkdownBacklogStore(resolve(workspace, 'kb'))
  : new InMemoryBacklogStore();
const backlog = new Backlog(backlogStore);

function getOrCreateEngine(sessionId: string): SessionEngine {
  let engine = sessions.get(sessionId);
  if (!engine) {
    engine = new SessionEngine({ memory: memoryStore, tasklist, backlog });
    sessions.set(sessionId, engine);
  }
  return engine;
}

const server = new McpServer({
  name: 'phasr',
  version: '0.2.0',
});

// --- Tools ---

server.tool(
  'phasr_start',
  'Start a Phasr session (Prep, Pack, Prioritise, or Plan)',
  {
    sessionId: z.string().describe('Unique session identifier'),
    type: z.enum(['Prep', 'Pack', 'Prioritise', 'Plan', 'Cook']).describe('Session type'),
    task: z.string().describe('What the session is about'),
    timeboxMinutes: z.number().optional().describe('Duration in minutes (default 25)'),
    leaveAt: z.string().optional().describe('Leave time e.g. "14:30"'),
  },
  async ({ sessionId, type, task, timeboxMinutes, leaveAt }) => {
    const engine = getOrCreateEngine(sessionId);
    const timePart = leaveAt
      ? `leave at ${leaveAt}`
      : timeboxMinutes
        ? `${timeboxMinutes}m`
        : '';
    const trigger = timePart ? `${type}: ${task} (${timePart})` : `${type}: ${task}`;
    const response = await engine.handle(trigger);
    return { content: [{ type: 'text', text: response }] };
  },
);

server.tool(
  'phasr_step',
  'Send a message to the active Phasr session (answer questions, say "done", etc.)',
  {
    sessionId: z.string().describe('Session identifier'),
    message: z.string().describe('User message'),
  },
  async ({ sessionId, message }) => {
    const engine = sessions.get(sessionId);
    if (!engine || !engine.isActive) {
      return { content: [{ type: 'text', text: 'No active session. Use phasr_start first.' }] };
    }
    // Check drift and time
    const drift = engine.checkDrift();
    const time = engine.checkTime();
    const alerts: string[] = [];
    if (drift) alerts.push(drift);
    if (time) alerts.push(time);

    const response = await engine.handle(message);
    const full = alerts.length > 0 ? `${alerts.join('\n')}\n${response}` : response;

    // Clean up if session ended
    if (!engine.isActive) {
      sessions.delete(sessionId);
    }

    return { content: [{ type: 'text', text: full }] };
  },
);

server.tool(
  'phasr_status',
  'Get the current session status as structured data',
  {
    sessionId: z.string().describe('Session identifier'),
  },
  async ({ sessionId }) => {
    const engine = sessions.get(sessionId);
    if (!engine) {
      return { content: [{ type: 'text', text: JSON.stringify(null) }] };
    }
    const snapshot = engine.getSnapshot();
    return { content: [{ type: 'text', text: JSON.stringify(snapshot, null, 2) }] };
  },
);

server.tool(
  'phasr_pause',
  'Pause the active Phasr session',
  {
    sessionId: z.string().describe('Session identifier'),
  },
  async ({ sessionId }) => {
    const engine = sessions.get(sessionId);
    if (!engine || !engine.isActive) {
      return { content: [{ type: 'text', text: 'No active session.' }] };
    }
    const response = await engine.handle('pause');
    return { content: [{ type: 'text', text: response }] };
  },
);

server.tool(
  'phasr_stop',
  'Stop the active Phasr session',
  {
    sessionId: z.string().describe('Session identifier'),
  },
  async ({ sessionId }) => {
    const engine = sessions.get(sessionId);
    if (!engine || !engine.isActive) {
      return { content: [{ type: 'text', text: 'No active session.' }] };
    }
    const response = await engine.handle('stop');
    if (!engine.isActive) {
      sessions.delete(sessionId);
    }
    return { content: [{ type: 'text', text: response }] };
  },
);

// --- Resources ---

server.resource(
  'current-session',
  'phasr://session/current',
  { description: 'Current session snapshot (JSON)' },
  async (uri) => {
    // Return the first active session found, or null
    let snapshot = null;
    for (const engine of sessions.values()) {
      if (engine.isActive) {
        snapshot = engine.getSnapshot();
        break;
      }
    }
    return {
      contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(snapshot, null, 2) }],
    };
  },
);

server.resource(
  'session-history',
  'phasr://session/history',
  { description: 'Recent session history (JSON)' },
  async (uri) => {
    const records = await memoryStore.getRecent(10);
    return {
      contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(records, null, 2) }],
    };
  },
);

// --- Task List Tools ---

server.tool(
  'phasr_hotlist',
  'View the hot list (items you\'re actively working on)',
  {},
  async () => {
    const items = await tasklist.getHotList();
    return { content: [{ type: 'text', text: tasklist.formatHotList(items) }] };
  },
);

server.tool(
  'phasr_backlog',
  'View the backlog (optional category filter)',
  {
    category: z.enum(['home', 'garden', 'work', 'tech', 'family', 'food', 'other']).optional().describe('Filter by category'),
  },
  async ({ category }) => {
    const items = await tasklist.getBacklog(category);
    return { content: [{ type: 'text', text: tasklist.formatBacklog(items, category) }] };
  },
);

server.tool(
  'phasr_add',
  'Add an item to backlog or hot list',
  {
    text: z.string().describe('The task text'),
    category: z.enum(['home', 'garden', 'work', 'tech', 'family', 'food', 'other']).optional().describe('Category'),
    toHotList: z.boolean().optional().describe('Add directly to hot list instead of backlog'),
  },
  async ({ text, category, toHotList }) => {
    const { guessCategoryFromKeywords } = await import('./tasklist-commands.js');
    const cat = category ?? guessCategoryFromKeywords(text);
    const status = toHotList ? 'hot' as const : 'backlog' as const;
    const item = await tasklist.add(text, cat, status);
    return { content: [{ type: 'text', text: tasklist.formatAdded(item) }] };
  },
);

server.tool(
  'phasr_promote',
  'Move a backlog item to the hot list',
  {
    text: z.string().describe('Item text or partial match'),
  },
  async ({ text }) => {
    const item = await tasklist.promote(text);
    if (!item) return { content: [{ type: 'text', text: `Couldn't find "${text}" in the backlog.` }] };
    return { content: [{ type: 'text', text: tasklist.formatPromoted(item) }] };
  },
);

server.tool(
  'phasr_done_item',
  'Mark a hot list item as done (moves to archive)',
  {
    text: z.string().describe('Item text or partial match'),
  },
  async ({ text }) => {
    const item = await tasklist.markDone(text);
    if (!item) return { content: [{ type: 'text', text: `Couldn't find "${text}" on the hot list.` }] };
    return { content: [{ type: 'text', text: tasklist.formatDone(item) }] };
  },
);

server.resource(
  'tasklist',
  'phasr://tasklist',
  { description: 'Full task list snapshot (JSON)' },
  async (uri) => {
    const items = await tasklist.getAllItems();
    return {
      contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(items, null, 2) }],
    };
  },
);

// --- Start ---

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error('Phasr MCP server failed to start:', err);
  process.exit(1);
});
