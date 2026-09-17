# Architecture

Phasr separates predictable behaviour from optional intelligence and storage.
The design goal is that the core remains understandable, testable and useful
without a network connection.

## Modules

| Area | Files | Responsibility |
| --- | --- | --- |
| State machine | `session.ts`, `types.ts` | Session lifecycle, nested sessions, pause/resume and step progression |
| Pure behaviour | `primitives.ts`, `prompts.ts`, `voice.ts` | Trigger parsing, time calculations, drift and response formatting |
| Task data | `tasklist.ts`, `backlog.ts` | Optional hot-list and backlog operations |
| Storage | `memory.ts`, `backlog-store.ts` | In-memory and explicitly configured local-file adapters |
| AI adapter | `llm.ts` | Optional model-assisted compression, ranking and replies |
| Interfaces | `cli.ts`, `mcp.ts` | Terminal and Model Context Protocol entry points |
| Demonstration | `demo/` | Standalone, zero-account browser experience |

## Core invariants

1. A session always has an explicit type and lifecycle state.
2. The user sees one actionable step or one decision at a time.
3. Time calculation is deterministic and never requires an LLM.
4. Pausing preserves context; resuming does not silently skip work.
5. Starting a new session while one is active preserves the previous session.
6. Storage and network access occur only through explicit adapters.
7. Tests use synthetic scenarios, never real user transcripts.

## Data flow

`SessionEngine.handle()` parses an input, applies a state transition, optionally
calls an injected LLM client, optionally records through an injected store, and
returns display text. `getSnapshot()` provides structured state for another UI.

The browser demo is deliberately self-contained. It demonstrates the
interaction model without credentials or a backend; it does not yet expose
every engine mode or storage adapter.

## Extension points

- Implement `LLMClient` to use a different model or a local model.
- Implement `MemoryStore`, `TaskListStore` or `BacklogStore` for a different
  local database.
- Use the MCP adapter to expose sessions to an agent host.
- Build a UI around snapshots rather than parsing display text.
