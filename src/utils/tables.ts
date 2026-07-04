/**
 * GFM table handling for Medium.
 *
 * Medium's editor has no native table support: `<table>` markup in pasted HTML
 * is silently stripped, losing the content entirely. The reliable, widely used
 * workaround is to render tables as fixed-width text inside a code block,
 * which Medium preserves verbatim.
 *
 * This module parses GitHub-flavored Markdown tables (outside code fences) and
 * re-renders them as Unicode box-drawing tables wrapped in a fenced code
 * block. Column alignment markers (`:---`, `:---:`, `---:`) are honored.
 * All functions are pure.
 */

export type ColumnAlignment = 'left' | 'center' | 'right';

export interface ParsedTable {
  header: string[];
  alignments: ColumnAlignment[];
  rows: string[][];
  /** 0-based line index of the first table line in the source. */
  startLine: number;
  /** 0-based line index one past the last table line. */
  endLine: number;
}

/** Split a GFM table row into trimmed cells, honoring escaped pipes (`\|`). */
function splitRow(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let escaped = false;
  let inCode = false;
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  for (const ch of trimmed) {
    if (escaped) {
      current += ch;
      escaped = false;
    } else if (ch === '\\') {
      escaped = true;
    } else if (ch === '`') {
      inCode = !inCode;
      current += ch;
    } else if (ch === '|' && !inCode) {
      cells.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  cells.push(current.trim());
  return cells;
}

/** Whether a line is a GFM delimiter row like `| :--- | ---: |`. */
function isDelimiterRow(line: string): boolean {
  const stripped = line.trim();
  // Requiring a pipe distinguishes delimiter rows from `---` horizontal rules.
  if (!stripped.includes('-') || !stripped.includes('|')) return false;
  const cells = splitRow(stripped);
  return cells.length > 0 && cells.every((c) => /^:?-+:?$/.test(c));
}

function parseAlignments(delimiter: string, columns: number): ColumnAlignment[] {
  const cells = splitRow(delimiter);
  const alignments = cells.map<ColumnAlignment>((c) => {
    const left = c.startsWith(':');
    const right = c.endsWith(':');
    if (left && right) return 'center';
    if (right) return 'right';
    return 'left';
  });
  while (alignments.length < columns) alignments.push('left');
  return alignments.slice(0, columns);
}

/** A table row candidate: contains an unescaped pipe and is not blank. */
function looksLikeRow(line: string): boolean {
  return /(^|[^\\])\|/.test(line) && line.trim().length > 0;
}

/** Strip inline Markdown from a cell so it reads cleanly as plain text. */
export function cellToPlainText(cell: string): string {
  let text = cell;
  text = text.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1');
  text = text.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
  text = text.replace(/`([^`]*)`/g, '$1');
  text = text.replace(/(\*\*|__)(.*?)\1/g, '$2');
  text = text.replace(/(\*|_)(.*?)\1/g, '$2');
  text = text.replace(/~~(.*?)~~/g, '$1');
  text = text.replace(/<br\s*\/?>/gi, ' ');
  text = text.replace(/<[^>]+>/g, '');
  return text.trim();
}

/**
 * Find all GFM tables in a Markdown document, skipping fenced code blocks.
 * A table is a header row followed by a delimiter row and zero or more body rows.
 */
export function parseMarkdownTables(markdown: string): ParsedTable[] {
  const lines = markdown.split('\n');
  const tables: ParsedTable[] = [];
  let inFence = false;
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      i += 1;
      continue;
    }
    if (inFence || !looksLikeRow(line) || !isDelimiterRow(lines[i + 1] ?? '')) {
      i += 1;
      continue;
    }
    const header = splitRow(line);
    const alignments = parseAlignments(lines[i + 1]!, header.length);
    const rows: string[][] = [];
    let j = i + 2;
    while (j < lines.length && looksLikeRow(lines[j]!) && !/^\s*(```|~~~)/.test(lines[j]!)) {
      const cells = splitRow(lines[j]!);
      while (cells.length < header.length) cells.push('');
      rows.push(cells.slice(0, header.length));
      j += 1;
    }
    tables.push({ header, alignments, rows, startLine: i, endLine: j });
    i = j;
  }
  return tables;
}

