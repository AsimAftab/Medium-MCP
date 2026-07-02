import { describe, it, expect } from 'vitest';
import { analyzeSeo, runQualityChecks, scoreArticle, analyzeHeadings } from '../src/utils/seo.js';

const article = `## Introduction

This guide explains how to build AI agents that orchestrate tools reliably.

## Core concepts

You will learn about planning, tool use and verification.

\`\`\`ts
const x = 1;
\`\`\`

## Conclusion

Now you can build your own agents.`;

describe('SEO analysis', () => {
  it('produces a full report', () => {
    const report = analyzeSeo('Building AI Agents', article, ['agents']);
    expect(report.slug).toBe('building-ai-agents');
    expect(report.wordCount).toBeGreaterThan(0);
    expect(report.metaDescription.length).toBeLessThanOrEqual(159);
    expect(report.keywords).toContain('agents');
  });

  it('flags heading hierarchy skips', () => {
    const analysis = analyzeHeadings('# A\n\n#### D');
    expect(analysis.issues.some((i) => /jumps/.test(i.message))).toBe(true);
  });

  it('detects unbalanced code fences in quality checks', () => {
    const report = runQualityChecks('Title', '```js\ncode', { minWords: 0 });
    expect(report.passed).toBe(false);
    expect(report.issues.some((i) => i.check === 'code-formatting')).toBe(true);
  });

  it('flags empty image urls', () => {
    const report = runQualityChecks('Title', '![alt]()', { minWords: 0 });
    expect(report.issues.some((i) => i.check === 'image-links')).toBe(true);
  });

  it('scores an article between 0 and 100', () => {
    const score = scoreArticle('Building AI Agents', article);
    expect(score.overall).toBeGreaterThanOrEqual(0);
    expect(score.overall).toBeLessThanOrEqual(100);
    expect(score.breakdown.length).toBeGreaterThan(0);
  });
});
