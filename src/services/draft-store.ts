/**
 * Local persistence layer emulating the CRUD surface Medium's API lacks.
 *
 * Articles, revisions and the scheduling queue are stored as JSON files under
 * the configured data directory. All writes are atomic (write-temp + rename)
 * to avoid partial-write corruption. This backs drafts, published mirrors,
 * version history, autosave/restore, and the local scheduling queue.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { ConflictError, NotFoundError } from '../utils/errors.js';
import { newId, nowIso } from '../utils/id.js';
import type { Logger } from '../utils/logger.js';
import type { Article, ArticleRevision, PublishStatus } from '../types/index.js';

export interface ScheduledPublish {
  id: string;
  articleId: string;
  scheduledFor: string;
  publishStatus: PublishStatus;
  publication?: string;
  createdAt: string;
  status: 'pending' | 'published' | 'cancelled' | 'failed';
  note?: string;
}

interface StoreShape {
  articles: Record<string, Article>;
  revisions: Record<string, ArticleRevision[]>;
  schedule: ScheduledPublish[];
}

const MAX_REVISIONS = 50;
/** How long completed/cancelled/failed schedule entries are retained. */
const SCHEDULE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export interface ListFilter {
  isDraft?: boolean;
  publishStatus?: PublishStatus;
  query?: string;
  tag?: string;
}

export class DraftStore {
  private dataDir: string;
  private file: string;
  private logger: Logger;
  private cache?: StoreShape;
  private writeLock: Promise<void> = Promise.resolve();

  constructor(dataDir: string, logger: Logger) {
    this.dataDir = dataDir;
    this.file = path.join(dataDir, 'store.json');
    this.logger = logger.child({ component: 'DraftStore' });
  }

