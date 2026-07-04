/**
 * Deterministic section manipulation over Markdown documents.
 *
 * A "section" is a heading line plus the content up to (but not including) the
 * next heading of the same or higher level. These helpers back the editing
 * tools (insert/replace/delete/move/rename) without any model involvement.
 */
import { extractHeadings } from './markdown.js';

export interface Section {
  index: number;
  level: number;
  heading: string;
  /** Full section text including the heading line. */
  content: string;
  startLine: number;
  endLine: number;
}

/** Parse a document into its top-level+nested sections (flat list). */
export function parseSections(markdown: string): Section[] {
  const headings = extractHeadings(markdown);
  const lines = markdown.split('\n');
  const sections: Section[] = [];

  for (let i = 0; i < headings.length; i += 1) {
    const current = headings[i]!;
    const startLine = current.line;
    let endLine = lines.length;
    for (let j = i + 1; j < headings.length; j += 1) {
      if (headings[j]!.level <= current.level) {
        endLine = headings[j]!.line - 1;
        break;
      }
    }
    const content = lines.slice(startLine - 1, endLine).join('\n').trimEnd();
    sections.push({
      index: i,
      level: current.level,
      heading: current.text,
      content,
      startLine,
      endLine,
    });
  }
  return sections;
}

/** Case-insensitive lookup of a section by heading text. */
export function findSection(markdown: string, heading: string): Section | undefined {
  const target = heading.trim().toLowerCase();
  return parseSections(markdown).find((s) => s.heading.toLowerCase() === target);
}

function replaceRange(markdown: string, startLine: number, endLine: number, replacement: string): string {
  const lines = markdown.split('\n');
  const before = lines.slice(0, startLine - 1);
  const after = lines.slice(endLine);
  const middle = replacement === '' ? [] : replacement.split('\n');
  return [...before, ...middle, ...after].join('\n').replace(/\n{3,}/g, '\n\n');
}

/** Replace the body of a section (heading text preserved). */
export function replaceSection(markdown: string, heading: string, newContent: string): string {
  const section = findSection(markdown, heading);
  if (!section) throw new Error(`Section not found: ${heading}`);
  const headingLine = section.content.split('\n')[0]!;
  return replaceRange(markdown, section.startLine, section.endLine, `${headingLine}\n\n${newContent.trim()}`);
}

/** Delete a section entirely. */
export function deleteSection(markdown: string, heading: string): string {
  const section = findSection(markdown, heading);
  if (!section) throw new Error(`Section not found: ${heading}`);
  return replaceRange(markdown, section.startLine, section.endLine, '').trim() + '\n';
}

/**
 * Insert a new section relative to an anchor heading.
 * @param position 'before' | 'after' the anchor (default 'after'); when no
 *   anchor is given the section is appended to the end of the document.
 */
export function insertSection(
  markdown: string,
  newHeading: string,
  body: string,
  level = 2,
  anchorHeading?: string,
  position: 'before' | 'after' = 'after',
): string {
  const block = `${'#'.repeat(level)} ${newHeading}\n\n${body.trim()}`;
  if (!anchorHeading) {
    return `${markdown.trimEnd()}\n\n${block}\n`;
  }
  const section = findSection(markdown, anchorHeading);
  if (!section) throw new Error(`Anchor section not found: ${anchorHeading}`);
  const lines = markdown.split('\n');
  const at = position === 'before' ? section.startLine - 1 : section.endLine;
  const before = lines.slice(0, at);
  const after = lines.slice(at);
  return [...before, '', block, '', ...after].join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

/** Move a section before/after another section. */
export function moveSection(
  markdown: string,
  heading: string,
  anchorHeading: string,
  position: 'before' | 'after' = 'after',
): string {
  const section = findSection(markdown, heading);
  if (!section) throw new Error(`Section not found: ${heading}`);
  const withoutSection = deleteSection(markdown, heading);
  const headingLine = section.content.split('\n')[0]!;
  const body = section.content.split('\n').slice(1).join('\n').trim();
  return insertSection(
    withoutSection,
    headingLine.replace(/^#+\s+/, ''),
    body,
    section.level,
    anchorHeading,
    position,
  );
}

/** Rename a heading in place, preserving its body and level. */
export function renameHeading(markdown: string, oldHeading: string, newHeading: string): string {
  const section = findSection(markdown, oldHeading);
  if (!section) throw new Error(`Heading not found: ${oldHeading}`);
  const lines = markdown.split('\n');
  const headingLineIdx = section.startLine - 1;
  // Rebuild the line directly — using String.replace with an interpolated
  // replacement would let `$` sequences in the new heading corrupt the output.
  lines[headingLineIdx] = `${'#'.repeat(section.level)} ${newHeading.trim()}`;
  return lines.join('\n');
}
