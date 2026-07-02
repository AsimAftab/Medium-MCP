# medium-mcp

A production-grade **Model Context Protocol (MCP)** server that lets AI assistants —
Claude, Cursor, VS Code, Kiro, ChatGPT and any MCP-compatible client — **research,
generate, edit, optimize, schedule and publish Medium articles** from natural language.

> Write, improve, SEO-optimize, quality-check and publish long-form articles to Medium
> without leaving your assistant.

[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue.svg)](#)
[![MCP](https://img.shields.io/badge/MCP-1.x-purple.svg)](#)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

---

## Table of Contents

- [Features](#features)
- [How it works](#how-it-works)
- [Quick start](#quick-start)
- [Configuration](#configuration)
- [Client setup](#client-setup)
- [Tool reference](#tool-reference)
- [Prompts & resources](#prompts--resources)
- [Architecture](#architecture)
- [Development](#development)
- [Troubleshooting](#troubleshooting)
- [License](#license)

---

## Features

- **Writing** — generate complete articles from a topic; continue, rewrite (8 voices),
  summarize, expand, shorten and improve drafts.
- **Editing** — insert / replace / delete / move sections, rename headings, generate
  tables, code blocks, FAQs, outlines, CTAs and a table of contents.
- **SEO** — SEO title, meta description, slug, keyword extraction & density, reading
  time, heading analysis, readability, related topics, and a 0–100 article score.
- **AI writing assistant** — targeted commands (improve paragraph, rewrite for
  beginners, explain with analogies, humanize, stronger hook/conclusion, …).
- **Publishing** — publish to Medium as draft / public / unlisted with a pre-publish
  quality gate; bulk publish; import/export Markdown, HTML, JSON and plain text.
- **Draft & article management** — local store with search, duplicate, archive,
  version history, rollback and autosave recovery.
- **Scheduling** — local scheduling queue with a background poller (Medium has no
  native scheduling).
- **Research** *(optional)* — Tavily, Brave, Perplexity or Firecrawl integration with
  graceful fallback when no provider is configured.
- **Images** — text-to-image prompts tuned for DALL·E, Midjourney, Flux and Stable
  Diffusion (hero / thumbnail / banner / diagram).
- **Templates & personas** — 13 article templates and 8 writing voices, both
  extensible via a simple plugin API.
- **Production concerns** — strict TypeScript (no `any`), Zod-validated inputs, typed
  errors, retry with backoff, structured logging with request ids, and a full test
  suite (unit + integration + end-to-end).

## How it works

An MCP server does not embed its own LLM — **your assistant is the model**. So the
writing/generation tools return a precise, self-contained *writing brief* (instruction
+ constraints + scaffold) for the assistant to fulfill, and the result is persisted
with `save_draft` and shipped with `publish_article`.

Everything that can be computed deterministically — Markdown ⇄ HTML conversion,
section editing, SEO metrics, readability, quality checks, diffing and scheduling —
runs **in-process**, with no model round-trip. Publishing is performed by driving the
Medium web editor in a real browser (see below).

```
"Write a 2500-word tutorial about AI agents, improve SEO, and publish it."
        │
        ▼
create_article ──► (assistant writes) ──► save_draft ──► improve_article
        └──► analyze_seo ──► quality_check ──► publish_article ──► Medium
```

## 🔄 Why browser-based?

Medium **stopped issuing new API integration tokens in 2023** and closed its public API
to new integrations. There is no supported way to get a token anymore, so a
token-based server is dead-on-arrival for anyone onboarding today.

Instead, this server **publishes through the real Medium web editor** using a headless
browser (Playwright). You sign in **once** through a normal browser window — Google,
email link, and 2FA all work — and the session is saved to disk and reused headlessly
for every subsequent publish. No token, no API keys, nothing to expire on Medium's side
beyond your own login session.

## Quick start

This project uses [Bun](https://bun.sh) as its package manager and dev runtime.

```bash
# 1. Install & build
bun install
bun run build

# 2. Download the browser Playwright drives (one-time)
bun run install:browser

# 3. Run
bun start          # production (built)
bun run dev        # watch mode (tsx)
```

> Bun is the package manager, but the server runs on the **Node** runtime (via
> `tsx`/`node`) because Playwright — which drives the browser — is not compatible
> with the Bun runtime. `bun run <script>` still works for everything.

**Log in once** so the server has a Medium session. Either:

```bash
bun run login       # opens a browser; sign in; session is saved
bun run session     # verify the session is active
```

or, from your MCP client, run the **`medium_login`** tool (same effect). From then on
`publish_article` runs headless. Check status with `session_status` and clear the saved
session with `medium_logout`.

> **Session sharing:** the login is stored in `MEDIUM_SESSION_DIR`, which defaults to a
> path *relative* to the working directory. The CLI runs from the project folder, but
> your MCP client launches the server from elsewhere — so set `MEDIUM_SESSION_DIR` to an
> **absolute** path in both your `.env` and the client's `env` block so they share one
> session.

## Configuration

All configuration is via environment variables (see [`.env.example`](.env.example)).
Configuration can be reloaded at runtime with the `reload_config` tool — no restart
required.

| Variable | Default | Description |
| --- | --- | --- |
| `MEDIUM_SESSION_DIR` | `<MEDIUM_DATA_DIR>/browser-profile` | Where the persisted login session is stored. |
| `MEDIUM_HEADLESS` | `true` | Run the browser headless when publishing. `medium_login` always opens a visible window. |
| `MEDIUM_BROWSER_TIMEOUT` | `30000` | Per-action browser timeout (ms). |
| `MEDIUM_DEFAULT_PUBLICATION` | — | Default publication id. |
| `MEDIUM_DEFAULT_TAGS` | — | Comma-separated default tags. |
| `MEDIUM_DEFAULT_VISIBILITY` | `public` | `public` \| `unlisted` \| `private`. |
| `MEDIUM_WRITING_TONE` | `professional` | Default writing voice. |
| `MEDIUM_WRITING_LANGUAGE` | `en` | Default language. |
| `MEDIUM_DEFAULT_MODEL` | `claude-opus-4-8` | Advisory default model. |
| `MEDIUM_AUTOSAVE_INTERVAL` | `30000` | Autosave interval (ms). |
| `MEDIUM_DATA_DIR` | `.medium-mcp` | Local data directory. |
| `MEDIUM_RESEARCH_PROVIDER` | `none` | `tavily` \| `brave` \| `perplexity` \| `firecrawl` \| `none`. |
| `TAVILY_API_KEY` … | — | Provider API keys. |
| `MEDIUM_LOG_LEVEL` | `info` | `error` \| `warn` \| `info` \| `debug`. |
| `MEDIUM_VERBOSE` | `false` | Verbose debug logging. |

## Client setup

The server speaks MCP over **stdio**. Point your client at the built entrypoint
(`dist/index.js`) or run via `npx`. Detailed, copy-pasteable configs for each client
live in **[docs/](docs/)**:

- [Claude Desktop](docs/claude-desktop.md)
- [Cursor](docs/cursor.md)
- [VS Code](docs/vscode.md)
- [Kiro](docs/kiro.md)

Minimal Claude Desktop example (`claude_desktop_config.json`):

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

No credentials go in the config — authentication is the one-time `medium_login` tool.
Ensure you ran `bun run install:browser` so Playwright's Chromium is available.

## Tool reference

Full signatures are in **[docs/api-reference.md](docs/api-reference.md)**. Highlights:

| Domain | Tools |
| --- | --- |
| **Writing** | `create_article`, `continue_article`, `rewrite_article`, `summarize_article`, `expand_article`, `shorten_article`, `improve_article`, `fix_markdown`, `convert_html`, `convert_markdown` |
| **Editing** | `insert_section`, `replace_section`, `delete_section`, `move_section`, `rename_heading`, `list_sections`, `table_of_contents`, `generate_table`, `generate_code_block`, `generate_outline`, `expand_outline`, `generate_examples`, `generate_faq`, `generate_conclusion`, `generate_cta` |
| **SEO** | `analyze_seo`, `generate_slug`, `generate_meta_description`, `generate_keywords`, `keyword_density`, `reading_time`, `analyze_headings`, `score_article`, `suggest_related_topics` |
| **Assistant** | `ai_assistant`, `generate_title`, `generate_titles`, `generate_subtitle`, `generate_tags`, `generate_summary`, `reading_level`, `tone_consistency` |
| **Content** | `save_draft`, `list_drafts`, `list_articles`, `search_articles`, `get_article`, `get_draft`, `update_article`, `delete_article`, `delete_draft`, `duplicate_article`, `archive_article`, `list_versions`, `restore_version`, `autosave` |
| **Publishing** | `publish_article`, `quality_check`, `import_markdown`, `convert_import_html`, `export_article`, `bulk_import_markdown`, `bulk_publish` |
| **Session & Config** | `medium_login`, `session_status`, `medium_logout`, `current_user`, `list_publications`, `get_config`, `reload_config` |
| **Research** | `research_topic`, `collect_references`, `fact_check`, `find_statistics` |
| **Images** | `generate_image_prompt`, `set_featured_image` |
| **Scheduling** | `schedule_publish`, `list_scheduled`, `cancel_schedule`, `run_due_schedules` |
| **Misc** | `list_templates`, `get_template`, `list_personas`, `compare_articles`, `diff_versions`, `create_writing_plan`, `one_click_improve` |

## Prompts & resources

**Prompts** (reusable, appear as slash-commands in most clients): `write_technical_tutorial`,
`write_ai_blog`, `write_case_study`, `rewrite_professional`, `improve_seo`, `summarize`,
`generate_faq`, `generate_outline`, `publish_draft`.

**Resources** (browsable read-only context): `medium://drafts`, `medium://published`,
`medium://templates`, `medium://style-guide`, `medium://saved-prompts`, `medium://history`.

## Architecture

```
src/
  config/       Environment-driven config + live reload
  types/        Domain model (Article) + Medium data types
  schemas/      Reusable Zod input schemas
  utils/        Pure helpers: markdown, text, seo, sections, diff, errors, logger, retry
  services/     MediumService (Playwright browser automation), DraftStore,
                PublisherService, Scheduler, TemplateService, PromptBuilder,
                ResearchService, ImageService
  server/       DI container, tool registry, resources, server assembly
  tools/        Tool modules grouped by domain
  prompts/      Reusable MCP prompts
  index.ts      stdio entrypoint
```

Design principles: clean separation of transport / business logic, dependency
injection via a typed container, SOLID service boundaries, strict typing, Zod-validated
tool inputs, and a plugin-friendly template/persona registry. See
[docs/architecture.md](docs/architecture.md).

## Development

```bash
bun run dev        # watch-mode server (tsx, Node runtime)
bun run build      # compile to dist/ (tsc, emits types)
bun run typecheck  # tsc --noEmit
bun run lint       # eslint
bun run format     # prettier --write
bun run test       # vitest (unit + integration + e2e)
bun run test:coverage
```

> Use `bun run test` (not `bun test`) — the latter invokes Bun's own test
> runner instead of the project's Vitest suite.

## Troubleshooting

See [docs/troubleshooting.md](docs/troubleshooting.md). Common items:

- **`AUTH_ERROR` / not logged in** — no valid session. Run the `medium_login` tool and
  sign in when the browser window opens; check with `session_status`.
- **"Failed to launch browser"** — run `bun run install:browser` to download Chromium.
- **Nothing published** — publishing needs a logged-in session; without one, writing/SEO
  tools still work fully offline.
- **Publish seems stuck / editor changed** — Medium's editor markup can change and break
  a selector; the selectors live in one map in `src/services/medium-service.ts`. Set
  `MEDIUM_HEADLESS=false` to watch the automation and diagnose.
- **Client shows no tools** — ensure `args` points to the absolute path of
  `dist/index.js` and that you ran `bun run build`.

## License

MIT — see [LICENSE](LICENSE).
