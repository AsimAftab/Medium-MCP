# API reference

Every tool validates its input with Zod and returns a text summary plus (usually) a
`structuredContent.data` payload. Generation tools return a *writing brief* for the
assistant; all others compute their result in-process.

Legend: `?` = optional.

## Writing

| Tool | Inputs | Returns |
| --- | --- | --- |
| `create_article` | `topic`, `outline?`, `keywords?`, `tone?`, `audience?`, `targetWords?`, `template?` | Writing brief + suggested tags |
| `continue_article` | `markdown`, `direction?` | Continuation brief |
| `rewrite_article` | `markdown`, `style` | Rewrite brief |
| `summarize_article` | `markdown`, `kind` (`tldr`\|`executive`\|`social`) | Summary brief |
| `expand_article` | `markdown`, `factor?` | Expansion brief |
| `shorten_article` | `markdown`, `targetWords?` | Shorten brief |
| `improve_article` | `markdown`, `focus?` | Improvement brief |
| `fix_markdown` | `markdown` | Repaired markdown + change list |
| `convert_html` | `html` | Markdown |
| `convert_markdown` | `markdown` | HTML |

## Editing

| Tool | Inputs |
| --- | --- |
| `list_sections` | `markdown` |
| `insert_section` | `markdown`, `heading`, `body?`, `level?`, `anchorHeading?`, `position?` |
| `replace_section` | `markdown`, `heading`, `newContent` |
| `delete_section` | `markdown`, `heading` |
| `move_section` | `markdown`, `heading`, `anchorHeading`, `position?` |
| `rename_heading` | `markdown`, `oldHeading`, `newHeading` |
| `table_of_contents` | `markdown` |
| `generate_table` | `headers`, `rows?`, `align?` |
| `generate_code_block` | `code`, `language?` |
| `generate_outline` | `markdown`, `topic?` |
| `expand_outline` | `markdown` |
| `generate_examples` | `markdown`, `count?` |
| `generate_faq` | `markdown`, `count?` |
| `generate_conclusion` | `markdown` |
| `generate_cta` | `markdown` |

## SEO

| Tool | Inputs | Returns |
| --- | --- | --- |
| `analyze_seo` | `title`, `markdown`, `keywords?` | Full SEO report |
| `generate_slug` | `title` | Slug |
| `generate_meta_description` | `markdown`, `maxLength?` | Meta description |
| `generate_keywords` | `markdown`, `limit?` | Keyword list |
| `keyword_density` | `markdown`, `keywords` | Density map |
| `reading_time` | `markdown` | Minutes |
| `analyze_headings` | `markdown` | Heading issues |
| `score_article` | `title`, `markdown` | 0–100 score + breakdown |
| `suggest_related_topics` | `markdown`, `count?` | Related-topics brief |

## AI assistant

| Tool | Inputs |
| --- | --- |
| `ai_assistant` | `text`, `command`, `customInstruction?` |
| `generate_title` | `markdown` |
| `generate_titles` | `markdown`, `count?` |
| `generate_subtitle` | `markdown`, `count?` |
| `generate_tags` | `markdown` |
| `generate_summary` | `markdown` |
| `reading_level` | `markdown` |
| `tone_consistency` | `markdown` |

`ai_assistant.command` ∈ `improve_paragraph`, `rewrite_for_beginners`,
`explain_with_analogies`, `make_more_technical`, `reduce_ai_sounding`,
`increase_engagement`, `improve_storytelling`, `improve_hook`, `stronger_conclusion`,
`humanize`.

## Content lifecycle

| Tool | Inputs |
| --- | --- |
| `save_draft` | `title`, `markdown`, `subtitle?`, `tags?`, `publication?`, `canonicalUrl?`, `featuredImageUrl?`, `license?`, `visibility?` |
| `list_drafts` | `query?`, `tag?` |
| `list_articles` | `status?`, `query?`, `tag?` |
| `search_articles` | `query` |
| `get_article` / `get_draft` | `id` |
| `update_article` | `id`, `title?`, `markdown?`, `subtitle?`, `tags?`, `publication?`, `canonicalUrl?`, `featuredImageUrl?`, `visibility?` |
| `delete_article` / `delete_draft` | `id` |
| `duplicate_article` | `id` |
| `archive_article` | `id` |
| `list_versions` | `id` |
| `restore_version` | `id`, `revisionId` |
| `autosave` | `id?`, `title`, `markdown` |

## Publishing & I/O

| Tool | Inputs |
| --- | --- |
| `publish_article` | `id?` **or** `title`+`markdown`; `subtitle?`, `tags?`, `publication?`, `publishStatus?`, `canonicalUrl?`, `license?`, `featuredImageUrl?`, `notifyFollowers?`, `force?` |
| `quality_check` | `title`, `markdown`, `minWords?` |
| `import_markdown` | `markdown`, `title?`, `tags?` |
| `convert_import_html` | `html`, `title?` |
| `export_article` | `id`, `format` (`markdown`\|`html`\|`json`\|`text`) |
| `bulk_import_markdown` | `documents[]` |
| `bulk_publish` | `ids[]`, `publishStatus?`, `force?` |

## Session, config & account

| Tool | Inputs | Returns |
| --- | --- | --- |
| `medium_login` | `timeoutSeconds?` (default `180`) | Opens a visible browser window to sign in; saves the session to disk |
| `session_status` | — | Whether a valid browser session exists |
| `medium_logout` | — | Clears the saved browser session |
| `current_user` | — | The signed-in Medium user |
| `list_publications` | — | Best-effort list (returns `[]` in browser mode; personal-profile publishing needs none) |
| `get_config` | — | Effective config incl. `sessionDir`, `headless`, `sessionActive` |
| `reload_config` | `overrides?` | Re-reads config and reconfigures live services |

## Research

| Tool | Inputs |
| --- | --- |
| `research_topic` | `query`, `maxResults?` |
| `collect_references` | `query`, `style?` (`apa`\|`mla`\|`chicago`\|`links`) |
| `fact_check` | `markdown` |
| `find_statistics` | `topic` |

## Images

| Tool | Inputs |
| --- | --- |
| `generate_image_prompt` | `subject`, `kind?` (`hero`\|`thumbnail`\|`banner`\|`diagram`), `model?` (`dalle`\|`midjourney`\|`flux`\|`stable-diffusion`), `mood?` |
| `set_featured_image` | `id`, `imageUrl` |

## Scheduling

| Tool | Inputs |
| --- | --- |
| `schedule_publish` | `id`, `scheduledFor` (ISO-8601), `publishStatus?`, `publication?` |
| `list_scheduled` | `includeCompleted?` |
| `cancel_schedule` | `scheduleId` |
| `run_due_schedules` | — |

## Misc / workflow

| Tool | Inputs |
| --- | --- |
| `list_templates` | — |
| `get_template` | `id` |
| `list_personas` | — |
| `compare_articles` | `left`, `right` |
| `diff_versions` | `id`, `revisionId` |
| `create_writing_plan` | `topic`, `targetWords?` |
| `one_click_improve` | `markdown`, `title?` |

## Error codes

`AUTH_ERROR`, `VALIDATION_ERROR`, `NOT_FOUND`, `RATE_LIMIT`, `MEDIUM_API_ERROR`,
`CONFIG_ERROR`, `CONFLICT`, `NETWORK_ERROR`, `INTERNAL_ERROR`. Errors are returned as
`{ isError: true, structuredContent: { error: { code, message, statusCode, retryable } } }`.
