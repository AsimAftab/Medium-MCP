import { describe, it, expect } from 'vitest';
import {
  countWords,
  readingTimeMinutes,
  slugify,
  fleschReadingEase,
  extractKeywords,
  keywordDensity,
  toPlainText,
  truncateWords,
} from '../src/utils/text.js';

describe('text utilities', () => {
  it('counts words ignoring markdown syntax', () => {
    expect(countWords('# Hello world\n\nThis is **bold** text.')).toBe(6);
  });

  it('strips markdown to plain text', () => {
    const plain = toPlainText('# Title\n\n[link](http://x.com) and `code`');
    expect(plain).not.toContain('#');
    expect(plain).toContain('link');
    expect(plain).not.toContain('http://x.com');
  });

  it('estimates reading time (min 1 for non-empty)', () => {
    expect(readingTimeMinutes('one two three')).toBe(1);
    expect(readingTimeMinutes('')).toBe(0);
  });

  it('slugifies titles', () => {
    expect(slugify('Hello, World! A Guide')).toBe('hello-world-a-guide');
    expect(slugify('  Spaces   &  Symbols?? ')).toBe('spaces-symbols');
  });

  it('computes a bounded readability score', () => {
    const score = fleschReadingEase('The cat sat on the mat. It was warm.');
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('extracts keywords excluding stopwords', () => {
    const kws = extractKeywords('agents agents agents workflow workflow orchestration', 3);
    expect(kws[0]).toBe('agents');
    expect(kws).toContain('workflow');
  });

  it('computes keyword density', () => {
    const density = keywordDensity('agents agents build agents', ['agents']);
    expect(density.agents).toBeCloseTo(75, 0);
  });

  it('truncates on word boundary with ellipsis', () => {
    const out = truncateWords('the quick brown fox jumps', 12);
    expect(out.endsWith('…')).toBe(true);
    expect(out.length).toBeLessThanOrEqual(13);
  });
});
