/**
 * Lightweight dependency-injection container.
 *
 * Constructs and wires every service from configuration, exposing them to tools
 * through a single typed object. Re-loading configuration reconfigures the live
 * services in place (token/base URL/research provider) without a restart.
 */
import { ConfigStore, type AppConfig } from '../config/config.js';
import { Logger } from '../utils/logger.js';
import { MediumService } from '../services/medium-service.js';
import { DraftStore } from '../services/draft-store.js';
import { TemplateService } from '../services/template-service.js';
import { PromptBuilder } from '../services/prompt-builder.js';
import { ResearchService } from '../services/research-service.js';
import { ImageService } from '../services/image-service.js';
import { PublisherService } from '../services/publisher-service.js';
import { Scheduler } from '../services/scheduler.js';

export interface Container {
  config: ConfigStore;
  logger: Logger;
  medium: MediumService;
  store: DraftStore;
  templates: TemplateService;
  prompts: PromptBuilder;
  research: ResearchService;
  images: ImageService;
  publisher: PublisherService;
  scheduler: Scheduler;
  /** Reload configuration and reconfigure live services. */
  reload(overrides?: Record<string, string>): AppConfig;
}

/** Build the fully-wired dependency container. */
export function createContainer(configStore?: ConfigStore): Container {
  const config = configStore ?? new ConfigStore();
  const cfg = config.get();

  const logger = new Logger({
    level: cfg.logging.level,
    verbose: cfg.logging.verbose,
    base: { service: 'medium-mcp' },
  });

  const medium = new MediumService({
    sessionDir: cfg.medium.sessionDir,
    headless: cfg.medium.headless,
    actionTimeoutMs: cfg.medium.actionTimeoutMs,
    logger,
  });
  const store = new DraftStore(cfg.dataDir, logger);
  const templates = new TemplateService();
  const prompts = new PromptBuilder();
  const research = new ResearchService(cfg, logger);
  const images = new ImageService();
  const publisher = new PublisherService(medium, store, logger);
  const scheduler = new Scheduler(store, publisher, logger);

  return {
    config,
    logger,
    medium,
    store,
    templates,
    prompts,
    research,
    images,
    publisher,
    scheduler,
    reload(overrides = {}): AppConfig {
      const next = config.reload(overrides);
      logger.setLevel(next.logging.level);
      medium.reconfigure(
        next.medium.sessionDir,
        next.medium.headless,
        next.medium.actionTimeoutMs,
      );
      research.updateConfig(next);
      logger.info('Configuration reloaded');
      return next;
    },
  };
}
