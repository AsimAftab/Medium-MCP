/**
 * Factory + enrichment helpers that turn raw inputs into a fully-populated
 * {@link Article}, keeping derived fields (html, plainText, seo) in sync.
 */
import type { Article, ArticleDraftInput } from '../types/index.js';
import { newId, nowIso } from './id.js';
import { markdownToHtml } from './markdown.js';
import {
  countWords,
  extractKeywords,
  fleschReadingEase,
  keywordDensity,
  readingTimeMinutes,
  slugify,
  toPlainText,
  truncateWords,
} from './text.js';
import type { Visibility } from '../types/index.js';

/** Recompute all derived fields (html, plainText, seo) for an article. */
export function enrichArticle(article: Article): Article {
  const keywords = article.seo.keywords.length
    ? article.seo.keywords
    : extractKeywords(article.markdown, 8);
  const plainText = toPlainText(article.markdown);
  const firstParagraph = plainText.split('\n\n')[0] ?? plainText;

  // Derived fields are always recomputed from the current title/body so an
  // update (e.g. retitle) can never leave a stale slug or meta description.
  const slug = slugify(article.title);
  return {
    ...article,
    slug,
    html: markdownToHtml(article.markdown),
    plainText,
    seo: {
      ...article.seo,
      keywords,
      slug,
      seoTitle: truncateWords(article.title, 60),
      metaDescription: truncateWords(firstParagraph.replace(/\n+/g, ' '), 158),
      wordCount: countWords(article.markdown),
      readingTimeMinutes: readingTimeMinutes(article.markdown),
      readabilityScore: fleschReadingEase(article.markdown),
      keywordDensity: keywordDensity(article.markdown, keywords),
    },
    updatedAt: nowIso(),
  };
}

/** Construct a new {@link Article} from user input, filling derived fields. */
export function createArticleFromInput(
  input: ArticleDraftInput,
  defaults: { visibility: Visibility; tags: string[]; publication?: string },
): Article {
  const now = nowIso();
  const base: Article = {
    id: newId('art'),
    title: input.title,
    subtitle: input.subtitle,
    slug: slugify(input.title),
    markdown: input.markdown,
    tags: input.tags?.length ? input.tags : defaults.tags,
    canonicalUrl: input.canonicalUrl,
    publishStatus: input.publishStatus ?? 'draft',
    isDraft: (input.publishStatus ?? 'draft') === 'draft',
    featuredImageUrl: input.featuredImageUrl,
    license: input.license,
    publication: input.publication ?? defaults.publication,
    visibility: input.visibility ?? defaults.visibility,
    createdAt: now,
    updatedAt: now,
    seo: {
      keywords: [],
      readingTimeMinutes: 0,
      wordCount: 0,
    },
  };
  return enrichArticle(base);
}
