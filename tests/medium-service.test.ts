import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Logger } from '../src/utils/logger.js';

/**
 * Unit tests for the browser-based MediumService with Playwright fully mocked.
 * We assert the editor-driving orchestration and URL/id read-back without
 * launching a real browser. Live end-to-end coverage is gated behind MEDIUM_E2E.
 */

// A fake Playwright locator: every interaction is a no-op that resolves.
function fakeLocator(overrides: Record<string, unknown> = {}) {
  const loc: Record<string, unknown> = {
    first: () => loc,
    waitFor: vi.fn(async () => undefined),
    click: vi.fn(async () => undefined),
    type: vi.fn(async () => undefined),
    count: vi.fn(async () => 0),
    getAttribute: vi.fn(async () => null),
    ...overrides,
  };
  return loc;
}

// A fake page whose URL is scriptable to simulate navigation results.
function fakePage(urlForPath: (path: string) => string) {
  let current = 'https://medium.com';
  const page: Record<string, unknown> = {
    goto: vi.fn(async (url: string) => {
      current = urlForPath(url);
      return null;
    }),
    url: () => current,
    title: vi.fn(async () => 'Jane Doe – Medium'),
    // A logged-in Medium page exposes a "New story" link; report it present so
    // the positive signed-in check passes (mirrors real authenticated markup).
    locator: vi.fn((sel: string) =>
      fakeLocator({ count: vi.fn(async () => (sel.includes('new-story') ? 1 : 0)) }),
    ),
    keyboard: {
      type: vi.fn(async () => undefined),
      press: vi.fn(async () => undefined),
      insertText: vi.fn(async () => undefined),
    },
    evaluate: vi.fn(async () => undefined),
    waitForTimeout: vi.fn(async () => undefined),
    waitForLoadState: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
  };
  return page;
}

const contextClose = vi.fn(async () => undefined);
let pageFactory: () => Record<string, unknown>;
// Auth cookies the fake context reports; set per test to simulate logged in/out.
let cookieState: Array<{ name: string; value: string }> = [];

vi.mock('playwright', () => ({
  chromium: {
    launchPersistentContext: vi.fn(async () => {
      const page = pageFactory();
      return {
        pages: () => [page],
        newPage: async () => page,
        setDefaultTimeout: vi.fn(),
        addInitScript: vi.fn(async () => undefined),
        cookies: vi.fn(async () => cookieState),
        close: contextClose,
      };
    }),
  },
}));

// Import after the mock is registered.
const { MediumService } = await import('../src/services/medium-service.js');

const logger = new Logger({ level: 'error' });

function makeService() {
  return new MediumService({
    sessionDir: `${process.cwd()}/node_modules`, // any existing dir => hasSession() true
    headless: true,
    actionTimeoutMs: 2_000,
    logger,
  });
}

describe('MediumService (browser-based)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cookieState = [];
  });

  it('saves a draft and derives the post id from the editor URL', async () => {
    cookieState = [{ name: 'uid', value: 'abc' }]; // logged in
    pageFactory = () =>
      fakePage((url) =>
        url.includes('/new-story') ? 'https://medium.com/p/abc123def456/edit' : url,
      );
    const svc = makeService();
    const post = await svc.createPost({
      title: 'Test Draft',
      contentFormat: 'markdown',
      content: '# Hello\n\nThis is a body about agents.',
      tags: ['ai', 'agents'],
      publishStatus: 'draft',
    });
    expect(post.publishStatus).toBe('draft');
    expect(post.id).toBe('abc123def456');
    expect(post.url).toContain('/p/abc123def456');
    expect(post.tags).toEqual(['ai', 'agents']);
  });

  it('validates an active session (auth cookie present) and scrapes the username', async () => {
    cookieState = [{ name: 'uid', value: 'abc' }]; // logged in
    pageFactory = () =>
      fakePage((url) => (url.endsWith('/me') ? 'https://medium.com/@janedoe' : url));
    const svc = makeService();
    const result = await svc.validateSession();
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.user.username).toBe('janedoe');
      expect(result.user.url).toBe('https://medium.com/@janedoe');
    }
  });

  it('reports an invalid session when the auth cookie is absent', async () => {
    cookieState = []; // no sid cookie
    pageFactory = () => fakePage((url) => url);
    const svc = makeService();
    const result = await svc.validateSession();
    expect(result.valid).toBe(false);
  });

  it('throws AuthError when publishing without a session', async () => {
    cookieState = []; // no sid cookie
    pageFactory = () => fakePage(() => 'https://medium.com/m/signin');
    const svc = makeService();
    await expect(
      svc.createPost({ title: 'X', contentFormat: 'markdown', content: 'body', publishStatus: 'draft' }),
    ).rejects.toThrow(/not logged in/i);
  });
});
