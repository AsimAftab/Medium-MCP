# VS Code configuration

VS Code (with GitHub Copilot / MCP support) reads MCP servers from `.vscode/mcp.json`
in your workspace, or from user settings.

`.vscode/mcp.json`:

```json
{
  "servers": {
    "medium": {
      "type": "stdio",
      "command": "node",
      "args": ["${workspaceFolder}/dist/index.js"]
    }
  }
}
```

No credentials are needed in the config — authentication is the one-time `medium_login`
tool. Make sure you ran `bun run install:browser` once so Playwright's Chromium is
available.

Open the Command Palette → **MCP: List Servers** to confirm `medium` is running, run the
`medium_login` tool once and sign in when the browser opens, then use it from the Copilot
Chat agent: *"Publish my draft as unlisted."*
