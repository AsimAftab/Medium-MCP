import { describe, it, expect } from 'vitest';
import {
  markdownToHtml,
  htmlToMarkdown,
  extractHeadings,
  generateTableOfContents,
  fixMarkdown,
} from '../src/utils/markdown.js';

describe('markdown utilities', () => {
  it('converts markdown to html', () => {
    expect(markdownToHtml('# Hi')).toContain('<h1>Hi</h1>');
  });

  it('round-trips html to markdown', () => {
    const md = htmlToMarkdown('<h2>Title</h2><p>Hello <strong>world</strong></p>');
    expect(md).toContain('## Title');
    expect(md).toContain('**world**');
  });

  it('extracts headings with levels and ignores fenced code', () => {
    const headings = extractHeadings('# A\n\n```\n# not a heading\n```\n\n## B');
    expect(headings.map((h) => h.text)).toEqual(['A', 'B']);
    expect(headings[1]?.level).toBe(2);
  });

  it('builds a table of contents from h2/h3', () => {
    const toc = generateTableOfContents('## One\ntext\n## Two\ntext');
    expect(toc).toContain('Table of Contents');
    expect(toc).toContain('[One](#one)');
  });

  it('converts markdown tables to html', () => {
    const html = markdownToHtml('| a | b |\n| --- | --- |\n| 1 | 2 |');
    expect(html).toContain('<table>');
    expect(html).toContain('<th>a</th>');
    expect(html).toContain('<td>2</td>');
  });

  it('converts html tables back to GFM markdown', () => {
    const md = htmlToMarkdown(
      '<table><thead><tr><th>Name</th><th>Role</th></tr></thead>' +
        '<tbody><tr><td>Ada</td><td>Engineer</td></tr></tbody></table>',
    );
    expect(md).toContain('| Name | Role |');
    expect(md).toContain('| --- | --- |');
    expect(md).toContain('| Ada | Engineer |');
  });

  it('repairs malformed markdown', () => {
    const { fixed, changes } = fixMarkdown('##Heading\n\n\n\n```js\ncode');
    expect(fixed).toContain('## Heading');
    expect(fixed.match(/```/g)?.length).toBe(2); // fence closed
    expect(changes.length).toBeGreaterThan(0);
  });

  it('never touches content inside code fences when repairing', () => {
    const src = '# Title\n\n```c\n#include <stdio.h>\n#!shebang\n\n\n\nint x;\n```\n';
    const { fixed } = fixMarkdown(src);
    expect(fixed).toContain('#include <stdio.h>');
    expect(fixed).toContain('#!shebang');
    expect(fixed).toContain('\n\n\n\nint x;'); // blank lines in code preserved
  });
});
