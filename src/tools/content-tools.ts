/**
 * Draft & article lifecycle tools: save, list, get, update, delete, duplicate,
 * search, archive, clone, plus version history (list/restore) and autosave.
 */
import { z } from 'zod';
import type { Registrar } from '../server/tool-registry.js';
import {
  articleIdField,
  licenseSchema,
  markdownField,
  publishStatusSchema,
  tagsField,
  titleField,
  visibilitySchema,
} from '../schemas/common.js';
import { createArticleFromInput, enrichArticle } from '../utils/article-factory.js';
import type { Article } from '../types/index.js';

/** Compact article summary for list/get responses. */
function summarize(a: Article): Record<string, unknown> {
  return {
    id: a.id,
    title: a.title,
    subtitle: a.subtitle,
    status: a.publishStatus,
    isDraft: a.isDraft,
    tags: a.tags,
    words: a.seo.wordCount,
    readingTime: a.seo.readingTimeMinutes,
    url: a.url,
    updatedAt: a.updatedAt,
  };
}

export function registerContentTools(tool: Registrar): void {
  tool({
    name: 'save_draft',
    title: 'Save Draft',
    description:
      'Persist a new article/draft locally (with derived HTML, plain text and SEO). Returns the new article id for later publishing or editing.',
    inputSchema: {
      title: titleField,
      markdown: markdownField,
      subtitle: z.string().optional(),
      tags: tagsField,
      publication: z.string().optional(),
      canonicalUrl: z.string().url().optional(),
      featuredImageUrl: z.string().url().optional(),
      license: licenseSchema.optional(),
      visibility: visibilitySchema.optional(),
    },
    handler: async (args, ctx) => {
      const cfg = ctx.config.get();
      const article = createArticleFromInput(
        {
          title: String(args.title),
          markdown: String(args.markdown),
          subtitle: args.subtitle as string | undefined,
          tags: args.tags as string[] | undefined,
          publication: args.publication as string | undefined,
          canonicalUrl: args.canonicalUrl as string | undefined,
          featuredImageUrl: args.featuredImageUrl as string | undefined,
          license: args.license as Article['license'],
          visibility: args.visibility as Article['visibility'] | undefined,
          publishStatus: 'draft',
        },
        {
          visibility: cfg.defaults.visibility,
          tags: cfg.defaults.tags,
          publication: cfg.defaults.publication,
        },
      );
      await ctx.store.create(article);
      return {
        text: `Saved draft "${article.title}" (id: ${article.id}, ${article.seo.wordCount} words).`,
        data: summarize(article),
      };
    },
  });

  tool({
    name: 'list_drafts',
    title: 'List Drafts',
    description: 'List all locally-stored drafts (unpublished articles).',
    inputSchema: { query: z.string().optional(), tag: z.string().optional() },
    handler: async (args, ctx) => {
      const drafts = await ctx.store.list({
        isDraft: true,
        query: args.query as string | undefined,
        tag: args.tag as string | undefined,
      });
      return {
        text: drafts.length
          ? drafts.map((d) => `- ${d.title} (${d.id}) · ${d.seo.wordCount}w`).join('\n')
          : 'No drafts found.',
        data: { count: drafts.length, drafts: drafts.map(summarize) },
      };
    },
  });

  tool({
    name: 'list_articles',
    title: 'List Articles',
    description: 'List all locally-tracked articles (drafts and published).',
    inputSchema: {
      status: publishStatusSchema.optional(),
      query: z.string().optional(),
      tag: z.string().optional(),
    },
    handler: async (args, ctx) => {
      const items = await ctx.store.list({
        publishStatus: args.status as Article['publishStatus'] | undefined,
        query: args.query as string | undefined,
        tag: args.tag as string | undefined,
      });
      return {
        text: items.length
          ? items.map((a) => `- [${a.publishStatus}] ${a.title} (${a.id})`).join('\n')
          : 'No articles found.',
        data: { count: items.length, articles: items.map(summarize) },
      };
    },
  });

  tool({
    name: 'search_articles',
    title: 'Search Articles',
    description: 'Full-text search across titles, subtitles and bodies.',
    inputSchema: { query: z.string().min(1) },
    handler: async (args, ctx) => {
      const results = await ctx.store.list({ query: String(args.query) });
      return {
        text: `${results.length} match(es).`,
        data: { count: results.length, results: results.map(summarize) },
      };
    },
  });

  tool({
    name: 'get_article',
    title: 'Get Article',
    description: 'Fetch a full article (Markdown, HTML, SEO) by id.',
    inputSchema: { id: articleIdField },
    handler: async (args, ctx) => {
      const article = await ctx.store.get(String(args.id));
      return { text: article.markdown, data: article };
    },
  });

  tool({
    name: 'update_article',
    title: 'Update Article',
    description:
      'Update fields of an existing article (title, markdown, tags, etc). Derived fields and a revision snapshot are recorded automatically.',
    inputSchema: {
      id: articleIdField,
      title: z.string().optional(),
      markdown: z.string().optional(),
      subtitle: z.string().optional(),
      tags: tagsField,
      publication: z.string().optional(),
      canonicalUrl: z.string().url().optional(),
      featuredImageUrl: z.string().url().optional(),
      visibility: visibilitySchema.optional(),
    },
    handler: async (args, ctx) => {
      const existing = await ctx.store.get(String(args.id));
      const merged: Article = enrichArticle({
        ...existing,
        title: (args.title as string) ?? existing.title,
        markdown: (args.markdown as string) ?? existing.markdown,
        subtitle: (args.subtitle as string) ?? existing.subtitle,
        tags: (args.tags as string[]) ?? existing.tags,
        publication: (args.publication as string) ?? existing.publication,
        canonicalUrl: (args.canonicalUrl as string) ?? existing.canonicalUrl,
        featuredImageUrl: (args.featuredImageUrl as string) ?? existing.featuredImageUrl,
        visibility: (args.visibility as Article['visibility']) ?? existing.visibility,
      });
      const saved = await ctx.store.update(merged, 'update_article');
      return { text: `Updated "${saved.title}".`, data: summarize(saved) };
    },
  });

  // Draft-scoped aliases for parity with the spec's separate verbs. They share
  // the same store operations as their article counterparts.
  tool({
    name: 'get_draft',
    title: 'Get Draft',
    description: 'Fetch a draft by id (alias of get_article).',
    inputSchema: { id: articleIdField },
    handler: async (args, ctx) => {
      const article = await ctx.store.get(String(args.id));
      return { text: article.markdown, data: article };
    },
  });

  tool({
    name: 'delete_draft',
    title: 'Delete Draft',
    description: 'Delete a draft by id (alias of delete_article).',
    inputSchema: { id: articleIdField },
    handler: async (args, ctx) => {
      const article = await ctx.store.get(String(args.id));
      await ctx.store.delete(article.id);
      return { text: `Deleted draft "${article.title}".`, data: { id: article.id } };
    },
  });

  tool({
    name: 'delete_article',
    title: 'Delete Article',
    description: 'Delete an article and its revision history.',
    inputSchema: { id: articleIdField },
    handler: async (args, ctx) => {
      const article = await ctx.store.get(String(args.id));
      await ctx.store.delete(article.id);
      return { text: `Deleted "${article.title}".`, data: { id: article.id } };
    },
  });

  tool({
    name: 'duplicate_article',
    title: 'Duplicate Article',
    description: 'Create a draft copy of an existing article.',
    inputSchema: { id: articleIdField },
    handler: async (args, ctx) => {
      const copy = await ctx.store.duplicate(String(args.id));
      return { text: `Duplicated to "${copy.title}" (${copy.id}).`, data: summarize(copy) };
    },
  });

  tool({
    name: 'archive_article',
    title: 'Archive Article',
    description: 'Archive an article by marking it unlisted and adding an "archived" tag.',
    inputSchema: { id: articleIdField },
    handler: async (args, ctx) => {
      const article = await ctx.store.get(String(args.id));
      const archived = enrichArticle({
        ...article,
        publishStatus: 'unlisted',
        visibility: 'unlisted',
        tags: [...new Set([...article.tags, 'archived'])].slice(0, 5),
      });
      await ctx.store.update(archived, 'archive');
      return { text: `Archived "${archived.title}".`, data: summarize(archived) };
    },
  });

  tool({
    name: 'list_versions',
    title: 'List Versions',
    description: 'List the revision history for an article.',
    inputSchema: { id: articleIdField },
    handler: async (args, ctx) => {
      const revisions = await ctx.store.listRevisions(String(args.id));
      return {
        text: revisions.length
          ? revisions.map((r) => `- ${r.createdAt} · ${r.note} (${r.revisionId})`).join('\n')
          : 'No revisions recorded.',
        data: {
          count: revisions.length,
          revisions: revisions.map((r) => ({
            revisionId: r.revisionId,
            note: r.note,
            createdAt: r.createdAt,
          })),
        },
      };
    },
  });

  tool({
    name: 'restore_version',
    title: 'Restore Version',
    description: 'Restore an article to a prior revision (rollback).',
    inputSchema: { id: articleIdField, revisionId: z.string().min(1) },
    handler: async (args, ctx) => {
      const restored = await ctx.store.restore(String(args.id), String(args.revisionId));
      return { text: `Restored "${restored.title}" to ${String(args.revisionId)}.`, data: summarize(restored) };
    },
  });

  tool({
    name: 'autosave',
    title: 'Autosave',
    description:
      'Create-or-update an article by id in a single call, recording an autosave revision (autosave recovery).',
    inputSchema: {
      id: z.string().optional().describe('Existing id; omit to create a new autosaved draft.'),
      title: titleField,
      markdown: markdownField,
    },
    handler: async (args, ctx) => {
      const cfg = ctx.config.get();
      const id = args.id as string | undefined;
      const existing = id ? await ctx.store.find(id) : undefined;
      if (existing) {
        const merged = enrichArticle({
          ...existing,
          title: String(args.title),
          markdown: String(args.markdown),
        });
        const saved = await ctx.store.update(merged, 'autosave');
        return { text: `Autosaved "${saved.title}".`, data: { id: saved.id } };
      }
      const article = createArticleFromInput(
        { title: String(args.title), markdown: String(args.markdown), publishStatus: 'draft' },
        { visibility: cfg.defaults.visibility, tags: cfg.defaults.tags, publication: cfg.defaults.publication },
      );
      await ctx.store.create(article);
      return { text: `Autosaved new draft "${article.title}".`, data: { id: article.id } };
    },
  });
}
