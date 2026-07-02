/**
 * Runtime configuration, loaded from environment variables with sane defaults.
 *
 * The configuration is a plain immutable object obtained via {@link loadConfig}.
 * It can be re-loaded at runtime (see `reload_config` tool) without restarting
 * the process, satisfying the "refresh configuration without restart" goal.
 */
import { config as loadEnv } from 'dotenv';
import { z } from 'zod';
import { ConfigError } from '../utils/errors.js';
import type { LogLevel } from '../utils/logger.js';
import type { Visibility } from '../types/index.js';

loadEnv();

export type ResearchProvider = 'tavily' | 'brave' | 'perplexity' | 'firecrawl' | 'none';

export interface AppConfig {
  medium: {
    /** Playwright persistent-context user-data directory (holds the login session). */
    sessionDir: string;
    /** Run the browser headless for publishing (the login tool always forces headed). */
    headless: boolean;
    /** Per-action timeout for browser interactions, in milliseconds. */
    actionTimeoutMs: number;
  };
  defaults: {
    publication?: string;
    tags: string[];
    visibility: Visibility;
    tone: string;
    language: string;
    model: string;
  };
  autosaveIntervalMs: number;
  dataDir: string;
  research: {
    provider: ResearchProvider;
    tavilyKey?: string;
    braveKey?: string;
    perplexityKey?: string;
    firecrawlKey?: string;
  };
  logging: {
    level: LogLevel;
    verbose: boolean;
  };
}

const envSchema = z.object({
  MEDIUM_SESSION_DIR: z.string().trim().optional(),
  MEDIUM_HEADLESS: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  MEDIUM_BROWSER_TIMEOUT: z.coerce.number().int().positive().default(30_000),
  MEDIUM_DEFAULT_PUBLICATION: z.string().trim().optional(),
  MEDIUM_DEFAULT_TAGS: z.string().trim().optional(),
  MEDIUM_DEFAULT_VISIBILITY: z
    .enum(['public', 'unlisted', 'private'])
    .default('public'),
  MEDIUM_WRITING_TONE: z.string().trim().default('professional'),
  MEDIUM_WRITING_LANGUAGE: z.string().trim().default('en'),
  MEDIUM_DEFAULT_MODEL: z.string().trim().default('claude-opus-4-8'),
  MEDIUM_AUTOSAVE_INTERVAL: z.coerce.number().int().positive().default(30_000),
  MEDIUM_DATA_DIR: z.string().trim().default('.medium-mcp'),
  MEDIUM_RESEARCH_PROVIDER: z
    .enum(['tavily', 'brave', 'perplexity', 'firecrawl', 'none'])
    .default('none'),
  TAVILY_API_KEY: z.string().trim().optional(),
  BRAVE_API_KEY: z.string().trim().optional(),
  PERPLEXITY_API_KEY: z.string().trim().optional(),
  FIRECRAWL_API_KEY: z.string().trim().optional(),
  MEDIUM_LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  MEDIUM_VERBOSE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
});

function parseTags(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

/**
 * Load configuration from the current environment.
 *
 * @param overrides optional env-like map to merge on top of `process.env`
 *   (used by `reload_config` and tests).
 * @throws {ConfigError} when the environment fails schema validation.
 */
export function loadConfig(overrides: Record<string, string> = {}): AppConfig {
  const merged = { ...process.env, ...overrides };
  const parsed = envSchema.safeParse(merged);
  if (!parsed.success) {
    throw new ConfigError('Invalid configuration', parsed.error.flatten());
  }
  const env = parsed.data;

  const sessionDir =
    env.MEDIUM_SESSION_DIR && env.MEDIUM_SESSION_DIR.length > 0
      ? env.MEDIUM_SESSION_DIR
      : `${env.MEDIUM_DATA_DIR}/browser-profile`;

  return {
    medium: {
      sessionDir,
      headless: env.MEDIUM_HEADLESS,
      actionTimeoutMs: env.MEDIUM_BROWSER_TIMEOUT,
    },
    defaults: {
      publication: env.MEDIUM_DEFAULT_PUBLICATION,
      tags: parseTags(env.MEDIUM_DEFAULT_TAGS),
      visibility: env.MEDIUM_DEFAULT_VISIBILITY,
      tone: env.MEDIUM_WRITING_TONE,
      language: env.MEDIUM_WRITING_LANGUAGE,
      model: env.MEDIUM_DEFAULT_MODEL,
    },
    autosaveIntervalMs: env.MEDIUM_AUTOSAVE_INTERVAL,
    dataDir: env.MEDIUM_DATA_DIR,
    research: {
      provider: env.MEDIUM_RESEARCH_PROVIDER,
      tavilyKey: env.TAVILY_API_KEY,
      braveKey: env.BRAVE_API_KEY,
      perplexityKey: env.PERPLEXITY_API_KEY,
      firecrawlKey: env.FIRECRAWL_API_KEY,
    },
    logging: {
      level: env.MEDIUM_LOG_LEVEL,
      verbose: env.MEDIUM_VERBOSE,
    },
  };
}

/**
 * Mutable configuration holder so downstream singletons observe live changes
 * when configuration is reloaded at runtime.
 */
export class ConfigStore {
  private current: AppConfig;
  private listeners = new Set<(cfg: AppConfig) => void>();

  constructor(initial?: AppConfig) {
    this.current = initial ?? loadConfig();
  }

  get(): AppConfig {
    return this.current;
  }

  /** Reload from environment + overrides and notify subscribers. */
  reload(overrides: Record<string, string> = {}): AppConfig {
    this.current = loadConfig(overrides);
    for (const listener of this.listeners) listener(this.current);
    return this.current;
  }

  onChange(listener: (cfg: AppConfig) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
