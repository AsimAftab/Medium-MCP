import { describe, it, expect } from 'vitest';
import {
  parseMarkdownTables,
  renderTextTable,
  convertTablesForMedium,
  cellToPlainText,
} from '../src/utils/tables.js';

const SIMPLE = [
  '| Name | Role |',
  '| --- | --- |',
  '| Ada | Engineer |',
  '| Grace | Admiral |',
].join('\n');

describe('tables', () => {
  it('parses a simple GFM table', () => {
    const tables = parseMarkdownTables(SIMPLE);
    expect(tables).toHaveLength(1);
    expect(tables[0]!.header).toEqual(['Name', 'Role']);
    expect(tables[0]!.rows).toEqual([
      ['Ada', 'Engineer'],
      ['Grace', 'Admiral'],
    ]);
  });

  it('honors alignment markers', () => {
    const tables = parseMarkdownTables('| a | b | c |\n| :--- | :---: | ---: |\n| 1 | 2 | 3 |');
    expect(tables[0]!.alignments).toEqual(['left', 'center', 'right']);
  });

  it('ignores pipes inside code fences', () => {
    const md = '```\n| not | a table |\n| --- | --- |\n```\n';
    expect(parseMarkdownTables(md)).toHaveLength(0);
  });

  it('handles escaped pipes and inline code in cells', () => {
    const md = '| Expr | Meaning |\n| --- | --- |\n| `a \\| b` | pipe or |';
    const tables = parseMarkdownTables(md);
    expect(tables[0]!.rows[0]![0]).toBe('`a | b`');
  });

  it('pads short rows and truncates long rows to header width', () => {
    const md = '| a | b |\n| --- | --- |\n| only |\n| x | y | extra |';
    const tables = parseMarkdownTables(md);
    expect(tables[0]!.rows).toEqual([
      ['only', ''],
      ['x', 'y'],
    ]);
  });

  it('renders a box-drawing table', () => {
    const rendered = renderTextTable(parseMarkdownTables(SIMPLE)[0]!);
    expect(rendered).toContain('┌');
    expect(rendered).toContain('│ Name');
    expect(rendered).toContain('┴');
    // All lines are equally wide.
    const widths = new Set(rendered.split('\n').map((l) => l.length));
    expect(widths.size).toBe(1);
  });

  it('wraps very wide tables instead of overflowing', () => {
    const long = 'word '.repeat(40).trim();
    const md = `| A | B |\n| --- | --- |\n| ${long} | ${long} |`;
    const rendered = renderTextTable(parseMarkdownTables(md)[0]!);
    for (const line of rendered.split('\n')) {
      expect(line.length).toBeLessThanOrEqual(100);
    }
  });

  it('strips inline markdown from cells', () => {
    expect(cellToPlainText('**bold** and [link](https://x.dev) and `code`')).toBe(
      'bold and link and code',
    );
  });

  it('converts tables to fenced code blocks and leaves prose alone', () => {
    const md = `Intro paragraph.\n\n${SIMPLE}\n\nOutro paragraph.`;
    const { converted, tableCount } = convertTablesForMedium(md);
    expect(tableCount).toBe(1);
    expect(converted).toContain('Intro paragraph.');
    expect(converted).toContain('Outro paragraph.');
    expect(converted).toContain('```\n┌');
    expect(converted).not.toContain('| --- |');
  });

  it('converts multiple tables independently', () => {
    const md = `${SIMPLE}\n\nBetween.\n\n| X |\n| --- |\n| 1 |`;
    const { converted, tableCount } = convertTablesForMedium(md);
    expect(tableCount).toBe(2);
    expect(converted).toContain('Between.');
    expect((converted.match(/┌/g) ?? []).length).toBe(2);
  });

  it('is a no-op for table-free markdown', () => {
    const md = '# Title\n\nJust text with a | pipe in prose? No.\n';
    const { converted, tableCount } = convertTablesForMedium(md);
    expect(tableCount).toBe(0);
    expect(converted).toBe(md);
  });
});
