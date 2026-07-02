# Claude Desktop configuration

Edit your `claude_desktop_config.json`:

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "medium": {
      "command": "node",
      "args": ["C:\\path\\to\\medium-mcp\\dist\\index.js"],
      "env": {
        "MEDIUM_DEFAULT_VISIBILITY": "public",
        "MEDIUM_LOG_LEVEL": "info"
      }
    }
  }
}
```

Using `npx` instead of an absolute path (after publishing to npm):

```json
{
  "mcpServers": {
    "medium": {
      "command": "npx",
      "args": ["-y", "medium-mcp"]
    }
  }
}
```

No credentials go in the config — authentication is the one-time `medium_login` tool.
Make sure you ran `bun run install:browser` once so Playwright's Chromium is available.

Restart Claude Desktop. You should see the **medium** server and its tools in the
tools menu. Run the `medium_login` tool once and sign in when the browser opens, then
ask: *"Check my Medium session status."* to confirm you're authenticated.
