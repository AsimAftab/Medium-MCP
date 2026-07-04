/**
 * Editing tools: structural manipulation of an article plus targeted
 * content-generation helpers (tables, code blocks, FAQs, outlines, CTAs).
 */
import { z } from 'zod';
import type { Registrar } from '../server/tool-registry.js';
import { markdownField } from '../schemas/common.js';
import {
  deleteSection,
  insertSection,
  moveSection,
  parseSections,
  renameHeading,
  replaceSection,
} from '../utils/sections.js';
import { generateTableOfContents } from '../utils/markdown.js';

export function registerEditingTools(tool: Registrar): void {
  tool({
    name: 'list_sections',
    title: 'List Sections',
    description: 'List all sections (headings) in an article with levels.',
    inputSchema: { markdown: markdownField },
    handler: (args) => {
      const sections = parseSections(String(args.markdown)).map((s) => ({
        heading: s.heading,
        level: s.level,
        line: s.startLine,
      }));
      return {
        text: sections.map((s) => `${'  '.repeat(s.level - 1)}- ${s.heading}`).join('\n'),
        data: { sections },
      };
    },
  });

  tool({
    name: 'insert_section',
    title: 'Insert Section',
    description: 'Insert a new section, optionally before/after an anchor heading.',
    inputSchema: {
      markdown: markdownField,
      heading: z.string().min(1),
      body: z.string().default(''),
      level: z.number().int().min(1).max(6).default(2),
      anchorHeading: z.string().optional(),
      position: z.enum(['before', 'after']).default('after'),
    },
    handler: (args) => {
      const result = insertSection(
        String(args.markdown),
        String(args.heading),
        String(args.body ?? ''),
        Number(args.level),
        args.anchorHeading as string | undefined,
        args.position as 'before' | 'after',
      );
      return { text: result, data: { markdown: result } };
    },
  });

  tool({
    name: 'replace_section',
    title: 'Replace Section',
    description: 'Replace the body of a section identified by its heading.',
    inputSchema: {
      markdown: markdownField,
      heading: z.string().min(1),
      newContent: z.string().min(1),
    },
    handler: (args) => {
      const result = replaceSection(
        String(args.markdown),
        String(args.heading),
        String(args.newContent),
      );
      return { text: result, data: { markdown: result } };
    },
  });

  tool({
    name: 'delete_section',
    title: 'Delete Section',
    description: 'Delete a section (heading + body) by heading text.',
    inputSchema: { markdown: markdownField, heading: z.string().min(1) },
    handler: (args) => {
      const result = deleteSection(String(args.markdown), String(args.heading));
      return { text: result, data: { markdown: result } };
    },
  });

  tool({
    name: 'move_section',
    title: 'Move Section',
    description: 'Move a section before or after another section.',
    inputSchema: {
      markdown: markdownField,
      heading: z.string().min(1),
      anchorHeading: z.string().min(1),
      position: z.enum(['before', 'after']).default('after'),
    },
    handler: (args) => {
      const result = moveSection(
        String(args.markdown),
        String(args.heading),
        String(args.anchorHeading),
        args.position as 'before' | 'after',
      );
      return { text: result, data: { markdown: result } };
    },
  });

  tool({
    name: 'rename_heading',
    title: 'Rename Heading',
    description: 'Rename a heading in place, preserving level and body.',
    inputSchema: {
      markdown: markdownField,
      oldHeading: z.string().min(1),
      newHeading: z.string().min(1),
    },
    handler: (args) => {
      const result = renameHeading(
        String(args.markdown),
        String(args.oldHeading),
        String(args.newHeading),
      );
      return { text: result, data: { markdown: result } };
    },
  });

  tool({
    name: 'table_of_contents',
    title: 'Generate Table of Contents',
    description: 'Generate a Markdown table of contents from H2/H3 headings.',
    inputSchema: { markdown: markdownField },
    handler: (args) => {
      const toc = generateTableOfContents(String(args.markdown));
      return {
        text: toc || 'Not enough headings to build a table of contents.',
        data: { toc },
      };
    },
  });

  tool({
    name: 'generate_table',
    title: 'Generate Markdown Table',
    description:
      'Build a Markdown table from headers and rows (deterministic). Tables are kept as GFM Markdown in drafts; on publish they are automatically re-rendered as fixed-width text in a code block, since Medium has no native table support.',
    inputSchema: {
      headers: z.array(z.string().min(1)).min(1),
      rows: z.array(z.array(z.string())).default([]),
      align: z.enum(['left', 'center', 'right']).default('left'),
    },
    handler: (args) => {
      const headers = args.headers as string[];
      const rows = args.rows as string[][];
      const sep = { left: ':---', center: ':---:', right: '---:' }[
        args.align as 'left' | 'center' | 'right'
      ];
      const lines = [
        `| ${headers.join(' | ')} |`,
        `| ${headers.map(() => sep).join(' | ')} |`,
        ...rows.map((r) => `| ${headers.map((_, i) => r[i] ?? '').join(' | ')} |`),
      ];
      const table = lines.join('\n');
      return { text: table, data: { table } };
    },
  });

  tool({
    name: 'generate_code_block',
    title: 'Generate Code Block',
    description: 'Wrap code in a fenced block with an optional language hint.',
    inputSchema: {
      code: z.string().min(1),
      language: z.string().default(''),
    },
    handler: (args) => {
      const block = `\`\`\`${String(args.language ?? '')}\n${String(args.code).replace(/\n$/, '')}\n\`\`\``;
      return { text: block, data: { block } };
    },
  });

  // ── Model-assisted generation helpers ─────────────────────────────────

  const assist = (
    name: string,
    title: string,
    description: string,
    command: string,
    extraShape: z.ZodRawShape = {},
  ): void => {
    tool({
      name,
      title,
      description,
      inputSchema: { markdown: markdownField, ...extraShape },
      handler: (args, ctx) => {
        const parts: string[] = [];
        if ('topic' in args && args.topic) parts.push(`Topic: ${String(args.topic)}.`);
        if ('count' in args && args.count) parts.push(`Provide ${Number(args.count)} items.`);
        const ix = ctx.prompts.buildAssistant(command, String(args.markdown), parts);
        return { text: ctx.prompts.render(ix), data: { instruction: ix } };
      },
    });
  };

  assist(
    'generate_outline',
    'Generate Outline',
    'Generate a structured outline from a topic or existing draft.',
    'Produce a detailed, logically-ordered outline (H2/H3) for this content.',
    { topic: z.string().optional() },
  );
  assist(
    'expand_outline',
    'Expand Outline',
    'Expand an outline into full prose sections.',
    'Expand each outline item into a complete, well-written section.',
  );
  assist(
    'generate_examples',
    'Generate Examples',
    'Generate concrete examples for the concepts in the content.',
    'Add 2–3 concrete, illustrative examples for the key concepts.',
    { count: z.number().int().min(1).max(10).optional() },
  );
  assist(
    'generate_faq',
    'Generate FAQ',
    'Generate a FAQ section from the article.',
    'Write a concise FAQ section answering the most likely reader questions.',
    { count: z.number().int().min(1).max(15).optional() },
  );
  assist(
    'generate_conclusion',
    'Generate Conclusion',
    'Generate a strong conclusion for the article.',
    'Write a memorable conclusion that restates the thesis and leaves the reader with a takeaway.',
  );
  assist(
    'generate_cta',
    'Generate Call to Action',
    'Generate a compelling call to action.',
    'Write a single, specific, compelling call to action appropriate to the article.',
  );
}
