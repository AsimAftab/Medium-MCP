/**
 * SEO analysis + optimization tools (all deterministic).
 */
import { z } from 'zod';
import type { Registrar } from '../server/tool-registry.js';
import { markdownField, titleField } from '../schemas/common.js';
import { analyzeSeo, analyzeHeadings, scoreArticle } from '../utils/seo.js';
import {
  extractKeywords,
  keywordDensity,
  readingTimeMinutes,
  slugify,
  truncateWords,
  toPlainText,
} from '../utils/text.js';

export function registerSeoTools(tool: Registrar): void {
  tool({
    name: 'analyze_seo',
    title: 'Analyze SEO',
    description:
      'Full SEO report: SEO title, meta description, slug, keywords + density, word count, reading time, readability, heading analysis and actionable suggestions.',
    inputSchema: {
      title: titleField,
      markdown: markdownField,
      keywords: z.array(z.string()).optional().describe('Focus keywords.'),
    },
    handler: (args) => {
      const report = analyzeSeo(
        String(args.title),
        String(args.markdown),
        (args.keywords as string[] | undefined) ?? [],
      );
      const summary = [
        `SEO title: ${report.seoTitle}`,
        `Slug: ${report.slug}`,
        `Meta: ${report.metaDescription}`,
        `Words: ${report.wordCount} · Reading: ${report.readingTimeMinutes} min · Readability: ${report.readabilityScore} (${report.readingLevel})`,
        `Keywords: ${report.keywords.join(', ')}`,
        report.suggestions.length
          ? `Suggestions:\n- ${report.suggestions.join('\n- ')}`
          : 'No SEO suggestions — looks good.',
      ].join('\n');
      return { text: summary, data: report };
    },
  });

  tool({
    name: 'generate_slug',
    title: 'Generate Slug',
    description: 'Generate a URL-safe slug from a title.',
    inputSchema: { title: titleField },
    handler: (args) => {
      const slug = slugify(String(args.title));
      return { text: slug, data: { slug } };
    },
  });

  tool({
    name: 'generate_meta_description',
    title: 'Generate Meta Description',
    description: 'Generate a ≤160-character meta description from article content.',
    inputSchema: { markdown: markdownField, maxLength: z.number().int().min(80).max(200).default(158) },
    handler: (args) => {
      const plain = toPlainText(String(args.markdown)).replace(/\n+/g, ' ');
      const meta = truncateWords(plain, Number(args.maxLength));
      return { text: meta, data: { metaDescription: meta, length: meta.length } };
    },
  });

  tool({
    name: 'generate_keywords',
    title: 'Generate Keywords',
    description: 'Extract the most relevant keywords from content.',
    inputSchema: { markdown: markdownField, limit: z.number().int().min(1).max(25).default(10) },
    handler: (args) => {
      const keywords = extractKeywords(String(args.markdown), Number(args.limit));
      return { text: keywords.join(', '), data: { keywords } };
    },
  });

  tool({
    name: 'keyword_density',
    title: 'Keyword Density',
    description: 'Compute keyword density (% of words) for the given keywords.',
    inputSchema: { markdown: markdownField, keywords: z.array(z.string().min(1)).min(1) },
    handler: (args) => {
      const density = keywordDensity(String(args.markdown), args.keywords as string[]);
      const text = Object.entries(density)
        .map(([k, v]) => `${k}: ${v}%`)
        .join('\n');
      return { text, data: { density } };
    },
  });

  tool({
    name: 'reading_time',
    title: 'Reading Time',
    description: 'Estimate reading time and word count.',
    inputSchema: { markdown: markdownField },
    handler: (args) => {
      const minutes = readingTimeMinutes(String(args.markdown));
      return {
        text: `${minutes} min read`,
        data: { readingTimeMinutes: minutes },
      };
    },
  });

  tool({
    name: 'analyze_headings',
    title: 'Analyze Headings',
    description: 'Analyze heading hierarchy for skipped levels, duplicates and multiple H1s.',
    inputSchema: { markdown: markdownField },
    handler: (args) => {
      const analysis = analyzeHeadings(String(args.markdown));
      const text = analysis.issues.length
        ? `Found ${analysis.issues.length} issue(s):\n- ${analysis.issues.map((i) => i.message).join('\n- ')}`
        : `No heading issues across ${analysis.count} headings.`;
      return { text, data: analysis };
    },
  });

  tool({
    name: 'score_article',
    title: 'Score Article',
    description:
      'Score an article 0–100 across SEO, readability, structure and engagement, with a breakdown.',
    inputSchema: { title: titleField, markdown: markdownField },
    handler: (args) => {
      const score = scoreArticle(String(args.title), String(args.markdown));
      return {
        text: `Overall ${score.overall}/100\n- ${score.breakdown.join('\n- ')}`,
        data: score,
      };
    },
  });

  tool({
    name: 'suggest_related_topics',
    title: 'Suggest Related Topics',
    description:
      'Suggest related topics and internal/external linking opportunities (model-assisted).',
    inputSchema: { markdown: markdownField, count: z.number().int().min(3).max(20).default(8) },
    handler: (args, ctx) => {
      const ix = ctx.prompts.buildAssistant(
        `Suggest ${Number(args.count)} closely-related topics for follow-up articles, plus 3–5 authoritative external sources worth linking to.`,
        String(args.markdown),
        ['Return a Markdown list; group into "Related topics" and "External references".'],
      );
      return { text: ctx.prompts.render(ix), data: { instruction: ix } };
    },
  });
}
