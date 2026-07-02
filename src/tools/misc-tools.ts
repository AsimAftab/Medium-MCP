/**
 * Templates, personas, article comparison and higher-level workflow tools.
 */
import { z } from 'zod';
import type { Registrar } from '../server/tool-registry.js';
import { markdownField } from '../schemas/common.js';
import { diffLines, diffStats, renderDiff } from '../utils/diff.js';

export function registerMiscTools(tool: Registrar): void {
  tool({
    name: 'list_templates',
    title: 'List Templates',
    description: 'List available article templates with their outlines.',
    inputSchema: {},
    handler: (_args, ctx) => {
      const templates = ctx.templates.listTemplates();
      return {
        text: templates.map((t) => `- ${t.id}: ${t.name} — ${t.description}`).join('\n'),
        data: { templates },
      };
    },
  });

  tool({
    name: 'get_template',
    title: 'Get Template',
    description: 'Fetch a single template (outline, guidance, suggested tags).',
    inputSchema: { id: z.string().min(1) },
    handler: (args, ctx) => {
      const template = ctx.templates.getTemplate(String(args.id));
      if (!template) return { text: `Unknown template: ${String(args.id)}` };
      return {
        text: `${template.name}\n\nOutline:\n${template.outline.map((s) => `- ${s}`).join('\n')}\n\nGuidance: ${template.guidance}`,
        data: template,
      };
    },
  });

  tool({
    name: 'list_personas',
    title: 'List Personas',
    description: 'List available writing personas/voices.',
    inputSchema: {},
    handler: (_args, ctx) => {
      const personas = ctx.templates.listPersonas();
      return {
        text: personas.map((p) => `- ${p.id}: ${p.name} — ${p.description}`).join('\n'),
        data: { personas },
      };
    },
  });

  tool({
    name: 'compare_articles',
    title: 'Compare Articles (Diff)',
    description: 'Line-level diff between two Markdown documents with add/remove stats.',
    inputSchema: { left: z.string(), right: z.string() },
    handler: (args) => {
      const lines = diffLines(String(args.left), String(args.right));
      const stats = diffStats(lines);
      return {
        text: `+${stats.added} / -${stats.removed} (unchanged ${stats.unchanged})\n\n${renderDiff(lines)}`,
        data: { stats, diff: lines },
      };
    },
  });

  tool({
    name: 'diff_versions',
    title: 'Diff Versions',
    description: 'Diff a stored article against one of its revisions.',
    inputSchema: { id: z.string().min(1), revisionId: z.string().min(1) },
    handler: async (args, ctx) => {
      const article = await ctx.store.get(String(args.id));
      const revisions = await ctx.store.listRevisions(String(args.id));
      const revision = revisions.find((r) => r.revisionId === String(args.revisionId));
      if (!revision) return { text: `Revision not found: ${String(args.revisionId)}` };
      const lines = diffLines(revision.snapshot.markdown, article.markdown);
      const stats = diffStats(lines);
      return {
        text: `Changes since ${revision.createdAt}: +${stats.added} / -${stats.removed}\n\n${renderDiff(lines)}`,
        data: { stats, diff: lines },
      };
    },
  });

  tool({
    name: 'create_writing_plan',
    title: 'Create Writing Plan',
    description:
      'Produce a multi-step writing plan (research → outline → draft → SEO → images → publish) for a topic, mapping each step to the tools that perform it.',
    inputSchema: {
      topic: z.string().min(1),
      targetWords: z.number().int().min(300).max(6000).optional(),
    },
    handler: (args, ctx) => {
      const cfg = ctx.config.get();
      const words = (args.targetWords as number | undefined) ?? 1500;
      const plan = [
        `1. Research — call research_topic("${String(args.topic)}") to gather sources.`,
        `2. Outline — call generate_outline (or pick a template via list_templates).`,
        `3. Draft — call create_article with topic, outline, tone="${cfg.defaults.tone}", targetWords=${words}; write the article.`,
        `4. Save — call save_draft to persist and get an id.`,
        `5. Improve — call improve_article, then fix_markdown.`,
        `6. SEO — call analyze_seo and score_article; apply suggestions.`,
        `7. Imagery — call generate_image_prompt for a hero image; set_featured_image.`,
        `8. Quality gate — call quality_check.`,
        `9. Publish — call publish_article (or schedule_publish for later).`,
      ].join('\n');
      return { text: plan, data: { topic: args.topic, targetWords: words, steps: 9 } };
    },
  });

  tool({
    name: 'one_click_improve',
    title: 'One-Click Improve',
    description:
      'Return a combined improvement brief: fixes markdown deterministically, then instructs the model to improve prose, SEO and structure in one pass.',
    inputSchema: { markdown: markdownField, title: z.string().optional() },
    handler: (args, ctx) => {
      const ix = ctx.prompts.buildImprove(String(args.markdown), [
        'grammar',
        'clarity',
        'transitions',
        'structure and headings',
        'SEO keyword usage',
        'stronger hook and conclusion',
      ]);
      return { text: ctx.prompts.render(ix), data: { instruction: ix } };
    },
  });
}
