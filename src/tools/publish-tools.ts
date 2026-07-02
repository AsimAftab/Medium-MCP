/**
 * Publishing, import/export and bulk-operation tools.
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
} from '../schemas/common.js';
import { createArticleFromInput, enrichArticle } from '../utils/article-factory.js';
import { htmlToMarkdown, markdownToHtml } from '../utils/markdown.js';
import { runQualityChecks } from '../utils/seo.js';
import { toPlainText } from '../utils/text.js';
import { NotFoundError } from '../utils/errors.js';
import type { Article } from '../types/index.js';

export function registerPublishTools(tool: Registrar): void {
  tool({
    name: 'publish_article',
    title: 'Publish Article',
    description:
      'Publish to Medium. Accepts either an existing article id OR inline title+markdown. Runs pre-publish quality checks (override with force). Supports draft/public/unlisted.',
    inputSchema: {
      id: z.string().optional().describe('Existing article id to publish.'),
      title: z.string().optional(),
      markdown: z.string().optional(),
      subtitle: z.string().optional(),
      tags: tagsField,
      publication: z.string().optional().describe('Medium publication id.'),
      publishStatus: publishStatusSchema.default('draft'),
      canonicalUrl: z.string().url().optional(),
      license: licenseSchema.optional(),
      featuredImageUrl: z.string().url().optional(),
      notifyFollowers: z.boolean().default(false),
      force: z.boolean().default(false).describe('Skip the quality gate.'),
    },
    handler: async (args, ctx) => {
      const cfg = ctx.config.get();
      let article: Article;

      if (args.id) {
        article = await ctx.store.get(String(args.id));
        article = enrichArticle({
          ...article,
          publishStatus: args.publishStatus as Article['publishStatus'],
          publication: (args.publication as string) ?? article.publication,
          tags: (args.tags as string[]) ?? article.tags,
          featuredImageUrl: (args.featuredImageUrl as string) ?? article.featuredImageUrl,
          canonicalUrl: (args.canonicalUrl as string) ?? article.canonicalUrl,
          license: (args.license as Article['license']) ?? article.license,
        });
      } else {
        if (!args.title || !args.markdown) {
          return {
            text: 'Provide either an existing "id" or both "title" and "markdown".',
          };
        }
        article = createArticleFromInput(
          {
            title: String(args.title),
            markdown: String(args.markdown),
            subtitle: args.subtitle as string | undefined,
            tags: args.tags as string[] | undefined,
            publication: args.publication as string | undefined,
            publishStatus: args.publishStatus as Article['publishStatus'],
            canonicalUrl: args.canonicalUrl as string | undefined,
            license: args.license as Article['license'],
            featuredImageUrl: args.featuredImageUrl as string | undefined,
          },
          {
            visibility: cfg.defaults.visibility,
            tags: cfg.defaults.tags,
            publication: cfg.defaults.publication,
          },
        );
      }

      const result = await ctx.publisher.publish(article, {
        force: Boolean(args.force),
        notifyFollowers: Boolean(args.notifyFollowers),
      });

      return {
        text: `Published "${result.article.title}" as ${result.post.publishStatus}.\nURL: ${result.post.url}\nQuality score: ${result.quality.score}/100`,
        data: {
          id: result.article.id,
          mediumId: result.post.id,
          url: result.post.url,
          publishStatus: result.post.publishStatus,
          quality: result.quality,
        },
      };
    },
  });

  tool({
    name: 'quality_check',
    title: 'Quality Check',
    description:
      'Run the full pre-publish quality gate (grammar heuristics, headings, code fences, image links, duplicates, min length, readability, markdown validity).',
    inputSchema: {
      title: titleField,
      markdown: markdownField,
      minWords: z.number().int().min(0).default(400),
    },
    handler: (args) => {
      const report = runQualityChecks(String(args.title), String(args.markdown), {
        minWords: Number(args.minWords),
      });
      const text = report.issues.length
        ? `${report.passed ? 'PASS' : 'FAIL'} — score ${report.score}/100\n- ${report.issues
            .map((i) => `[${i.severity}] ${i.check}: ${i.message}`)
            .join('\n- ')}`
        : `PASS — score ${report.score}/100. No issues.`;
      return { text, data: report };
    },
  });

  // ── Import / Export ───────────────────────────────────────────────────

  tool({
    name: 'import_markdown',
    title: 'Import Markdown',
    description: 'Import a Markdown document as a new draft (title from first H1 if omitted).',
    inputSchema: {
      markdown: markdownField,
      title: z.string().optional(),
      tags: tagsField,
    },
    handler: async (args, ctx) => {
      const cfg = ctx.config.get();
      const md = String(args.markdown);
      const h1 = /^#\s+(.+)$/m.exec(md)?.[1]?.trim();
      const title = (args.title as string | undefined) ?? h1 ?? 'Untitled';
      const body = h1 ? md.replace(/^#\s+.+$/m, '').trim() : md;
      const article = createArticleFromInput(
        { title, markdown: body, tags: args.tags as string[] | undefined, publishStatus: 'draft' },
        { visibility: cfg.defaults.visibility, tags: cfg.defaults.tags, publication: cfg.defaults.publication },
      );
      await ctx.store.create(article);
      return { text: `Imported "${title}" (id: ${article.id}).`, data: { id: article.id } };
    },
  });

  tool({
    name: 'export_article',
    title: 'Export Article',
    description: 'Export an article as markdown, html, json or plain text.',
    inputSchema: {
      id: articleIdField,
      format: z.enum(['markdown', 'html', 'json', 'text']).default('markdown'),
    },
    handler: async (args, ctx) => {
      const article = await ctx.store.get(String(args.id));
      switch (args.format) {
        case 'html':
          return { text: markdownToHtml(article.markdown), data: { format: 'html' } };
        case 'json':
          return { text: JSON.stringify(article, null, 2), data: article };
        case 'text':
          return { text: toPlainText(article.markdown), data: { format: 'text' } };
        default:
          return { text: article.markdown, data: { format: 'markdown' } };
      }
    },
  });

  tool({
    name: 'convert_import_html',
    title: 'Import HTML',
    description: 'Convert an HTML document to Markdown and import it as a draft.',
    inputSchema: { html: z.string().min(1), title: z.string().optional() },
    handler: async (args, ctx) => {
      const cfg = ctx.config.get();
      const markdown = htmlToMarkdown(String(args.html));
      const title = (args.title as string | undefined) ?? 'Imported article';
      const article = createArticleFromInput(
        { title, markdown, publishStatus: 'draft' },
        { visibility: cfg.defaults.visibility, tags: cfg.defaults.tags, publication: cfg.defaults.publication },
      );
      await ctx.store.create(article);
      return { text: `Imported HTML as "${title}" (id: ${article.id}).`, data: { id: article.id } };
    },
  });

  // ── Bulk operations ──────────────────────────────────────────────────

  tool({
    name: 'bulk_import_markdown',
    title: 'Bulk Import Markdown',
    description: 'Import multiple Markdown documents as drafts in one call.',
    inputSchema: {
      documents: z
        .array(z.object({ title: z.string().optional(), markdown: z.string().min(1) }))
        .min(1)
        .max(50),
    },
    handler: async (args, ctx) => {
      const cfg = ctx.config.get();
      const docs = args.documents as Array<{ title?: string; markdown: string }>;
      const created: string[] = [];
      for (const doc of docs) {
        const h1 = /^#\s+(.+)$/m.exec(doc.markdown)?.[1]?.trim();
        const title = doc.title ?? h1 ?? 'Untitled';
        const body = h1 ? doc.markdown.replace(/^#\s+.+$/m, '').trim() : doc.markdown;
        const article = createArticleFromInput(
          { title, markdown: body, publishStatus: 'draft' },
          { visibility: cfg.defaults.visibility, tags: cfg.defaults.tags, publication: cfg.defaults.publication },
        );
        await ctx.store.create(article);
        created.push(article.id);
      }
      return { text: `Imported ${created.length} drafts.`, data: { ids: created } };
    },
  });

  tool({
    name: 'bulk_publish',
    title: 'Bulk Publish',
    description: 'Publish multiple stored articles by id. Reports per-article success/failure.',
    inputSchema: {
      ids: z.array(z.string().min(1)).min(1).max(25),
      publishStatus: publishStatusSchema.default('draft'),
      force: z.boolean().default(false),
    },
    handler: async (args, ctx) => {
      const ids = args.ids as string[];
      const results: Array<{ id: string; ok: boolean; detail: string }> = [];
      for (const id of ids) {
        try {
          const article = await ctx.store.find(id);
          if (!article) throw new NotFoundError('Article', id);
          const res = await ctx.publisher.publish(
            enrichArticle({ ...article, publishStatus: args.publishStatus as Article['publishStatus'] }),
            { force: Boolean(args.force) },
          );
          results.push({ id, ok: true, detail: res.post.url });
        } catch (err) {
          results.push({ id, ok: false, detail: err instanceof Error ? err.message : String(err) });
        }
      }
      const ok = results.filter((r) => r.ok).length;
      return {
        text: `Published ${ok}/${ids.length}.\n${results
          .map((r) => `- ${r.id}: ${r.ok ? 'OK ' + r.detail : 'FAILED ' + r.detail}`)
          .join('\n')}`,
        data: { results },
      };
    },
  });
}