function pad(text: string, width: number, alignment: ColumnAlignment): string {
  const gap = Math.max(0, width - text.length);
  if (alignment === 'right') return ' '.repeat(gap) + text;
  if (alignment === 'center') {
    const left = Math.floor(gap / 2);
    return ' '.repeat(left) + text + ' '.repeat(gap - left);
  }
  return text + ' '.repeat(gap);
}

/** Hard-wrap a cell's text to `width`, breaking on spaces where possible. */
function wrapCell(text: string, width: number): string[] {
  if (text.length <= width) return [text];
  const words = text.split(/\s+/);
  const rows: string[] = [];
  let current = '';
  for (const word of words) {
    if (word.length > width) {
      if (current) {
        rows.push(current);
        current = '';
      }
      for (let k = 0; k < word.length; k += width) rows.push(word.slice(k, k + width));
      continue;
    }
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > width) {
      rows.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) rows.push(current);
  return rows.length > 0 ? rows : [''];
}

/** Maximum rendered line width before cells start word-wrapping. */
const MAX_TABLE_WIDTH = 96;

/**
 * Render a parsed table as a Unicode box-drawing table.
 *
 * Wide tables are word-wrapped per cell so the rendered text stays within
 * {@link MAX_TABLE_WIDTH} columns and remains readable on Medium.
 */
export function renderTextTable(table: ParsedTable): string {
  const columns = table.header.length;
  const cellRows = [table.header, ...table.rows].map((row) =>
    row.map((cell) => cellToPlainText(cell)),
  );

  const widths = Array.from({ length: columns }, (_, c) =>
    Math.max(1, ...cellRows.map((row) => (row[c] ?? '').length)),
  );

  // Shrink the widest columns until the table fits, then wrap cell text.
  const chrome = 3 * columns + 1; // borders and padding: │·cell·│…
  const available = Math.max(columns * 4, MAX_TABLE_WIDTH - chrome);
  while (widths.reduce((a, b) => a + b, 0) > available) {
    const widest = widths.indexOf(Math.max(...widths));
    widths[widest] = widths[widest]! - 1;
  }

  const line = (left: string, mid: string, right: string): string =>
    left + widths.map((w) => '─'.repeat(w + 2)).join(mid) + right;

  const renderRow = (cells: string[]): string[] => {
    const wrapped = cells.map((cell, c) => wrapCell(cell, widths[c]!));
    const height = Math.max(...wrapped.map((w) => w.length));
    const out: string[] = [];
    for (let r = 0; r < height; r += 1) {
      const parts = wrapped.map((w, c) =>
        pad(w[r] ?? '', widths[c]!, table.alignments[c] ?? 'left'),
      );
      out.push(`│ ${parts.join(' │ ')} │`);
    }
    return out;
  };

  const out: string[] = [];
  out.push(line('┌', '┬', '┐'));
  out.push(...renderRow(cellRows[0]!));
  out.push(line('├', '┼', '┤'));
  for (const row of cellRows.slice(1)) out.push(...renderRow(row));
  out.push(line('└', '┴', '┘'));
  return out.join('\n');
}

/**
 * Replace every GFM table in a Markdown document with a fenced code block
 * containing its box-drawing rendering, so the table survives Medium's
 * paste pipeline. Content inside existing code fences is left untouched.
 */
export function convertTablesForMedium(markdown: string): {
  converted: string;
  tableCount: number;
} {
  const tables = parseMarkdownTables(markdown);
  if (tables.length === 0) return { converted: markdown, tableCount: 0 };
  const lines = markdown.split('\n');
  // Replace from the bottom up so earlier line indices stay valid.
  for (const table of [...tables].reverse()) {
    const rendered = ['```', renderTextTable(table), '```'];
    lines.splice(table.startLine, table.endLine - table.startLine, ...rendered);
  }
  return { converted: lines.join('\n'), tableCount: tables.length };
}
