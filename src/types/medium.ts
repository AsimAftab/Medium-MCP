/**
 * Types describing the data the browser-based Medium backend produces.
 *
 * Medium's public REST API (api.medium.com/v1) was closed to new integrations,
 * so publishing is performed by automating the Medium web editor. These types
 * model the values scraped back from the browser (user profile, publications,
 * the created post) rather than a REST response body.
 */

export interface MediumUser {
  id: string;
  username: string;
  name: string;
  url: string;
  imageUrl: string;
}

export interface MediumPublication {
  id: string;
  name: string;
  description: string;
  url: string;
  imageUrl: string;
}

export type MediumContentFormat = 'html' | 'markdown';

export type MediumPublishStatus = 'public' | 'draft' | 'unlisted';

/** Everything needed to compose and publish a post via the editor. */
export interface CreatePostRequest {
  title: string;
  contentFormat: MediumContentFormat;
  content: string;
  tags?: string[];
  canonicalUrl?: string;
  publishStatus?: MediumPublishStatus;
  license?: string;
  notifyFollowers?: boolean;
  publicationId?: string;
}

/** The result of publishing, read back from the editor / post page. */
export interface MediumPost {
  id: string;
  title: string;
  authorId: string;
  tags: string[];
  url: string;
  canonicalUrl: string;
  publishStatus: MediumPublishStatus;
  publishedAt?: number;
  license: string;
  licenseUrl: string;
}
