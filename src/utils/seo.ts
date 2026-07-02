/**
 * SEO analysis and quality-check utilities operating on Markdown.
 */
import { extractHeadings, type Heading } from './markdown.js';
import {
  countWords,
  extractKeywords,
  fleschReadingEase,
  keywordDensity,
  readingLevelLabel,
  readingTimeMinutes,
  slugify,
  toPlainText,
  truncateWords,
} from './text.js';

export interface HeadingIssue {
  line: number;
  message: string;
  severity: 'error' | 'warning';
}

export interface HeadingAnalysis {
  count: number;
  outline: Heading[];
  issues: HeadingIssue[];
}

/** Analyze heading hierarchy for skips, duplicates and multiple H1s. */
export function analyzeHeadings(markdown: string): HeadingAnalysis {
  const outline = extractHeadings(markdown);
  const issues: HeadingIssue[] = [];
  const seen = new Map<string, number>();
  let previousLevel = 0;
  let h1Count = 0;

  for (const h of outline) {
    if (h.level === 1) h1Count += 1;
    if (previousLevel && h.level - previousLevel > 1) {
      issues.push({
        line: h.line,
        severity: 'warning',
        message: `Heading level jumps from H${previousLevel} to H${h.level}`,
      });
    }
    const key = h.text.toLowerCase();
    seen.set(key, (seen.get(key) ?? 0) + 1);
    previousLevel = h.level;
  }

  if (h1Count > 1) {
    issues.push({
      line: 1,
      severity: 'warning',
      message: `Found ${h1Count} H1 headings; Medium derives the title from the first.`,
    });
  }
  for (const [text, count] of seen) {
    if (count > 1) {
      issues.push({
        line: 0,
        severity: 'warning',
        message: `Duplicate heading "${text}" appears ${count} times`,
      });
    }
  }

  return { count: outline.length, outline, issues };
}

export interface SeoReport {
  seoTitle: string;
  metaDescription: string;
  slug: string;
  keywords: string[];
  keywordDensity: Record<string, number>;
  wordCount: number;
  readingTimeMinutes: number;
  readabilityScore: number;
  readingLevel: string;
  headingAnalysis: HeadingAnalysis;
  suggestions: string[];
}

/** Produce a full SEO report for an article. */
export function analyzeSeo(
  title: string,
  markdown: string,
  focusKeywords: string[] = [],
): SeoReport {
  const keywords = focusKeywords.length
    ? focusKeywords
    : extractKeywords(markdown, 8);
  const wordCount = countWords(markdown);
  const readability = fleschReadingEase(markdown);
  const plain = toPlainText(markdown);
  const firstParagraph = plain.split('\n\n')[0] ?? plain;

  const suggestions: string[] = [];
  if (title.length > 60) {
    suggestions.push('Title exceeds 60 characters; it may be truncated in search results.');
  }
  if (title.length < 20) {
    suggestions.push('Title is quite short; consider a more descriptive, keyword-rich title.');
  }
  if (wordCount < 700) {
    suggestions.push('Article is under 700 words; longer posts tend to rank better on Medium.');
  }
  if (readability < 50) {
    suggestions.push('Readability is low; shorten sentences and prefer simpler words.');
  }
  if (!keywords.some((k) => title.toLowerCase().includes(k.toLowerCase()))) {
    suggestions.push('Primary keyword is missing from the title.');
  }
  const headingAnalysis = analyzeHeadings(markdown);
  if (headingAnalysis.count < 3 && wordCount > 600) {
    suggestions.push('Add more section headings to improve structure and skimmability.');
  }

  return {
    seoTitle: truncateWords(title, 60),
    metaDescription: truncateWords(firstParagraph.replace(/\n+/g, ' '), 158),
    slug: slugify(title),
    keywords,
    keywordDensity: keywordDensity(markdown, keywords),
    wordCount,
    readingTimeMinutes: readingTimeMinutes(markdown),
    readabilityScore: readability,
    readingLevel: readingLevelLabel(readability),
    headingAnalysis,
    suggestions,
  };
}

export interface QualityIssue {
  check: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
}

export interface QualityReport {
  passed: boolean;
  score: number;
  issues: QualityIssue[];
}

export interface QualityOptions {
  minWords?: number;
}

/**
 * Run pre-publish quality checks: heading hierarchy, code fences, image links,
 * duplicate headings, minimum length, and Markdown validity heuristics.
 */
