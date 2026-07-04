/**
 * Optional web-research integration. Supports Tavily, Brave, Perplexity and
 * Firecrawl via their HTTP APIs. When no provider/key is configured the service
 * degrades gracefully: research tools return an instruction for the host model
 * to perform the research instead of failing.
 */
import axios, { isAxiosError } from 'axios';
import type { AppConfig, ResearchProvider } from '../config/config.js';
import { AppError, ConfigError, NetworkError } from '../utils/errors.js';
import type { Logger } from '../utils/logger.js';

/** Hard cap on provider HTTP calls so a stalled provider cannot hang a tool call. */
const REQUEST_TIMEOUT_MS = 15_000;

export interface ResearchResult {
  title: string;
  url: string;
  snippet: string;
  score?: number;
}

export interface ResearchResponse {
  provider: ResearchProvider | 'none';
  query: string;
  results: ResearchResult[];
  /** Present when no provider is configured — guidance for the host model. */
  fallbackInstruction?: string;
}

export class ResearchService {
  private config: AppConfig;
  private logger: Logger;

  constructor(config: AppConfig, logger: Logger) {
    this.config = config;
    this.logger = logger.child({ component: 'ResearchService' });
  }

  updateConfig(config: AppConfig): void {
    this.config = config;
  }

  get provider(): ResearchProvider {
    return this.config.research.provider;
  }

  private keyFor(provider: ResearchProvider): string | undefined {
    switch (provider) {
      case 'tavily':
        return this.config.research.tavilyKey;
      case 'brave':
        return this.config.research.braveKey;
      case 'perplexity':
        return this.config.research.perplexityKey;
      case 'firecrawl':
        return this.config.research.firecrawlKey;
      default:
        return undefined;
    }
  }

  /** Run a web search, or return a fallback instruction if unconfigured. */
  async search(query: string, maxResults = 6): Promise<ResearchResponse> {
    const provider = this.config.research.provider;
    if (provider === 'none') {
      return {
        provider: 'none',
        query,
        results: [],
        fallbackInstruction: `No research provider is configured. Use your own web browsing/search to research "${query}", then collect 5–8 authoritative sources with title, URL and a one-line takeaway each.`,
      };
    }

    const key = this.keyFor(provider);
    if (!key) {
      throw new ConfigError(`Research provider "${provider}" selected but its API key is missing.`);
    }

    try {
      const results = await this.dispatch(provider, key, query, maxResults);
      return { provider, query, results };
    } catch (err) {
      this.logger.error('Research provider failed', {
        provider,
        error: err instanceof Error ? err.message : String(err),
      });
      if (err instanceof AppError) throw err;
      if (isAxiosError(err)) {
        const status = err.response?.status;
        throw new NetworkError(
          status
            ? `Research provider "${provider}" returned HTTP ${status}.`
            : `Research provider "${provider}" is unreachable or timed out.`,
          err,
        );
      }
      throw new AppError('Research request failed', { cause: err });
    }
  }

  private async dispatch(
    provider: ResearchProvider,
    key: string,
    query: string,
    maxResults: number,
  ): Promise<ResearchResult[]> {
    switch (provider) {
      case 'tavily': {
        const res = await axios.post(
          'https://api.tavily.com/search',
          { api_key: key, query, max_results: maxResults },
          { timeout: REQUEST_TIMEOUT_MS },
        );
        return (res.data.results ?? []).map(
          (r: { title: string; url: string; content: string; score?: number }) => ({
            title: r.title,
            url: r.url,
            snippet: r.content,
            score: r.score,
          }),
        );
      }
      case 'brave': {
        const res = await axios.get('https://api.search.brave.com/res/v1/web/search', {
          headers: { 'X-Subscription-Token': key, Accept: 'application/json' },
          params: { q: query, count: maxResults },
          timeout: REQUEST_TIMEOUT_MS,
        });
        return (res.data.web?.results ?? []).map(
          (r: { title: string; url: string; description: string }) => ({
            title: r.title,
            url: r.url,
            snippet: r.description,
          }),
        );
      }
      case 'perplexity': {
        const res = await axios.post(
          'https://api.perplexity.ai/chat/completions',
          {
            model: 'sonar',
            messages: [{ role: 'user', content: `Research and cite sources for: ${query}` }],
          },
          { headers: { Authorization: `Bearer ${key}` }, timeout: REQUEST_TIMEOUT_MS },
        );
        const content: string = res.data.choices?.[0]?.message?.content ?? '';
        const citations: string[] = res.data.citations ?? [];
        return citations.map((url, i) => ({
          title: `Source ${i + 1}`,
          url,
          snippet: content.slice(0, 200),
        }));
      }
      case 'firecrawl': {
        const res = await axios.post(
          'https://api.firecrawl.dev/v1/search',
          { query, limit: maxResults },
          { headers: { Authorization: `Bearer ${key}` }, timeout: REQUEST_TIMEOUT_MS },
        );
        return (res.data.data ?? []).map(
          (r: { title: string; url: string; description?: string }) => ({
            title: r.title,
            url: r.url,
            snippet: r.description ?? '',
          }),
        );
      }
      default:
        return [];
    }
  }
}
