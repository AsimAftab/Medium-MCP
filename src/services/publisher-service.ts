/**
 * Orchestrates publishing: runs pre-publish quality gates, converts content,
 * calls the Medium API, and mirrors the published result into the local store.
 */
import { MediumService } from './medium-service.js';
import { DraftStore } from './draft-store.js';
import { markdownToHtml } from '../utils/markdown.js';
import { runQualityChecks, type QualityReport } from '../utils/seo.js';
import { ValidationError } from '../utils/errors.js';
import { nowIso } from '../utils/id.js';
import type { Logger } from '../utils/logger.js';
import type { Article, CreatePostRequest, MediumPost } from '../types/index.js';

export interface PublishOptions {
  /** Skip the quality gate even if it reports blocking errors. */
  force?: boolean;
  /** Notify followers on publish (Medium flag). */
  notifyFollowers?: boolean;
  /** Minimum word count enforced by the quality gate. */
  minWords?: number;
}

export interface PublishResult {
  article: Article;
  post: MediumPost;
  quality: QualityReport;
}

export class PublisherService {
  constructor(
    private medium: MediumService,
    private store: DraftStore,
    private logger: Logger,
  ) {}

  /**
   * Publish an article to Medium after passing quality checks.
   * @throws {ValidationError} when the quality gate fails and `force` is false.
   */
  async publish(article: Article, options: PublishOptions = {}): Promise<PublishResult> {
    const quality = runQualityChecks(article.title, article.markdown, {
      minWords: options.minWords,
    });

    if (!quality.passed && !options.force) {
      const errors = quality.issues.filter((i) => i.severity === 'error');
      throw new ValidationError(
        `Pre-publish quality checks failed with ${errors.length} blocking issue(s). Pass force=true to override.`,
        quality,
      );
    }

    const request: CreatePostRequest = {
      title: article.title,
      contentFormat: 'markdown',
      content: this.composeContent(article),
      tags: article.tags.slice(0, 5),
      publishStatus:
        article.publishStatus === 'draft'
          ? 'draft'
          : article.publishStatus === 'unlisted'
            ? 'unlisted'
            : 'public',
      ...(article.canonicalUrl ? { canonicalUrl: article.canonicalUrl } : {}),
      ...(article.license ? { license: article.license } : {}),
      ...(article.publication ? { publicationId: article.publication } : {}),
      notifyFollowers: options.notifyFollowers ?? false,
    };

    const post = await this.medium.createPost(request);

    const published: Article = {
      ...article,
      mediumId: post.id,
      url: post.url,
      canonicalUrl: post.canonicalUrl || article.canonicalUrl,
      publishStatus: article.publishStatus,
      isDraft: post.publishStatus === 'draft',
      html: markdownToHtml(article.markdown),
      updatedAt: nowIso(),
    };

    // Mirror into the local store (create or update).
    const existing = await this.store.find(published.id);
    if (existing) {
      await this.store.update(published, `publish:${post.publishStatus}`);
    } else {
      await this.store.create(published);
    }

    this.logger.info('Published article', {
      articleId: published.id,
      mediumId: post.id,
      status: post.publishStatus,
      url: post.url,
    });

    return { article: published, post, quality };
  }

  /**
   * Compose the Markdown sent to Medium. Medium renders the first H1 as the
   * title, so we prepend the title and optional subtitle for correct display.
   */
  private composeContent(article: Article): string {
    const parts: string[] = [`# ${article.title}`];
    if (article.subtitle) parts.push(`\n*${article.subtitle}*`);
    if (article.featuredImageUrl) {
      parts.push(`\n![${article.title}](${article.featuredImageUrl})`);
    }
    parts.push(`\n${article.markdown.trim()}`);
    return parts.join('\n');
  }
}
