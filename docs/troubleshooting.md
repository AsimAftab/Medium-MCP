# Troubleshooting

### The client shows no tools

- Make sure you ran `bun run build` and the `args` path points at the **absolute**
  path of `dist/index.js`.
- Check the client's MCP logs for a spawn error (wrong `command`/Node not on PATH).
- Run `node dist/index.js` manually — it should print a JSON startup line to stderr
  and wait. If it exits immediately, read the error.

### `AUTH_ERROR` / "No valid session"

- There is no logged-in browser session. Run the `medium_login` tool and sign in when
  the browser window opens (Google, email link and 2FA all work).
- Check with the `session_status` tool — it reports whether a valid session exists.
- Clear a stale session with `medium_logout`, then log in again.

### "Failed to launch browser"

- Playwright's Chromium isn't installed. Run `bun run install:browser` (a one-time
  download) and try again.

### Publishing hangs or "selector not found" / editor changed

- Medium's web editor markup can change and break a selector used to drive it. The
  selectors are centralized in one map in `src/services/medium-service.ts`; update them
  there if Medium's DOM has shifted.
- Set `MEDIUM_HEADLESS=false` to watch the automation in a visible browser window and
  see exactly where it stalls.

### Publishing fails the quality gate

`publish_article` runs `quality_check` first. Fix the reported issues, or pass
`force: true` to override. Run `quality_check` directly to see the full report.

### `RATE_LIMIT` errors

Medium may throttle rapid activity from the web editor. Transient failures are retried
with exponential backoff automatically; if you still hit limits, slow down bulk
operations or retry later.

### Research tool returns a "brief" instead of results

That means no research provider is configured (`MEDIUM_RESEARCH_PROVIDER=none`). Set a
provider and its API key, then `reload_config`. Otherwise the assistant is expected to
perform the research itself using the returned brief.

### Scheduled posts didn't publish

The scheduler only runs while the server process is alive. If the process was stopped
at the scheduled time, run `run_due_schedules` to process any overdue entries, or keep
the server running.

### Local drafts disappeared

Drafts live in `MEDIUM_DATA_DIR` (default `.medium-mcp/`). If you changed the working
directory or the variable, point it back at the original folder.

### Enabling debug logs

Set `MEDIUM_LOG_LEVEL=debug` (or `MEDIUM_VERBOSE=true`) in the server env, or call
`reload_config` with `{ "overrides": { "MEDIUM_LOG_LEVEL": "debug" } }`. Logs go to
stderr as JSON lines with a `requestId` per tool call.

### Tables look like code blocks on Medium

That is by design. Medium's editor has no native table support — pasted `<table>`
markup is silently stripped, losing the content. On publish, medium-mcp re-renders
every Markdown table as a fixed-width Unicode box table inside a code block so the
data survives intact and stays readable. Your local draft keeps the original GFM
Markdown table; only the published copy is transformed.
