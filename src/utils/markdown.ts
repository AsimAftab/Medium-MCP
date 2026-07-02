/**
 * Markdown ⇄ HTML conversion and structural analysis utilities.
 *
 * Uses `markdown-it` for Markdown→HTML and `turndown` for HTML→Markdown.
 * All functions are pure and side-effect free.
 */
import MarkdownIt from 'markdown-it';
import TurndownService from 'turndown';

const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
  breaks: false,
});

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
  emDelimiter: '_',
  strongDelimiter: '**',
});

/** Minimal structural view of the DOM nodes Turndown hands to a rule. */
interface TurndownNode {
  nodeName: string;
  firstChild: TurndownNode | null;
  textContent: string | null;
  getAttribute?(name: string): string | null;
}

// Preserve fenced code language hints when converting HTML → Markdown.
turndown.addRule('fencedCodeBlock', {
  filter: (node): boolean =>
    node.nodeName === 'PRE' &&
    node.firstChild !== null &&
    node.firstChild.nodeName === 'CODE',
  replacement: (_content, node): string => {
    const pre = node as unknown as TurndownNode;
    const codeEl = pre.firstChild;
    const className = codeEl?.getAttribute?.('class') ?? '';
    const lang = /language-(\S+)/.exec(className ?? '')?.[1] ?? '';
    const code = codeEl?.textContent ?? '';
    return `\n\n\`\`\`${lang}\n${code.replace(/\n$/, '')}\n\`\`\`\n\n`;
  },
});

/** Render Markdown to Medium-compatible HTML. */
export function markdownToHtml(markdown: string): string {
  return md.render(markdown).trim();
}

/** Convert HTML into clean Markdown. */
export function htmlToMarkdown(html: string): string {
  return turndown.turndown(html).trim();
}

export interface Heading {
  level: number;
  text: string;
  line: number;
  slug: string;
}

/** Extract all ATX headings with their level, text and line number. */
export function extractHeadings(markdown: string): Heading[] {
  const headings: Heading[] = [];
  const lines = markdown.split('\n');
  let inFence = false;
  lines.forEach((line, idx) => {
    if (/^\s*```/.test(line)) inFence = !inFence;
    if (inFence) return;
    const match = /^(#{1,6})\s+(.*)$/.exec(line);
    if (match) {
      const text = match[2]!.trim();
      headings.push({
        level: match[1]!.length,
        text,
        line: idx + 1,
        slug: text
          .toLowerCase()
          .replace(/[^a-z0-9\s-]/g, '')
          .trim()
          .replace(/\s+/g, '-'),
      });
    }
  });
  return headings;
}

/**
 * Generate a Markdown table-of-contents from H2/H3 headings.
 * Returns an empty string when fewer than two qualifying headings exist.
 */
export function generateTableOfContents(markdown: string): string {
  const headings = extractHeadings(markdown).filter((h) => h.level >= 2 && h.level <= 3);
  if (headings.length < 2) return '';
  const lines = headings.map((h) => {
    const indent = '  '.repeat(h.level - 2);
    return `${indent}- [${h.text}](#${h.slug})`;
  });
  return `## Table of Contents\n\n${lines.join('\n')}`;
}

/**
 * Repair common Markdown defects:
 *  - normalize heading spacing (`##Title` → `## Title`)
 *  - ensure blank lines around headings and fenced code
 *  - collapse 3+ blank lines
 *  - close an unterminated final code fence
 *  - trim trailing whitespace
 */
export function fixMarkdown(markdown: string): { fixed: string; changes: string[] } {
  const changes: string[] = [];
  let text = markdown.replace(/\r\n/g, '\n');

  const before = text;
  text = text.replace(/^(#{1,6})([^#\s])/gm, '$1 $2');
  if (text !== before) changes.push('Added missing space after heading markers');

  const trailing = text;
  text = text.replace(/[ \t]+$/gm, '');
  if (text !== trailing) changes.push('Removed trailing whitespace');

  // Blank line before headings (except at start of doc).
  text = text.replace(/([^\n])\n(#{1,6}\s)/g, '$1\n\n$2');

  // Collapse excessive blank lines.
  const collapsed = text;
  text = text.replace(/\n{3,}/g, '\n\n');
  if (text !== collapsed) changes.push('Collapsed excessive blank lines');

  // Close an odd number of code fences.
  const fenceCount = (text.match(/^```/gm) ?? []).length;
  if (fenceCount % 2 !== 0) {
    text = `${text.replace(/\n*$/, '')}\n\`\`\`\n`;
    changes.push('Closed an unterminated code fence');
  }

  text = `${text.trim()}\n`;
  return { fixed: text, changes };
}
