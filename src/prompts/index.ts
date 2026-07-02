/**
 * Reusable MCP prompts. These appear in clients as slash-commands / prompt
 * pickers and pre-fill a well-formed request that typically chains several
 * tools together.
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Container } from '../server/container.js';

interface PromptSpec {
  name: string;
  title: string;
  description: string;
  argsSchema: z.ZodRawShape;
  build: (args: Record<string, string>, ctx: Container) => string;
}

const PROMPTS: PromptSpec[] = [
  {
    name: 'write_technical_tutorial',
    title: 'Write Technical Tutorial',
    description: 'Draft a step-by-step technical tutorial on a topic.',
    argsSchema: { topic: z.string().describe('Tutorial topic'), targetWords: z.string().optional() },
    build: (a) =>
      `Use create_article with template="technical-tutorial", topic="${a.topic}"${
        a.targetWords ? `, targetWords=${a.targetWords}` : ''
      }. Then save_draft, improve_article, analyze_seo and generate_image_prompt for a hero image.`,
  },
  {
    name: 'write_ai_blog',
    title: 'Write AI Blog',
    description: 'Draft an AI/LLM tutorial or explainer.',
    argsSchema: { topic: z.string() },
    build: (a) =>
      `Use create_article with template="ai-tutorial", topic="${a.topic}", tone="technical". Then save_draft and score_article.`,
  },
  {
    name: 'write_case_study',
    title: 'Write Case Study',
    description: 'Draft a results-driven case study.',
    argsSchema: { subject: z.string() },
    build: (a) =>
      `Use create_article with template="case-study", topic="${a.subject}". Lead with metrics. Save as a draft.`,
  },
  {
    name: 'rewrite_professional',
    title: 'Rewrite Professional',
    description: 'Rewrite provided content in a professional voice.',
    argsSchema: { markdown: z.string() },
    build: (a) => `Call rewrite_article with style="professional" on:\n\n${a.markdown}`,
  },
  {
    name: 'improve_seo',
    title: 'Improve SEO',
    description: 'Analyze and improve an article for search.',
    argsSchema: { id: z.string().optional(), markdown: z.string().optional(), title: z.string().optional() },
    build: (a) =>
      a.id
        ? `Call get_article(id="${a.id}"), then analyze_seo and apply its suggestions with update_article.`
        : `Call analyze_seo with title="${a.title ?? ''}" and the provided markdown, then apply the suggestions.`,
  },
  {
    name: 'summarize',
    title: 'Summarize',
    description: 'Summarize an article into TL;DR + social copy.',
    argsSchema: { markdown: z.string() },
    build: (a) => `Call summarize_article (kind="tldr") then (kind="social") on:\n\n${a.markdown}`,
  },
  {
    name: 'generate_faq',
    title: 'Generate FAQ',
    description: 'Add a FAQ section to an article.',
    argsSchema: { markdown: z.string() },
    build: (a) => `Call generate_faq on:\n\n${a.markdown}`,
  },
  {
    name: 'generate_outline',
    title: 'Generate Outline',
    description: 'Generate an outline for a topic.',
    argsSchema: { topic: z.string() },
    build: (a) => `Call generate_outline with topic="${a.topic}".`,
  },
  {
    name: 'publish_draft',
    title: 'Publish Draft',
    description: 'Run quality checks and publish a stored draft.',
    argsSchema: { id: z.string(), publishStatus: z.string().optional() },
    build: (a) =>
      `Call quality_check on the draft, then publish_article(id="${a.id}", publishStatus="${
        a.publishStatus ?? 'public'
      }").`,
  },
];

/** Register all reusable prompts on the server. */
export function registerPrompts(server: McpServer, ctx: Container): void {
  for (const spec of PROMPTS) {
    server.registerPrompt(
      spec.name,
      {
        title: spec.title,
        description: spec.description,
        argsSchema: spec.argsSchema,
      },
      (args: Record<string, string>) => ({
        messages: [
          {
            role: 'user' as const,
            content: { type: 'text' as const, text: spec.build(args, ctx) },
          },
        ],
      }),
    );
  }
}
