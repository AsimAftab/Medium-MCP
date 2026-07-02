# Architecture

## Layers

```
transport (MCP stdio)                      src/index.ts
        │
server assembly + DI container             src/server/{server,container}.ts
        │
tool registry (validation, logging,        src/server/tool-registry.ts
   timing, typed-error translation)
        │
tools (thin, per-domain)                   src/tools/*.ts
        │
services (business logic)                  src/services/*.ts
        │
utils (pure functions) + types + config    src/{utils,types,config}/*.ts
```

The transport layer knows nothing about Medium; the services know nothing about MCP.
Tools are the only glue and stay thin — they validate inputs (Zod), call a service or a
pure util, and shape the response.

## Dependency injection

`createContainer()` constructs every service once and exposes them through a typed
`Container`. Tools receive the container as their second argument. `container.reload()`
re-reads configuration and reconfigures live singletons (Medium browser service,
research provider, log level) in place — enabling `reload_config` without a restart.

## Services

| Service | Responsibility |
| --- | --- |
| `MediumService` | Playwright browser automation of the real Medium web editor. Public surface: `login`, `logout`, `validateSession`, `currentUser`, `listPublications`, `createPost`, `hasSession`, `close`. Persists a login session to disk and reuses it headlessly; selectors for the editor DOM are centralized here. |
| `DraftStore` | Local JSON persistence: articles, revisions, scheduling queue; atomic writes, serialized under a write-lock. Provides the CRUD Medium itself doesn't expose. |
| `PublisherService` | Pre-publish quality gate → publish via `MediumService` (browser) → mirror result locally. |
| `Scheduler` | Background poller that publishes due queue entries. |
| `PromptBuilder` | Composes writing *briefs* for the host model (generation is not done in-process). |
| `TemplateService` | Article templates + writing personas; extensible via `registerTemplate` / `registerPersona`. |
| `ResearchService` | Optional Tavily/Brave/Perplexity/Firecrawl search with graceful fallback. |
| `ImageService` | Text-to-image prompt generation per target model. |

## Why generation returns a brief

An MCP server should not embed an LLM — the connected assistant *is* the model.
Generation/transformation tools therefore return a structured instruction
(`WritingInstruction`: instruction + constraints + scaffold + output contract) that the
assistant fulfills. This keeps the server deterministic, model-agnostic and dependency
-light, while everything mechanical (Markdown, SEO, sections, quality, scheduling,
browser-driven publishing) runs in-process.

## Error handling

All operational failures are subclasses of `AppError` with a stable `code`, HTTP-ish
`statusCode`, and a `retryable` flag. The tool registry catches everything, logs it
with the request id, and returns a structured MCP error (`isError: true` +
`structuredContent.error`). Transient, retryable errors are retried with exponential
backoff + jitter by `withRetry`.

## Extensibility (plugins)

- **Templates/personas:** `container.templates.registerTemplate(...)` /
  `registerPersona(...)`.
- **New tools:** add a `register*Tools(tool)` module and wire it in
  `src/tools/index.ts`.
- **New research providers:** extend `ResearchService.dispatch`.
- **New export formats / image models:** extend the respective service.

## Testing

- **Unit:** pure utils (text, markdown, sections, seo, diff) and services
  (`DraftStore`, `PromptBuilder`).
- **Integration:** `PublisherService` against a mocked `MediumService`.
- **End-to-end:** a real MCP `Client` connected to the server over an in-memory
  transport, exercising `listTools`/`listPrompts`/`listResources` and round-trip tool
  calls.
