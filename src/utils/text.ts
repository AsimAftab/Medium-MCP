/**
 * Deterministic text-analysis helpers: word counts, reading time, readability,
 * slugs, and plain-text extraction. These power the SEO and quality tools
 * without any external dependency or LLM call.
 */

/** Average adult reading speed (words/minute) used for estimates. */
export const WORDS_PER_MINUTE = 225;

/** Strip Markdown formatting to a rough plain-text projection. */
export function toPlainText(markdown: string): string {
  let text = markdown;
  // Preserve link text, drop the URL.
  text = text.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
  text = text.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ');
  text = text.replace(/`{3}[\s\S]*?`{3}/g, ' ');
  text = text.replace(/`([^`]*)`/g, '$1');
  text = text.replace(/^#{1,6}\s+/gm, '');
  text = text.replace(/^\s{0,3}>\s?/gm, '');
  text = text.replace(/[*_~]+/g, '');
  text = text.replace(/^\s*[-+*]\s+/gm, '');
  text = text.replace(/\n{2,}/g, '\n\n');
  return text.trim();
}

/** Count words in a string (Markdown-aware). */
export function countWords(markdown: string): number {
  const plain = toPlainText(markdown);
  if (!plain) return 0;
  return plain.split(/\s+/).filter(Boolean).length;
}

/** Estimate reading time in whole minutes (minimum 1 for non-empty text). */
export function readingTimeMinutes(markdown: string): number {
  const words = countWords(markdown);
  if (words === 0) return 0;
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}

/** Count sentences using terminal punctuation heuristics. */
export function countSentences(text: string): number {
  const matches = text.match(/[^.!?]+[.!?]+/g);
  return matches ? matches.length : text.trim() ? 1 : 0;
}

/** Approximate syllables in a word (heuristic; good enough for readability). */
export function countSyllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (w.length <= 3) return w.length ? 1 : 0;
  const groups = w
    .replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '')
    .replace(/^y/, '')
    .match(/[aeiouy]{1,2}/g);
  return groups ? groups.length : 1;
}

/**
 * Flesch reading-ease score (0–100). Higher is easier to read.
 * 90–100 = very easy, 60–70 = plain English, 0–30 = very difficult.
 */
export function fleschReadingEase(markdown: string): number {
  const text = toPlainText(markdown);
  const words = text.split(/\s+/).filter(Boolean);
  const sentences = Math.max(1, countSentences(text));
  const syllables = words.reduce((sum, w) => sum + countSyllables(w), 0);
  if (words.length === 0) return 0;
  const score =
    206.835 - 1.015 * (words.length / sentences) - 84.6 * (syllables / words.length);
  return Math.max(0, Math.min(100, Math.round(score * 10) / 10));
}

/** Map a Flesch score to a US grade-level label. */
export function readingLevelLabel(score: number): string {
  if (score >= 90) return '5th grade — very easy';
  if (score >= 80) return '6th grade — easy';
  if (score >= 70) return '7th grade — fairly easy';
  if (score >= 60) return '8th–9th grade — plain English';
  if (score >= 50) return '10th–12th grade — fairly difficult';
  if (score >= 30) return 'College — difficult';
  return 'College graduate — very difficult';
}

/** Convert a title into a URL-safe slug. */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

/** Truncate text on a word boundary, appending an ellipsis if cut. */
export function truncateWords(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const clipped = text.slice(0, maxChars);
  const lastSpace = clipped.lastIndexOf(' ');
  return `${clipped.slice(0, lastSpace > 0 ? lastSpace : maxChars).trim()}…`;
}

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'of', 'to', 'in', 'on', 'for', 'with',
  'as', 'by', 'at', 'from', 'is', 'are', 'was', 'were', 'be', 'been', 'this',
  'that', 'these', 'those', 'it', 'its', 'if', 'then', 'so', 'than', 'too',
  'you', 'your', 'we', 'our', 'they', 'their', 'can', 'will', 'just', 'not',
  'have', 'has', 'had', 'do', 'does', 'about', 'into', 'over', 'more', 'most',
]);

/** Extract the most frequent non-stopword keywords from text. */
export function extractKeywords(markdown: string, limit = 10): string[] {
  const words = toPlainText(markdown)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOP_WORDS.has(w));
  const freq = new Map<string, number>();
  for (const w of words) freq.set(w, (freq.get(w) ?? 0) + 1);
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([w]) => w);
}

/** Compute keyword density (% of total words) for the given keywords. */
export function keywordDensity(
  markdown: string,
  keywords: string[],
): Record<string, number> {
  const words = toPlainText(markdown).toLowerCase().split(/\s+/).filter(Boolean);
  const total = words.length || 1;
  const density: Record<string, number> = {};
  for (const kw of keywords) {
    const needle = kw.toLowerCase();
    const count = words.filter((w) => w.replace(/[^a-z0-9]/g, '') === needle).length;
    density[kw] = Math.round((count / total) * 10000) / 100;
  }
  return density;
}
