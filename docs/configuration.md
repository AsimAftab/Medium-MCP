# Configuration

All configuration is read from environment variables (a `.env` file is auto-loaded).
The full list lives in [`.env.example`](../.env.example) and the README table.

## Runtime reload

Configuration can be changed **without restarting** the server using the
`reload_config` tool:

```jsonc
// reload_config
{ "overrides": { "MEDIUM_LOG_LEVEL": "debug", "MEDIUM_RESEARCH_PROVIDER": "tavily" } }
```

`reload_config` re-reads the environment, applies your overrides, and reconfigures the
live services (browser session directory/headless mode, research provider, log level).
Use `get_config` to inspect the current effective configuration — it reports
`sessionDir`, `headless` and `sessionActive` (whether a valid browser session exists).

## Browser publishing

Publishing drives the real Medium web editor with Playwright, so a few settings control
the browser rather than an API token:

| Setting | Default | Effect |
| --- | --- | --- |
| `MEDIUM_SESSION_DIR` | `<MEDIUM_DATA_DIR>/browser-profile` | Where the persisted login session is stored. |
| `MEDIUM_HEADLESS` | `true` | Run the browser headless when publishing. The `medium_login` tool always opens a visible window regardless. |
| `MEDIUM_BROWSER_TIMEOUT` | `30000` | Per-action browser timeout (ms). |

Authenticate once with the `medium_login` tool (a browser window opens; sign in
normally), then publishing runs headlessly. `session_status` reports whether the saved
session is still valid, and `medium_logout` clears it.

## Defaults that influence generation

| Setting | Effect |
| --- | --- |
| `MEDIUM_WRITING_TONE` | Default tone for `create_article` when none is given. |
| `MEDIUM_WRITING_LANGUAGE` | Language constraint injected into writing briefs. |
| `MEDIUM_DEFAULT_TAGS` | Applied to new drafts when no tags are supplied. |
| `MEDIUM_DEFAULT_PUBLICATION` | Default publication for publishing. |
| `MEDIUM_DEFAULT_VISIBILITY` | Default visibility for new drafts. |

## Research providers

Set `MEDIUM_RESEARCH_PROVIDER` to `tavily`, `brave`, `perplexity` or `firecrawl` and
provide the matching `*_API_KEY`. When set to `none` (default), research tools return a
brief instructing the assistant to use its own browsing/search — nothing breaks.

## Logging

Structured JSON logs are written to **stderr** (stdout is reserved for the MCP
protocol). Each tool call gets a `requestId` and a duration. Set `MEDIUM_LOG_LEVEL=debug`
or `MEDIUM_VERBOSE=true` for detailed traces.
