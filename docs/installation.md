# Installation

## Requirements

- Node.js **≥ 18.17**
- A normal Medium account. Publishing is done by driving the real Medium web editor in
  a browser — there is **no integration token** (Medium stopped issuing new ones in
  2023). You sign in once via the `medium_login` tool (see below).

## From source

```bash
git clone <your-fork-or-repo-url> medium-mcp
cd medium-mcp
bun install
bun run build

# Download the browser Playwright drives (one-time)
bun run install:browser
```

This project uses [Bun](https://bun.sh) as its package manager and dev runtime.
Note that `bun run test` (not `bun test`) runs the project's Vitest suite.

The built entrypoint is `dist/index.js`. `bun run install:browser` downloads
Playwright's Chromium and only needs to be run once per machine.

## As a dependency / global

```bash
bun install -g medium-mcp     # once published to npm
medium-mcp                    # runs the stdio server
```

Or without installing:

```bash
npx medium-mcp
```

## Verify

```bash
# Run the server; it will log a startup line to stderr.
node dist/index.js
```

Then, from an MCP client, run the `medium_login` tool once — a browser window opens and
you sign in to Medium normally (Google, email link and 2FA all work). The session is
saved to disk and reused headlessly for publishing. Check it any time with the
`session_status` tool, which reports whether a valid browser session exists.

## Data directory

Drafts, revisions and the scheduling queue are stored as JSON under `MEDIUM_DATA_DIR`
(default `.medium-mcp/` in the working directory). Back this folder up to preserve
local drafts and version history. It is safe to delete to reset local state.