  private async load(): Promise<StoreShape> {
    if (this.cache) return this.cache;
    try {
      const raw = await fs.readFile(this.file, 'utf8');
      this.cache = JSON.parse(raw) as StoreShape;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        this.cache = { articles: {}, revisions: {}, schedule: [] };
      } else {
        throw err;
      }
    }
    return this.cache;
  }

  /** Serialize writes so concurrent tool calls cannot interleave. */
  private async persist(): Promise<void> {
    const run = async (): Promise<void> => {
      if (!this.cache) return;
      await fs.mkdir(this.dataDir, { recursive: true });
      const tmp = `${this.file}.${newId()}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(this.cache, null, 2), 'utf8');
      await fs.rename(tmp, this.file);
    };
    const attempt = this.writeLock.then(run, run);
    // Keep the lock chain healthy even when this write fails.
    this.writeLock = attempt.catch(() => undefined);
    try {
      await attempt;
    } catch (err) {
      // The in-memory cache now diverges from disk; drop it so the next read
      // reloads the last durably-written state instead of serving phantom data.
      this.cache = undefined;
      throw err;
    }
  }

  /** Create a new article record. */
  async create(article: Article): Promise<Article> {
    const store = await this.load();
    if (store.articles[article.id]) {
      throw new ConflictError(`Article already exists: ${article.id}`);
    }
    store.articles[article.id] = article;
    await this.snapshot(article, 'create');
    await this.persist();
    this.logger.debug('Created article', { id: article.id });
    return article;
  }

  /** Fetch an article or throw {@link NotFoundError}. */
  async get(id: string): Promise<Article> {
    const store = await this.load();
    const article = store.articles[id];
    if (!article) throw new NotFoundError('Article', id);
    return article;
  }

  /** Fetch an article or return undefined. */
  async find(id: string): Promise<Article | undefined> {
    const store = await this.load();
    return store.articles[id];
  }

  /** Replace an article, recording a revision snapshot. */
  async update(article: Article, note = 'update'): Promise<Article> {
    const store = await this.load();
    if (!store.articles[article.id]) throw new NotFoundError('Article', article.id);
    const updated = { ...article, updatedAt: nowIso() };
    store.articles[article.id] = updated;
    await this.snapshot(updated, note);
    await this.persist();
    return updated;
  }

  /** Delete an article and its revisions. */
  async delete(id: string): Promise<void> {
    const store = await this.load();
    if (!store.articles[id]) throw new NotFoundError('Article', id);
    delete store.articles[id];
    delete store.revisions[id];
    await this.persist();
    this.logger.debug('Deleted article', { id });
  }

  /** List articles with optional filtering + full-text search. */
  async list(filter: ListFilter = {}): Promise<Article[]> {
    const store = await this.load();
    let items = Object.values(store.articles);
    if (filter.isDraft !== undefined) {
      items = items.filter((a) => a.isDraft === filter.isDraft);
    }
    if (filter.publishStatus) {
      items = items.filter((a) => a.publishStatus === filter.publishStatus);
    }
    if (filter.tag) {
      items = items.filter((a) => a.tags.includes(filter.tag!));
    }
    if (filter.query) {
      const q = filter.query.toLowerCase();
      items = items.filter(
        (a) =>
          a.title.toLowerCase().includes(q) ||
          (a.subtitle ?? '').toLowerCase().includes(q) ||
          a.markdown.toLowerCase().includes(q),
      );
    }
    return items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  /** Duplicate an article under a new id. */
  async duplicate(id: string, titleSuffix = ' (copy)'): Promise<Article> {
    const original = await this.get(id);
    const now = nowIso();
    const copy: Article = {
      ...original,
      id: newId('art'),
      mediumId: undefined,
      url: undefined,
      title: `${original.title}${titleSuffix}`,
      publishStatus: 'draft',
      isDraft: true,
      createdAt: now,
      updatedAt: now,
    };
    return this.create(copy);
  }

  // ── Revisions ──────────────────────────────────────────────────────────

  /** Record a revision snapshot (bounded to {@link MAX_REVISIONS}). */
  async snapshot(article: Article, note: string): Promise<ArticleRevision> {
    const store = await this.load();
    const revision: ArticleRevision = {
      revisionId: newId('rev'),
      articleId: article.id,
      createdAt: nowIso(),
      note,
      snapshot: structuredClone(article),
    };
    const list = store.revisions[article.id] ?? [];
    list.unshift(revision);
    store.revisions[article.id] = list.slice(0, MAX_REVISIONS);
    return revision;
  }

  /** List revisions for an article, newest first. */
  async listRevisions(articleId: string): Promise<ArticleRevision[]> {
    const store = await this.load();
    return store.revisions[articleId] ?? [];
  }

  /** Restore an article to a prior revision. */
  async restore(articleId: string, revisionId: string): Promise<Article> {
    const store = await this.load();
    const revisions = store.revisions[articleId] ?? [];
    const revision = revisions.find((r) => r.revisionId === revisionId);
    if (!revision) throw new NotFoundError('Revision', revisionId);
    const restored = { ...revision.snapshot, updatedAt: nowIso() };
    store.articles[articleId] = restored;
    await this.snapshot(restored, `restore:${revisionId}`);
    await this.persist();
    return restored;
  }

  // ── Scheduling queue ──────────────────────────────────────────────────

  async addSchedule(entry: Omit<ScheduledPublish, 'id' | 'createdAt' | 'status'>): Promise<
    ScheduledPublish
  > {
    const store = await this.load();
    const scheduled: ScheduledPublish = {
      ...entry,
      id: newId('sch'),
      createdAt: nowIso(),
      status: 'pending',
    };
    store.schedule.push(scheduled);
    this.pruneSchedule(store);
    await this.persist();
    return scheduled;
  }

  /**
   * Drop terminal (published/cancelled/failed) schedule entries older than the
   * retention window so the queue cannot grow without bound. Pending entries
   * are always kept.
   */
  private pruneSchedule(store: StoreShape): void {
    const cutoff = Date.now() - SCHEDULE_RETENTION_MS;
    store.schedule = store.schedule.filter(
      (s) => s.status === 'pending' || Date.parse(s.createdAt) >= cutoff,
    );
  }

  async listSchedule(includeCompleted = false): Promise<ScheduledPublish[]> {
    const store = await this.load();
    return store.schedule
      .filter((s) => includeCompleted || s.status === 'pending')
      .sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor));
  }

  async cancelSchedule(scheduleId: string): Promise<ScheduledPublish> {
    const store = await this.load();
    const entry = store.schedule.find((s) => s.id === scheduleId);
    if (!entry) throw new NotFoundError('Scheduled publish', scheduleId);
    entry.status = 'cancelled';
    await this.persist();
    return entry;
  }

  async updateScheduleStatus(
    scheduleId: string,
    status: ScheduledPublish['status'],
    note?: string,
  ): Promise<void> {
    const store = await this.load();
    const entry = store.schedule.find((s) => s.id === scheduleId);
    if (!entry) throw new NotFoundError('Scheduled publish', scheduleId);
    entry.status = status;
    if (note) entry.note = note;
    await this.persist();
  }

  /** Return schedule entries whose time has arrived and are still pending. */
  async dueSchedules(nowMs: number): Promise<ScheduledPublish[]> {
    const store = await this.load();
    return store.schedule.filter(
      (s) => s.status === 'pending' && Date.parse(s.scheduledFor) <= nowMs,
    );
  }
}
