import { describe, it, expect } from 'vitest';
import {
  parseSections,
  findSection,
  replaceSection,
  deleteSection,
  insertSection,
  moveSection,
  renameHeading,
} from '../src/utils/sections.js';

const doc = `## Intro

Intro body.

## Details

Details body.

## Conclusion

Wrap up.`;

describe('section manipulation', () => {
  it('parses top-level sections', () => {
    const sections = parseSections(doc);
    expect(sections.map((s) => s.heading)).toEqual(['Intro', 'Details', 'Conclusion']);
  });

  it('finds a section case-insensitively', () => {
    expect(findSection(doc, 'details')?.heading).toBe('Details');
  });

  it('replaces a section body', () => {
    const out = replaceSection(doc, 'Details', 'New details.');
    expect(out).toContain('New details.');
    expect(out).not.toContain('Details body.');
  });

  it('deletes a section', () => {
    const out = deleteSection(doc, 'Details');
    expect(out).not.toContain('Details body.');
    expect(out).toContain('Intro body.');
  });

  it('inserts a section after an anchor', () => {
    const out = insertSection(doc, 'Setup', 'Install it.', 2, 'Intro', 'after');
    expect(out).toContain('## Setup');
    expect(out.indexOf('Setup')).toBeGreaterThan(out.indexOf('Intro'));
    expect(out.indexOf('Setup')).toBeLessThan(out.indexOf('Details'));
  });

  it('moves a section', () => {
    const out = moveSection(doc, 'Conclusion', 'Intro', 'after');
    expect(out.indexOf('Conclusion')).toBeLessThan(out.indexOf('Details'));
  });

  it('renames a heading preserving body', () => {
    const out = renameHeading(doc, 'Intro', 'Overview');
    expect(out).toContain('## Overview');
    expect(out).toContain('Intro body.');
  });

  it('throws for a missing section', () => {
    expect(() => deleteSection(doc, 'Nope')).toThrow();
  });
});
