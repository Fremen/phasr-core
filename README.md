# Phasr

**Turn “I know what I need to do” into one manageable next step.**

Phasr is a local-first, open-source executive-function companion. It is designed
with neurodivergent people in mind, especially the moments when planning,
starting, sequencing, or returning to a task feels harder than the task itself.

[Try the browser demo](https://fremen.github.io/phasr-core/)

## Why I built it

Most task tools are good at storing work. They are less helpful at the point of
execution: choosing a starting point, reducing a step until it feels possible,
keeping time visible, recovering after an interruption, and stopping without
turning the day into a failure.

Phasr explores a different interaction model:

- one decision or physical action at a time;
- visible timeboxes without alarmist language;
- explicit pause, resume, drift and return paths;
- useful defaults with no account or cloud service required;
- optional AI assistance behind a deterministic session engine.

This public repository contains the reusable engine, command-line interface,
MCP adapter, synthetic behavioural tests, and a browser demonstration. It does
not contain personal sessions, private task data, or deployment configuration.

## Try it

The browser demo offers two planners. Its deterministic planner runs entirely
on-device without an account. Its optional AI planner uses Puter.js without an
app API key, sends the task and selected mode to Puter, and may ask the user to
sign in. Puter's own usage terms apply. If the AI service fails, Phasr falls
back to the on-device planner.

For the TypeScript engine:

~~~bash
npm install
npm test
npm run build
npm run cli -- "Prep: write the project update (20m)"
~~~

Example:

~~~ts
import { SessionEngine } from '@fremen/phasr';

const phasr = new SessionEngine();
console.log(await phasr.handle('Prep: write the project update (20m)'));
console.log(await phasr.handle('done'));
console.log(phasr.getSnapshot());
~~~

## Session modes

| Mode | Helps with |
| --- | --- |
| Prep | Turning a task into small physical actions |
| Prioritise | Choosing one next item from competing demands |
| Plan | Making one decision at a time while gathering constraints |
| Pack | Walking through categories without holding the list in memory |
| Cook | Coordinating components across time and space |

Sessions can be paused and resumed, nested when something urgent interrupts,
and continued without losing the previous context. The task list and backlog
modules are optional; the session engine also works on its own.

## Architecture

Phasr keeps the core state machine deterministic. Parsing, time calculation,
step progression, pause/resume and storage contracts can be tested without a
model or network connection. An LLM can improve step compression, ranking and
free-form replies, but it is an explicit adapter rather than a requirement.

~~~text
input → deterministic parser → session state machine → response
                            ↘ optional LLM adapter
                            ↘ optional local stores
~~~

The MCP server defaults to in-memory storage. Set `PHASR_DATA_DIR` to opt into
local file storage:

~~~bash
PHASR_DATA_DIR=./my-phasr-data npm run mcp
~~~

See [ARCHITECTURE.md](ARCHITECTURE.md) for the module boundaries and
[PRIVACY.md](PRIVACY.md) for the data model.

## Project status

Phasr is an early public project and a working research prototype. The engine
has broad unit and behavioural coverage. The browser demo is intentionally
smaller than the TypeScript engine. Language, interaction defaults and
accessibility need continued testing with neurodivergent users.

Phasr is a planning tool, not medical software, diagnosis, treatment, crisis
support, or a substitute for professional care.

## Contributing

People with lived experience of task initiation, time blindness, interruption,
overwhelm, ADHD, autism and other executive-function differences are especially
welcome. You can contribute code, interaction feedback, clearer language, test
scenarios or accessibility findings.

Read [CONTRIBUTING.md](CONTRIBUTING.md) and [PRIVACY.md](PRIVACY.md) before
opening an issue or pull request. Never submit real session transcripts or
another person's task data.

## License

[MIT](LICENSE)
