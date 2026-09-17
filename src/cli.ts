import * as readline from 'node:readline';
import { resolve } from 'node:path';
import { homedir } from 'node:os';
import { SessionEngine } from './session.js';
import { createLLMClient } from './llm.js';
import { TaskList, MarkdownTaskListStore } from './tasklist.js';
import { Backlog } from './backlog.js';
import { MarkdownBacklogStore } from './backlog-store.js';

function parseArgs(args: string[]): { simulate?: string; startTime?: Date } {
  const result: { simulate?: string; startTime?: Date } = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--simulate' && args[i + 1]) {
      result.simulate = args[++i];
    }
    if (args[i] === '--start-time' && args[i + 1]) {
      result.startTime = new Date(args[++i]);
    }
  }
  return result;
}

async function runSimulation(engine: SessionEngine, filePath: string, startTime?: Date) {
  const fs = await import('node:fs');
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').filter(l => l.trim().length > 0);

  let now = startTime ?? new Date();

  for (const line of lines) {
    // Lines starting with "User:" are user input
    // Lines starting with "# wait Xm" simulate time passing
    const waitMatch = line.match(/^#\s*wait\s+(\d+)m/i);
    if (waitMatch) {
      const minutes = parseInt(waitMatch[1], 10);
      now = new Date(now.getTime() + minutes * 60000);
      console.log(`  [${minutes}m pass]`);

      // Check drift and time after waiting
      const drift = engine.checkDrift(now);
      if (drift) console.log(`  << ${drift}`);
      const timeCheck = engine.checkTime(now);
      if (timeCheck) console.log(`  << ${timeCheck}`);
      continue;
    }

    const userMatch = line.match(/^User:\s*(.+)/i);
    if (userMatch) {
      const input = userMatch[1].trim();
      console.log(`> ${input}`);
      const response = await engine.handle(input, now);
      console.log(`  ${response}`);
      // Advance time slightly per interaction
      now = new Date(now.getTime() + 5000);
    }
  }
}

async function runInteractive(engine: SessionEngine, startTime?: Date) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '> ',
  });

  let now = startTime;
  let driftInterval: ReturnType<typeof setInterval> | null = null;

  const startDriftCheck = () => {
    if (driftInterval) return;
    driftInterval = setInterval(() => {
      const checkTime = now ?? new Date();
      const drift = engine.checkDrift(checkTime);
      if (drift) {
        console.log(`\n  ${drift}`);
        rl.prompt();
      }
      const timeCheck = engine.checkTime(checkTime);
      if (timeCheck) {
        console.log(`\n  ${timeCheck}`);
        rl.prompt();
      }
    }, 10000);
  };

  console.log('Phasr — Executive Function Prosthetic');
  console.log('Start a session: "Prep: task (30m)", "Pack: trip (25m)", etc.');
  console.log('Type "stop" to end a session, "no nudges" to disable nudges.\n');
  rl.prompt();

  rl.on('line', (input) => {
    const trimmed = input.trim();
    if (!trimmed) {
      rl.prompt();
      return;
    }

    if (trimmed.toLowerCase() === 'quit' || trimmed.toLowerCase() === 'exit') {
      rl.close();
      return;
    }

    (async () => {
      const response = await engine.handle(trimmed, now ?? undefined);
      console.log(`  ${response}`);

      if (engine.isActive) {
        startDriftCheck();
      } else if (driftInterval) {
        clearInterval(driftInterval);
        driftInterval = null;
      }

      rl.prompt();
    })();
  });

  rl.on('close', () => {
    if (driftInterval) clearInterval(driftInterval);
    process.exit(0);
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const llm = createLLMClient();
  const workspace = process.env.PHASR_DATA_DIR || resolve(homedir(), '.phasr');
  const tasklistStore = new MarkdownTaskListStore(resolve(workspace, 'memory', 'todo.md'));
  const tasklist = new TaskList(tasklistStore);
  const backlogStore = new MarkdownBacklogStore(resolve(workspace, 'kb'));
  const backlog = new Backlog(backlogStore);
  const engine = new SessionEngine({ llm, tasklist, backlog });

  if (args.simulate) {
    await runSimulation(engine, args.simulate, args.startTime);
  } else {
    await runInteractive(engine, args.startTime);
  }
}

main().catch(console.error);