export function runQualityChecks(
  title: string,
  markdown: string,
  options: QualityOptions = {},
): QualityReport {
  const minWords = options.minWords ?? 400;
  const issues: QualityIssue[] = [];

  if (!title.trim()) {
    issues.push({ check: 'title', severity: 'error', message: 'Title is empty.' });
  }

  const wordCount = countWords(markdown);
  if (wordCount < minWords) {
    issues.push({
      check: 'min-length',
      severity: 'warning',
      message: `Only ${wordCount} words (recommended minimum ${minWords}).`,
    });
  }

  // Unbalanced code fences.
  const fenceCount = (markdown.match(/^```/gm) ?? []).length;
  if (fenceCount % 2 !== 0) {
    issues.push({
      check: 'code-formatting',
      severity: 'error',
      message: 'Unbalanced code fences (```). One block is not closed.',
    });
  }

  // Broken / empty image links.
  const images = [...markdown.matchAll(/!\[[^\]]*\]\(([^)]*)\)/g)];
  for (const img of images) {
    const url = (img[1] ?? '').trim();
    if (!url) {
      issues.push({
        check: 'image-links',
        severity: 'error',
        message: 'Image with an empty URL found.',
      });
    } else if (!/^https?:\/\//.test(url) && !url.startsWith('/') && !url.startsWith('data:')) {
      issues.push({
        check: 'image-links',
        severity: 'warning',
        message: `Image URL may be invalid: ${url}`,
      });
    }
  }

  // Empty link targets.
  const emptyLinks = [...markdown.matchAll(/\[[^\]]+\]\(\s*\)/g)];
  if (emptyLinks.length) {
    issues.push({
      check: 'markdown-validity',
      severity: 'warning',
      message: `${emptyLinks.length} link(s) have an empty target.`,
    });
  }

  // Heading hierarchy + duplicates.
  const headingAnalysis = analyzeHeadings(markdown);
  for (const h of headingAnalysis.issues) {
    issues.push({ check: 'heading-hierarchy', severity: h.severity, message: h.message });
  }

  // Readability.
  const readability = fleschReadingEase(markdown);
  if (readability < 40) {
    issues.push({
      check: 'readability',
      severity: 'info',
      message: `Readability score is low (${readability}). Consider simplifying.`,
    });
  }

  const errorCount = issues.filter((i) => i.severity === 'error').length;
  const warningCount = issues.filter((i) => i.severity === 'warning').length;
  const score = Math.max(0, 100 - errorCount * 25 - warningCount * 8);

  return { passed: errorCount === 0, score, issues };
}

export interface ArticleScore {
  overall: number;
  seo: number;
  readability: number;
  structure: number;
  engagement: number;
  breakdown: string[];
}

/**
 * Score an article 0–100 across SEO, readability, structure and engagement.
 * A heuristic model intended as a directional signal, not a guarantee.
 */
export function scoreArticle(title: string, markdown: string): ArticleScore {
  const seoReport = analyzeSeo(title, markdown);
  const quality = runQualityChecks(title, markdown);
  const breakdown: string[] = [];

  const readability = Math.round(seoReport.readabilityScore);

  // SEO sub-score.
  let seo = 100;
  seo -= seoReport.suggestions.length * 10;
  seo = Math.max(0, seo);

  // Structure sub-score based on headings, lists and length.
  const headingCount = seoReport.headingAnalysis.count;
  const hasLists = /^\s*[-*+]\s+/m.test(markdown) || /^\s*\d+\.\s+/m.test(markdown);
  let structure = 40 + Math.min(40, headingCount * 8) + (hasLists ? 20 : 0);
  structure = Math.min(100, structure);

  // Engagement heuristic: questions, second person, examples, code, images.
  let engagement = 40;
  if (/\?/.test(markdown)) engagement += 10;
  if (/\byou\b/i.test(markdown)) engagement += 15;
  if (/```/.test(markdown)) engagement += 10;
  if (/!\[[^\]]*\]\(/.test(markdown)) engagement += 10;
  if (seoReport.wordCount >= 800 && seoReport.wordCount <= 2600) engagement += 15;
  engagement = Math.min(100, engagement);

  const overall = Math.round(
    seo * 0.3 + readability * 0.2 + structure * 0.25 + engagement * 0.25,
  );

  breakdown.push(`SEO ${seo}/100`, `Readability ${readability}/100`);
  breakdown.push(`Structure ${structure}/100`, `Engagement ${engagement}/100`);
  if (!quality.passed) breakdown.push('Quality checks reported blocking errors.');

  return { overall, seo, readability, structure, engagement, breakdown };
}
