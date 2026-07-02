# Kiro configuration

Kiro reads MCP servers from `.kiro/settings/mcp.json` (workspace) or the user-level
equivalent.

```json
{
  "mcpServers": {
    "medium": {
      "command": "node",
      "args": ["/absolute/path/to/medium-mcp/dist/index.js"],
      "disabled": false,
      "autoApprove": ["session_status", "list_drafts", "analyze_seo", "score_article"]
    }
  }
}
```

- No credentials go in the config — authentication is the one-time `medium_login` tool.
  Make sure you ran `bun run install:browser` once so Playwright's Chromium is available,
  then run `medium_login` and sign in when the browser opens.
- `autoApprove` lists tools Kiro may run without asking each time — keep it to
  read-only / analysis tools; leave `publish_article`, `delete_article`, `medium_login`
  and `medium_logout` off the list so they always prompt.
- Reconnect the server from Kiro's MCP panel after editing the config.
