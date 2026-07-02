/**
 * MCP resources: read-only views the client can browse and attach as context —
 * current drafts, published articles, templates, style guides, saved prompts
 * and writing history.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Container } from './container.js';

const STYLE_GUIDE = `# Medium Writing Style Guide

- Open with a hook in the first two sentences; earn the scroll.
- One idea per paragraph; keep paragraphs to 1–3 sentences.
- Use H2 for sections, H3 for sub-points; never skip levels.
- Prefer concrete examples and numbers over abstraction.
- Fenced code blocks must include a language hint.
- Aim for a Flesch reading-ease of 55–70 for technical posts.
- Close with a single, specific call to action.
- 5 tags maximum; use the most specific relevant tags.
`;

const SAVED_PROMPTS = [
  'Write a 2500-word technical tutorial about {topic}.',
  'Rewrite this article to sound more professional.',
  'Improve SEO and add a meta description.',
  'Generate 5 click-worthy titles and 5 tags.',
  'Summarize this into a TL;DR and a social post.',
];

/** Register all resources on the server. */
export function registerResources(server: McpServer, ctx: Container): void {
  server.registerResource(
    'drafts',
    'medium://drafts',
    { title: 'Current Drafts', description: 'All locally-stored drafts.', mimeType: 'application/json' },
    async (uri) => {
      const drafts = await ctx.store.list({ isDraft: true });
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(
              drafts.map((d) => ({ id: d.id, title: d.title, words: d.seo.wordCount })),
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  server.registerResource(
    'published',
    'medium://published',
    { title: 'Published Articles', description: 'Locally-tracked published articles.', mimeType: 'application/json' },
    async (uri) => {
      const items = await ctx.store.list({ isDraft: false });
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(
              items.map((a) => ({ id: a.id, title: a.title, url: a.url, status: a.publishStatus })),
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  server.registerResource(
    'templates',
    'medium://templates',
    { title: 'Article Templates', description: 'Built-in article templates.', mimeType: 'application/json' },
    (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(ctx.templates.listTemplates(), null, 2),
        },
      ],
    }),
  );

  server.registerResource(
    'style-guide',
    'medium://style-guide',
    { title: 'Style Guide', description: 'Medium writing style guide.', mimeType: 'text/markdown' },
    (uri) => ({
      contents: [{ uri: uri.href, mimeType: 'text/markdown', text: STYLE_GUIDE }],
    }),
  );

  server.registerResource(
    'saved-prompts',
    'medium://saved-prompts',
    { title: 'Saved Prompts', description: 'Reusable natural-language prompts.', mimeType: 'application/json' },
    (uri) => ({
      contents: [
        { uri: uri.href, mimeType: 'application/json', text: JSON.stringify(SAVED_PROMPTS, null, 2) },
      ],
    }),
  );

  server.registerResource(
    'history',
    'medium://history',
    { title: 'Writing History', description: 'Recent article activity (by update time).', mimeType: 'application/json' },
    async (uri) => {
      const items = await ctx.store.list();
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(
              items.slice(0, 25).map((a) => ({ id: a.id, title: a.title, updatedAt: a.updatedAt })),
              null,
              2,
            ),
          },
        ],
      };
    },
  );
}
