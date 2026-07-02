/**
 * Local scheduling queue processor. Medium's API has no native scheduling, so
 * the server maintains a persistent queue (in {@link DraftStore}) and a poller
 * that publishes due entries. The poller is best-effort and only runs while the
 * server process is alive.
 */
import { DraftStore, type ScheduledPublish } from './draft-store.js';
import { PublisherService } from './publisher-service.js';
import type { Logger } from '../utils/logger.js';

export class Scheduler {
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private store: DraftStore,
    private publisher: PublisherService,
    private logger: Logger,
    private pollIntervalMs = 60_000,
  ) {}

  /** Start the background poller. Idempotent. */
  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.tick();
    }, this.pollIntervalMs);
    // Do not keep the event loop alive solely for the poller.
    this.timer.unref?.();
    this.logger.debug('Scheduler started', { pollIntervalMs: this.pollIntervalMs });
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  /** Process all due schedule entries once. Exposed for tests + manual runs. */
  async tick(nowMs: number = Date.now()): Promise<ScheduledPublish[]> {
    if (this.running) return [];
    this.running = true;
    const processed: ScheduledPublish[] = [];
    try {
      const due = await this.store.dueSchedules(nowMs);
      for (const entry of due) {
        try {
          const article = await this.store.get(entry.articleId);
          await this.publisher.publish(
            { ...article, publishStatus: entry.publishStatus, publication: entry.publication },
            { force: true },
          );
          await this.store.updateScheduleStatus(entry.id, 'published');
          processed.push({ ...entry, status: 'published' });
          this.logger.info('Scheduled publish completed', { scheduleId: entry.id });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          await this.store.updateScheduleStatus(entry.id, 'failed', message);
          this.logger.error('Scheduled publish failed', { scheduleId: entry.id, message });
        }
      }
    } finally {
      this.running = false;
    }
    return processed;
  }
}
