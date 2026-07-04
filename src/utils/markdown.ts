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
  parentNode?: TurndownNode | null;
  childNodes?: ArrayLike<TurndownNode>;
  previousSibling?: TurndownNode | null;
}

// ── GFM table support (Turndown has none built in) ─────────────────────────

/** Number of `th`/`td` cells in the first row of the table containing `node`. */
function tableColumnCount(node: TurndownNode): number {
  let table: TurndownNode | null | undefined = node;
  while (table && table.nodeName !== 'TABLE') table = table.parentNode;
  const firstRow = table
    ? Array.from(table.childNodes ?? [])
        .flatMap((section) =>
          section.nodeName === 'TR' ? [section] : Array.from(section.childNodes ?? []),
        )
        .find((n) => n.nodeName === 'TR')
    : undefined;
  if (!firstRow) return 0;
  return Array.from(firstRow.childNodes ?? []).filter(
    (n) => n.nodeName === 'TH' || n.nodeName === 'TD',
  ).length;
}

/** Whether this row is the first row of its table (renders the delimiter). */
function isHeadingRow(row: TurndownNode): boolean {
  const parent = row.parentNode;
  if (!parent) return false;
  if (parent.nodeName === 'THEAD') return true;
  const table = parent.nodeName === 'TABLE' ? parent : parent.parentNode;
  if (!table || table.nodeName !== 'TABLE') return false;
  const rows = Array.from(table.childNodes ?? []).flatMap((section) =>
    section.nodeName === 'TR' ? [section] : Array.from(section.childNodes ?? []),
  );
  return rows.find((n) => n.nodeName === 'TR') === row;
}

turndown.addRule('tableCell', {
  filter: ['th', 'td'],
  replacement: (content, node): string => {
    const cell = node as unknown as TurndownNode;
    const prefix = cell.previousSibling ? ' ' : '| ';
    return `${prefix}${content.trim().replace(/\n+/g, ' ').replace(/\|/g, '\\|')} |`;
  },
});

turndown.addRule('tableRow', {
  filter: 'tr',
  replacement: (content, node): string => {
    const row = node as unknown as TurndownNode;
    let delimiter = '';
    if (isHeadingRow(row)) {
      const columns = tableColumnCount(row);
      delimiter = `\n|${' --- |'.repeat(columns)}`;
    }
    return `\n${content}${delimiter}`;
  },
});

turndown.addRule('table', {
  filter: 'table',
  replacement: (content): string => `\n\n${content.trim()}\n\n`,
});

turndown.addRule('tableSection', {
  filter: ['thead', 'tbody', 'tfoot'],
  replacement: (content): string => content,
});

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
  const changes = new Set<string>();
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  let inFence = false;
  let blankRun = 0;

  for (const rawLine of lines) {
    const isFenceMarker = /^\s*(```|~~~)/.test(rawLine);
    // Code blocks are copied verbatim — repairing "headings" or whitespace
    // inside them would corrupt code (e.g. `#include`, shebangs, comments).
    if (inFence || isFenceMarker) {
      out.push(rawLine);
      blankRun = 0;
      if (isFenceMarker) inFence = !inFence;
      continue;
    }

    let line = rawLine;
    const spaced = line.replace(/^(#{1,6})([^#\s])/, '$1 $2');
    if (spaced !== line) {
      changes.add('Added missing space after heading markers');
      line = spaced;
    }
    const trimmed = line.replace(/[ \t]+$/, '');
    if (trimmed !== line) {
      changes.add('Removed trailing whitespace');
      line = trimmed;
    }

    if (line === '') {
      blankRun += 1;
      if (blankRun >= 2) {
        changes.add('Collapsed excessive blank lines');
        continue;
      }
      out.push(line);
      continue;
    }

    // Blank line before headings (except at start of doc).
    if (/^#{1,6}\s/.test(line) && out.length > 0 && out[out.length - 1] !== '') {
      out.push('');
      changes.add('Added blank line before headings');
    }
    blankRun = 0;
    out.push(line);
  }

  if (inFence) {
    out.push('```');
    changes.add('Closed an unterminated code fence');
  }

  const text = `${out.join('\n').trim()}\n`;
  return { fixed: text, changes: [...changes] };
}
