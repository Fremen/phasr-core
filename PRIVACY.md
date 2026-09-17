# Privacy

Phasr is designed to work locally and to minimise the amount of personal data
needed to help with a task.

## Defaults

- The TypeScript engine has no telemetry.
- The browser demo has no account, analytics, cookies or network calls.
- The MCP server uses in-memory storage unless `PHASR_DATA_DIR` is set.
- The deterministic engine does not require an API key or model.

## Optional model use

`createLLMClient()` is an optional adapter. When it is configured, task text
needed for the requested operation is sent to the selected model provider.
Review that provider's terms and avoid entering information you do not want to
send. The browser demo does not use this adapter.

## Local files

When `PHASR_DATA_DIR` is set, session history and task data are written beneath
that directory. The user controls that directory and can inspect, back up or
delete it. Do not point it at a folder that is automatically published.

## Contributing safely

Issues, fixtures and pull requests are public. Use invented tasks and synthetic
session transcripts. Remove names, addresses, health details, employer data,
credentials and filesystem paths before sharing a report.

Please report security issues privately as described in [SECURITY.md](SECURITY.md).
