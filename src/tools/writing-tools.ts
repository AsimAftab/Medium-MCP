/**
 * Writing tools: generation and transformation of article prose.
 *
 * Generation/transformation tools return a rendered *instruction* for the host
 * model to execute (see {@link ../services/prompt-builder.ts}), while purely
 * deterministic tools (fix_markdown, convert_*) perform the work in-process.
 */
import { z } from 'zod';
import type { Registrar } from '../server/tool-registry.js';
import { markdownField, toneSchema } from '../schemas/common.js';
import { fixMarkdown, htmlToMarkdown, markdownToHtml } from '../utils/markdown.js';

export function registerWritingTools(tool: Registrar): void {
  tool({
    name: 'create_article',
    title: 'Create Article',
    description:
      'Generate a complete Medium article (title, subtitle, intro, sections, conclusion, CTA, tags, meta description) from a topic, optional outline, keywords, tone, audience and target length. Returns a writing brief for the assistant to fulfill, then save with save_draft.',
    inputSchema: {
      topic: z.string().min(1).describe('What the article is about.'),
      outline: z.array(z.string()).optional().describe('Optional section outline.'),
      keywords: z.array(z.string()).optional().describe('SEO keywords to include.'),
      tone: toneSchema.optional(),
      audience: z.string().optional().describe('Target reader.'),
      targetWords: z.number().int().min(200).max(6000).optional(),
      template: z.string().optional().describe('Template id (see list_templates).'),
    },
    handler: (args, ctx) => {
      const cfg = ctx.config.get();
      const template = args.template
        ? ctx.templates.getTemplate(String(args.template))
        : undefined;
      const ix = ctx.prompts.buildCreateArticle({
        topic: String(args.topic),
        outline: args.outline as string[] | undefined,
        keywords: args.keywords as string[] | undefined,
        tone: (args.tone as string) ?? template?.defaultTone ?? cfg.defaults.tone,
        audience: args.audience as string | undefined,
        targetWords: args.targetWords as number | undefined,
        template,
        language: cfg.defaults.language,
      });
      return {
        text: ctx.prompts.render(ix),
        data: {
          instruction: ix,
          suggestedTags: template?.suggestedTags ?? [],
          nextStep: 'Write the article, then call save_draft with the result.',
        },
      };
    },
  });

  tool({
    name: 'continue_article',
    title: 'Continue Article',
    description: 'Continue writing from existing Markdown, matching tone and style.',
    inputSchema: {
      markdown: markdownField,
      direction: z.string().optional().describe('Optional guidance for what to write next.'),
    },
    handler: (args, ctx) => {
      const ix = ctx.prompts.buildContinue(
        String(args.markdown),
        args.direction as string | undefined,
      );
      return { text: ctx.prompts.render(ix), data: { instruction: ix } };
    },
  });

  tool({
    name: 'rewrite_article',
    title: 'Rewrite Article',
    description:
      'Rewrite an article in a chosen style: professional, casual, technical, academic, startup, founder, storytelling, or conversational.',
    inputSchema: {
      markdown: markdownField,
      style: toneSchema,
    },
    handler: (args, ctx) => {
      const persona = ctx.templates.getPersona(String(args.style));
      if (!persona) {
        return { text: `Unknown style: ${String(args.style)}` };
      }
      const ix = ctx.prompts.buildRewrite(String(args.markdown), persona);
      return { text: ctx.prompts.render(ix), data: { instruction: ix } };
    },
  });

  tool({
    name: 'summarize_article',
    title: 'Summarize Article',
    description: 'Produce a TL;DR, executive summary, or social summary of an article.',
    inputSchema: {
      markdown: markdownField,
      kind: z.enum(['tldr', 'executive', 'social']).default('tldr'),
    },
    handler: (args, ctx) => {
      const ix = ctx.prompts.buildSummarize(
        String(args.markdown),
        args.kind as 'tldr' | 'executive' | 'social',
      );
      return { text: ctx.prompts.render(ix), data: { instruction: ix } };
    },
  });

  tool({
    name: 'expand_article',
    title: 'Expand Article',
    description: 'Expand sections with more depth and examples while preserving tone.',
    inputSchema: {
      markdown: markdownField,
      factor: z.number().min(1.1).max(4).default(1.5).describe('Target length multiplier.'),
    },
    handler: (args, ctx) => {
      const ix = ctx.prompts.buildExpand(String(args.markdown), Number(args.factor));
      return { text: ctx.prompts.render(ix), data: { instruction: ix } };
    },
  });

  tool({
    name: 'shorten_article',
    title: 'Shorten Article',
    description: 'Reduce length while preserving meaning and key points.',
    inputSchema: {
      markdown: markdownField,
      targetWords: z.number().int().min(100).optional(),
    },
    handler: (args, ctx) => {
      const ix = ctx.prompts.buildShorten(
        String(args.markdown),
        args.targetWords as number | undefined,
      );
      return { text: ctx.prompts.render(ix), data: { instruction: ix } };
    },
  });

  tool({
    name: 'improve_article',
    title: 'Improve Article',
    description:
      'Automatically improve grammar, clarity, transitions, formatting and readability.',
    inputSchema: {
      markdown: markdownField,
      focus: z.array(z.string()).optional().describe('Aspects to focus on.'),
    },
    handler: (args, ctx) => {
      const ix = ctx.prompts.buildImprove(
        String(args.markdown),
        args.focus as string[] | undefined,
      );
      return { text: ctx.prompts.render(ix), data: { instruction: ix } };
    },
  });

  tool({
    name: 'fix_markdown',
    title: 'Fix Markdown',
    description:
      'Deterministically repair malformed Markdown (heading spacing, blank lines, unterminated code fences, trailing whitespace).',
    inputSchema: { markdown: markdownField },
    handler: (args) => {
      const { fixed, changes } = fixMarkdown(String(args.markdown));
      return {
        text: changes.length
          ? `Applied ${changes.length} fix(es):\n- ${changes.join('\n- ')}\n\n---\n\n${fixed}`
          : `No issues found.\n\n---\n\n${fixed}`,
        data: { fixed, changes },
      };
    },
  });

  tool({
    name: 'convert_html',
    title: 'Convert HTML to Markdown',
    description: 'Convert HTML into clean Markdown.',
    inputSchema: { html: z.string().min(1) },
    handler: (args) => {
      const markdown = htmlToMarkdown(String(args.html));
      return { text: markdown, data: { markdown } };
    },
  });

  tool({
    name: 'convert_markdown',
    title: 'Convert Markdown to HTML',
    description: 'Convert Markdown into Medium-compatible HTML.',
    inputSchema: { markdown: markdownField },
    handler: (args) => {
      const html = markdownToHtml(String(args.markdown));
      return { text: html, data: { html } };
    },
  });
}
