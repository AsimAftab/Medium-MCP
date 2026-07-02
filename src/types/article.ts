/**
 * Core domain model for a Medium article.
 *
 * This is the transport-agnostic representation used throughout the server.
 * Services convert to/from provider-specific payloads (e.g. Medium API) and
 * MCP tools operate on this shape exclusively.
 */

/** Publish state as understood by Medium's API. */
export type PublishStatus = 'draft' | 'public' | 'unlisted';

/** Visibility is a superset alias kept for configuration ergonomics. */
export type Visibility = 'public' | 'unlisted' | 'private';

/** Supported content licenses recognized by Medium. */
export type License =
  | 'all-rights-reserved'
  | 'cc-40-by'
  | 'cc-40-by-sa'
  | 'cc-40-by-nd'
  | 'cc-40-by-nc'
  | 'cc-40-by-nc-nd'
  | 'cc-40-by-nc-sa'
  | 'cc-40-zero'
  | 'public-domain';

/** SEO metadata derived from (or attached to) an article. */
export interface SeoMetadata {
  /** SEO-optimized title (may differ from display title). */
  seoTitle?: string;
  /** Meta description, ideally 140–160 chars. */
  metaDescription?: string;
  /** Primary + secondary target keywords. */
  keywords: string[];
  /** URL slug derived from the title. */
  slug?: string;
  /** Estimated reading time in minutes. */
  readingTimeMinutes: number;
  /** Total word count. */
  wordCount: number;
  /** Keyword density map (keyword -> percentage of total words). */
  keywordDensity?: Record<string, number>;
  /** Flesch reading-ease score (0–100, higher = easier). */
  readabilityScore?: number;
}

/**
 * The internal article model. Every field the specification requires is
 * represented; optional fields are populated as tools enrich the article.
 */
export interface Article {
  /** Stable local identifier (uuid-like). Distinct from Medium's post id. */
  id: string;
  /** Medium post id once published; undefined for local-only drafts. */
  mediumId?: string;
  title: string;
  subtitle?: string;
  slug?: string;
  /** Canonical source content in Markdown. */
  markdown: string;
  /** Rendered HTML (Medium-compatible). */
  html?: string;
  /** Plain-text projection (no markup). */
  plainText?: string;
  tags: string[];
  /** Canonical URL for cross-posting / SEO. */
  canonicalUrl?: string;
  /** Live URL on Medium once published. */
  url?: string;
  publishStatus: PublishStatus;
  /** True while the article has never been published. */
  isDraft: boolean;
  featuredImageUrl?: string;
  license?: License;
  createdAt: string;
  updatedAt: string;
  /** Target Medium publication id or slug. */
  publication?: string;
  visibility: Visibility;
  seo: SeoMetadata;
}

/** A single stored revision used by version-history features. */
export interface ArticleRevision {
  revisionId: string;
  articleId: string;
  createdAt: string;
  /** Human note describing the change (e.g. "autosave", "rewrite:technical"). */
  note: string;
  snapshot: Article;
}

/** Input shape used when constructing a fresh article. */
export interface ArticleDraftInput {
  title: string;
  markdown: string;
  subtitle?: string;
  tags?: string[];
  publication?: string;
  publishStatus?: PublishStatus;
  visibility?: Visibility;
  canonicalUrl?: string;
  featuredImageUrl?: string;
  license?: License;
}
