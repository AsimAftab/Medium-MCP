# Usage examples

These are natural-language prompts you can give your assistant once the server is
connected, and the tool flow each triggers.

### Write an article

> "Write an article about AI agents."

`create_article` → assistant writes → `save_draft`.

### Create a 2500-word technical tutorial

> "Create a 2500-word technical tutorial on building an MCP server."

`create_article` with `template="technical-tutorial"`, `targetWords=2500` → `save_draft`.

### Rewrite more professionally

> "Rewrite this article to sound more professional."

`rewrite_article` with `style="professional"`.

### Continue a draft

> "Continue writing this draft."

`continue_article`.

### Improve SEO

> "Improve the SEO of draft art_123."

`get_article` → `analyze_seo` → apply suggestions via `update_article`.

### Add headings / structure

> "Add section headings and a table of contents."

`generate_outline` / `insert_section` → `table_of_contents`.

### Generate tags & featured image

> "Generate tags and a hero image prompt for Midjourney."

`generate_tags` + `generate_image_prompt` (`model="midjourney"`, `kind="hero"`).

### Save as draft / publish immediately

> "Save as draft." → `save_draft`
> "Publish it now as public." → `quality_check` → `publish_article` (`publishStatus="public"`).

### Update / list / delete

> "List all my drafts." → `list_drafts`
> "Update the title of art_123." → `update_article`
> "Delete art_123." → `delete_article`

### Export / import Markdown

> "Export art_123 as Markdown." → `export_article` (`format="markdown"`)
> "Import this Markdown and publish it." → `import_markdown` → `publish_article`.

### Schedule

> "Schedule art_123 to publish tomorrow at 9am." → `schedule_publish`.

### Multi-step plan

> "Give me a full plan to research, write and publish a post about vector databases."

`create_writing_plan` returns a 9-step plan mapping each step to a concrete tool.

### One-click improvement

> "Improve everything about this draft."

`one_click_improve` (prose + SEO + structure) then `fix_markdown`.
