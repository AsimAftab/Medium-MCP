# Cursor configuration

Cursor reads MCP servers from `~/.cursor/mcp.json` (global) or `.cursor/mcp.json`
(per-project).

```json
{
  "mcpServers": {
    "medium": {
      "command": "node",
      "args": ["/absolute/path/to/medium-mcp/dist/index.js"]
    }
  }
}
```

No credentials are needed in the config — authentication is the one-time `medium_login`
tool. Make sure you ran `bun run install:browser` once so Playwright's Chromium is
available.

Then open **Cursor Settings → MCP** and confirm the `medium` server is connected
(green dot). The tools become available to the agent automatically. Run the
`medium_login` tool once and sign in when the browser opens, then try:
*"List my Medium drafts."*
