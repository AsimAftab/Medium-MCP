import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DraftStore } from '../src/services/draft-store.js';
import { Logger } from '../src/utils/logger.js';
import { createArticleFromInput } from '../src/utils/article-factory.js';

const logger = new Logger({ level: 'error' });

function makeArticle(title = 'Test Article') {
  return createArticleFromInput(
    { title, markdown: 'Some body content that is reasonably long.', publishStatus: 'draft' },
    { visibility: 'public', tags: ['test'] },
  );
}

describe('DraftStore', () => {
  let dir: string;
  let store: DraftStore;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'medium-mcp-'));
    store = new DraftStore(dir, logger);
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('creates and reads an article', async () => {
    const article = makeArticle();
    await store.create(article);
    const fetched = await store.get(article.id);
    expect(fetched.title).toBe('Test Article');
  });

  it('persists to disk', async () => {
    const article = makeArticle();
    await store.create(article);
    const fresh = new DraftStore(dir, logger);
    const fetched = await fresh.get(article.id);
    expect(fetched.id).toBe(article.id);
  });

  it('lists and filters drafts', async () => {
    await store.create(makeArticle('Alpha'));
    await store.create(makeArticle('Beta'));
    const all = await store.list({ isDraft: true });
    expect(all).toHaveLength(2);
    const found = await store.list({ query: 'alpha' });
    expect(found).toHaveLength(1);
  });

  it('records and restores revisions', async () => {
    const article = makeArticle();
    await store.create(article);
    await store.update({ ...article, markdown: 'v2 content here now.' }, 'edit');
    const revisions = await store.listRevisions(article.id);
    expect(revisions.length).toBeGreaterThanOrEqual(2);
    const oldest = revisions[revisions.length - 1]!;
    const restored = await store.restore(article.id, oldest.revisionId);
    expect(restored.markdown).toContain('Some body content');
  });

  it('duplicates as a fresh draft', async () => {
    const article = makeArticle();
    await store.create(article);
    const copy = await store.duplicate(article.id);
    expect(copy.id).not.toBe(article.id);
    expect(copy.isDraft).toBe(true);
    expect(copy.title).toContain('(copy)');
  });

  it('manages the scheduling queue', async () => {
    const article = makeArticle();
    await store.create(article);
    const entry = await store.addSchedule({
      articleId: article.id,
      scheduledFor: new Date(Date.now() + 60_000).toISOString(),
      publishStatus: 'public',
    });
    const pending = await store.listSchedule();
    expect(pending).toHaveLength(1);
    await store.cancelSchedule(entry.id);
    expect(await store.listSchedule()).toHaveLength(0);
  });

  it('throws NotFoundError for missing article', async () => {
    await expect(store.get('missing')).rejects.toThrow();
  });
});
