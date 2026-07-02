import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DraftStore } from '../src/services/draft-store.js';
import { PublisherService } from '../src/services/publisher-service.js';
import { Logger } from '../src/utils/logger.js';
import { createArticleFromInput } from '../src/utils/article-factory.js';
import type { MediumService } from '../src/services/medium-service.js';
import type { MediumPost } from '../src/types/index.js';

const logger = new Logger({ level: 'error' });

/** A mock Medium API that records the last create request. */
function mockMedium() {
  const created: unknown[] = [];
  const post: MediumPost = {
    id: 'post_123',
    title: 'x',
    authorId: 'user_1',
    tags: [],
    url: 'https://medium.com/@me/post_123',
    canonicalUrl: '',
    publishStatus: 'public',
    license: 'all-rights-reserved',
    licenseUrl: '',
  };
  const service = {
    createPost: vi.fn(async (req: unknown) => {
      created.push(req);
      return post;
    }),
  } as unknown as MediumService;
  return { service, created, post };
}

const longBody = Array.from({ length: 120 }, (_, i) => `Sentence number ${i} about agents.`).join(' ');

describe('PublisherService', () => {
  let dir: string;
  let store: DraftStore;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'medium-pub-'));
    store = new DraftStore(dir, logger);
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('publishes a passing article and mirrors it locally', async () => {
    const { service, created } = mockMedium();
    const publisher = new PublisherService(service, store, logger);
    const article = createArticleFromInput(
      { title: 'Building AI Agents', markdown: longBody, publishStatus: 'public', tags: ['ai'] },
      { visibility: 'public', tags: [] },
    );
    await store.create(article);

    const result = await publisher.publish(article);
    expect(created).toHaveLength(1);
    expect(result.post.url).toContain('post_123');
    expect(result.article.mediumId).toBe('post_123');

    const mirrored = await store.get(article.id);
    expect(mirrored.mediumId).toBe('post_123');
  });

  it('blocks publishing when quality gate fails without force', async () => {
    const { service } = mockMedium();
    const publisher = new PublisherService(service, store, logger);
    const bad = createArticleFromInput(
      { title: 'Tiny', markdown: '```js\nunclosed', publishStatus: 'public' },
      { visibility: 'public', tags: [] },
    );
    await expect(publisher.publish(bad)).rejects.toThrow(/quality checks failed/i);
  });

  it('allows override with force', async () => {
    const { service, created } = mockMedium();
    const publisher = new PublisherService(service, store, logger);
    const bad = createArticleFromInput(
      { title: 'Tiny', markdown: 'short', publishStatus: 'public' },
      { visibility: 'public', tags: [] },
    );
    await publisher.publish(bad, { force: true });
    expect(created).toHaveLength(1);
  });
});
