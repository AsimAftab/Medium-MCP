/**
 * Research tools. Use the configured provider when available, otherwise return
 * an instruction for the host model to perform the research itself.
 */
import { z } from 'zod';
import type { Registrar } from '../server/tool-registry.js';
import { markdownField } from '../schemas/common.js';

export function registerResearchTools(tool: Registrar): void {
  tool({
    name: 'research_topic',
    title: 'Research Topic',
    description:
      'Research a topic via the configured provider (Tavily/Brave/Perplexity/Firecrawl), or return a research brief if none is configured.',
    inputSchema: {
      query: z.string().min(1),
      maxResults: z.number().int().min(1).max(20).default(6),
    },
    handler: async (args, ctx) => {
      const res = await ctx.research.search(String(args.query), Number(args.maxResults));
      if (res.fallbackInstruction) {
        return { text: res.fallbackInstruction, data: res };
      }
      const text = res.results
        .map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet}`)
        .join('\n');
      return { text: text || 'No results.', data: res };
    },
  });

  tool({
    name: 'collect_references',
    title: 'Collect References',
    description: 'Collect authoritative references for a topic and format them for citation.',
    inputSchema: {
      query: z.string().min(1),
      style: z.enum(['apa', 'mla', 'chicago', 'links']).default('links'),
    },
    handler: async (args, ctx) => {
      const res = await ctx.research.search(String(args.query), 8);
      if (res.fallbackInstruction) {
        return {
          text: `${res.fallbackInstruction}\n\nThen format each reference in ${String(args.style).toUpperCase()} style.`,
          data: res,
        };
      }
      const refs = res.results.map((r) =>
        args.style === 'links' ? `- [${r.title}](${r.url})` : `- ${r.title}. ${r.url}`,
      );
      return { text: refs.join('\n'), data: { references: res.results, style: args.style } };
    },
  });

  tool({
    name: 'fact_check',
    title: 'Fact Check',
    description:
      'Fact-check the claims in an article. Uses the research provider for evidence when configured.',
    inputSchema: { markdown: markdownField },
    handler: async (args, ctx) => {
      const ix = ctx.prompts.buildAssistant(
        'Identify the factual claims in this article and assess each as supported, unsupported, or needs-citation. For any that need sources, note what evidence would confirm them.',
        String(args.markdown),
        [
          ctx.research.provider === 'none'
            ? 'No research provider configured — use your own knowledge and browsing.'
            : `A research provider (${ctx.research.provider}) is available; call research_topic for specific claims.`,
          'Return a Markdown table: Claim | Verdict | Notes.',
        ],
      );
      return { text: ctx.prompts.render(ix), data: { instruction: ix } };
    },
  });

  tool({
    name: 'find_statistics',
    title: 'Find Statistics',
    description: 'Find recent statistics and data points supporting a topic.',
    inputSchema: { topic: z.string().min(1) },
    handler: async (args, ctx) => {
      const res = await ctx.research.search(`latest statistics ${String(args.topic)}`, 8);
      if (res.fallbackInstruction) return { text: res.fallbackInstruction, data: res };
      return {
        text: res.results.map((r) => `- ${r.title}: ${r.url}`).join('\n'),
        data: res,
      };
    },
  });
}
