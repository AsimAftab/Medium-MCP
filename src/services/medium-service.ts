/**
 * Browser-based Medium backend.
 *
 * Medium closed its public REST API (api.medium.com/v1) to new integrations and
 * no longer issues integration tokens, so this service publishes by automating
 * the real Medium web editor with Playwright. The user authenticates once
 * through a normal, visible browser login (`login()`); the session is persisted
 * to disk via a Playwright persistent context and reused headlessly afterward.
 *
 * The public surface intentionally mirrors the previous REST client
 * (`currentUser`, `listPublications`, `createPost`, …) so the rest of the app —
 * {@link ./publisher-service.ts} in particular — is unaffected by the swap.
 */
import { existsSync, readdirSync } from 'node:fs';
import {
  chromium,
  type BrowserContext,
  type Locator,
  type Page,
} from 'playwright';
import { AuthError, NetworkError } from '../utils/errors.js';
import { markdownToHtml } from '../utils/markdown.js';
import { toPlainText } from '../utils/text.js';
import type { Logger } from '../utils/logger.js';
import type {
  CreatePostRequest,
  MediumPost,
  MediumPublication,
  MediumUser,
} from '../types/index.js';

export interface MediumServiceOptions {
  sessionDir: string;
  headless: boolean;
  actionTimeoutMs: number;
  logger: Logger;
}

/**
 * Centralized DOM selectors for the Medium editor and auth pages. Medium's
 * markup changes over time; keeping every selector here makes updates a
 * one-file change. Each entry lists fallbacks tried in order.
 */
const SELECTORS = {
  /** The story title field in the editor (contenteditable). */
  title: [
    'h3[data-testid="editorTitleParagraph"]',
    'h3.graf--title',
    '.graf--title',
    '[name="title"]',
  ],
  /** The story body field in the editor (contenteditable). */
  body: [
    'div[data-testid="editorBodyParagraph"]',
    'p[data-testid="editorBodyParagraph"]',
    'div.section-inner p.graf--p',
    'article [contenteditable="true"]',
  ],
  /** Top-right "Publish" button that opens the publish dialog. */
  publishButton: [
    'button[data-testid="publishButton"]',
    'button[data-action="show-prepublish"]',
    'button:has-text("Publish")',
  ],
  /** Tag input inside the publish dialog. */
  tagInput: [
    'div[data-testid="publishTopicsInput"] input',
    'input[placeholder*="topic" i]',
    'input[placeholder*="tag" i]',
  ],
  /** Final "Publish now" confirmation button inside the dialog. */
  confirmPublish: [
    'button[data-testid="publishConfirmButton"]',
    'button:has-text("Publish now")',
    'div[role="dialog"] button:has-text("Publish")',
  ],
} as const;

const MEDIUM_ORIGIN = 'https://medium.com';
const NEW_STORY_URL = `${MEDIUM_ORIGIN}/new-story`;
const SIGNIN_URL = `${MEDIUM_ORIGIN}/m/signin`;

/** A realistic desktop Chrome UA so headless runs don't advertise "HeadlessChrome". */
const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36';

export class MediumService {
  private sessionDir: string;
  private headless: boolean;
  private actionTimeoutMs: number;
  private logger: Logger;
  private context?: BrowserContext;
  private cachedUser?: MediumUser;

  constructor(options: MediumServiceOptions) {
    this.sessionDir = options.sessionDir;
    this.headless = options.headless;
    this.actionTimeoutMs = options.actionTimeoutMs;
    this.logger = options.logger.child({ component: 'MediumService' });
  }

  /** Apply new browser settings after a configuration reload. */
  reconfigure(sessionDir: string, headless: boolean, actionTimeoutMs: number): void {
    const changed =
      sessionDir !== this.sessionDir ||
      headless !== this.headless ||
      actionTimeoutMs !== this.actionTimeoutMs;
    this.sessionDir = sessionDir;
    this.headless = headless;
    this.actionTimeoutMs = actionTimeoutMs;
    if (changed) {
      this.cachedUser = undefined;
      void this.close();
    }
  }

  /**
   * Whether a persisted login session appears to exist on disk. Does not
   * validate that the session is still authenticated (use {@link validateSession}).
   */
  hasSession(): boolean {
    try {
      return existsSync(this.sessionDir) && readdirSync(this.sessionDir).length > 0;
    } catch {
      return false;
    }
  }

  /** Close the browser context, releasing the persisted-profile lock. */
  async close(): Promise<void> {
    const ctx = this.context;
    this.context = undefined;
    if (!ctx) return;
    try {
      await ctx.close();
    } catch (err) {
      this.logger.debug('Error closing browser context', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // ── Context / page helpers ──────────────────────────────────────────────

  /**
   * Launch (or reuse) the persistent Playwright context bound to `sessionDir`.
   * Only one context may hold the profile directory at a time.
   */
  private async getContext(headless = this.headless): Promise<BrowserContext> {
    if (this.context) return this.context;
    try {
      this.context = await chromium.launchPersistentContext(this.sessionDir, {
        headless,
        timeout: this.actionTimeoutMs,
        viewport: { width: 1280, height: 900 },
        permissions: ['clipboard-read', 'clipboard-write'],
        userAgent: DESKTOP_UA,
        // Reduce the automation fingerprint that trips Cloudflare's bot check.
        args: ['--disable-blink-features=AutomationControlled'],
        ignoreDefaultArgs: ['--enable-automation'],
      });
      this.context.setDefaultTimeout(this.actionTimeoutMs);
      // Hide the webdriver flag on every page/navigation.
      await this.context.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      });
      return this.context;
    } catch (err) {
      throw new NetworkError(
        `Failed to launch browser. Did you run \`npm run install:browser\`? (${
          err instanceof Error ? err.message : String(err)
        })`,
        err,
      );
    }
  }

  /** Reuse the context's first page or open a fresh one. */
  private async getPage(headless = this.headless): Promise<Page> {
    const ctx = await this.getContext(headless);
    const [existing] = ctx.pages();
    return existing ?? (await ctx.newPage());
  }

  /** Locate the first selector in a fallback list that resolves on the page. */
  private async firstVisible(
    page: Page,
    selectors: readonly string[],
    timeoutMs: number,
  ): Promise<Locator> {
    const deadline = Date.now() + timeoutMs;
    let lastErr: unknown;
    for (const selector of selectors) {
      const remaining = Math.max(500, deadline - Date.now());
      try {
        const locator = page.locator(selector).first();
        await locator.waitFor({ state: 'visible', timeout: remaining });
        return locator;
      } catch (err) {
        lastErr = err;
      }
    }
    throw new NetworkError(
      `None of the expected selectors were found: ${selectors.join(', ')}`,
      lastErr,
    );
  }

  /**
   * Whether the context holds Medium's authenticated-user cookie. This is the
   * reliable signal for "logged in" — page scraping is unreliable because Medium
   * (via Cloudflare) can serve a "Verify you are human" interstitial with no
   * authenticated markup.
   *
   * We require `uid` (the logged-in user id), NOT `sid`: Medium sets `sid` for
   * anonymous visitors too, so checking `sid` yields false positives.
   */
  private async hasAuthCookie(ctx: BrowserContext): Promise<boolean> {
    try {
      const cookies = await ctx.cookies(MEDIUM_ORIGIN);
      return cookies.some((c) => c.name === 'uid' && Boolean(c.value));
    } catch {
      return false;
    }
  }

  // ── Authentication ──────────────────────────────────────────────────────

  /**
   * Open a visible browser at the Medium signin page and leave it open for the
   * user to sign in. Does not wait or poll — pair with {@link completeLogin}
   * (interactive/CLI) or {@link login} (auto-detecting).
   */
  async beginLogin(): Promise<void> {
    // The login window must be visible regardless of configured headless mode,
    // and no other context may hold the profile lock.
    await this.close();
    await this.getContext(false);
    const page = await this.getPage(false);
    try {
      await page.goto(SIGNIN_URL, { waitUntil: 'domcontentloaded' });
    } catch (err) {
      this.logger.warn('Could not open signin page', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * Confirm the (now hopefully signed-in) session, persist it, and close the
   * window. Throws if the browser is not actually logged in yet.
   */
  async completeLogin(): Promise<MediumUser> {
    const ctx = this.context;
    if (!ctx) throw new AuthError('No login window is open. Call beginLogin() first.');
    const user = await this.confirmLoggedIn(ctx);
    if (!user) {
      throw new AuthError(
        'The browser is not signed in to Medium yet. Finish signing in (including any "verify you are human" check), then try again.',
      );
    }
    this.cachedUser = user;
    await this.close(); // release the profile lock so publishing can relaunch headless
    this.logger.info('Medium login successful', { username: user.username });
    return user;
  }

  /**
   * Open a visible browser and auto-detect a completed login (used by the
   * `medium_login` MCP tool, which has no terminal to prompt in).
   *
   * We never reload the user's signin tab — that would interrupt the Cloudflare
   * challenge / OTP entry. Instead, once the auth cookie appears we confirm the
   * real login state in a throwaway background tab (see {@link confirmLoggedIn}),
   * which avoids the false-positive close we'd get from trusting the cookie alone.
   */
  async login(timeoutMs = 300_000): Promise<MediumUser> {
    await this.beginLogin();
    const ctx = this.context;
    if (!ctx) throw new AuthError('Failed to open the login window.');

    this.logger.info(
      'Waiting for interactive Medium login — sign in and solve any "verify you are human" check in the window…',
    );
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (await this.hasAuthCookie(ctx)) {
        const user = await this.confirmLoggedIn(ctx);
        if (user) {
          this.cachedUser = user;
          await this.close();
          this.logger.info('Medium login successful', { username: user.username });
          return user;
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 2_000));
    }
    await this.close();
    throw new AuthError(
      'Timed out waiting for Medium login. Run `medium_login` (or `bun run login`) and complete sign-in in the window.',
    );
  }

  /**
   * Reliable "are we logged in?" probe. Opens a throwaway tab and loads
   * `medium.com/me`: when authenticated it redirects to the user's profile
   * (`/@username`); when not, it redirects to signin. The user's own tab is
   * never touched. Returns the resolved user, or null if not logged in.
   */
  private async confirmLoggedIn(ctx: BrowserContext): Promise<MediumUser | null> {
    const probe = await ctx.newPage();
    try {
      await probe.goto(`${MEDIUM_ORIGIN}/me`, { waitUntil: 'domcontentloaded' });
      const url = probe.url();
      if (/\/m\/signin|\/signin\b/.test(url)) return null;
      const username = /@([^/?#]+)/.exec(url)?.[1];
      if (!username) return null; // challenge page or not redirected to a profile
      return await this.scrapeUser(probe);
    } catch {
      return null;
    } finally {
      await probe.close().catch(() => undefined);
    }
  }

  /** Delete the persisted session so the next login starts fresh. */
  async logout(): Promise<void> {
    await this.close();
    this.cachedUser = undefined;
    try {
      const { rm } = await import('node:fs/promises');
      await rm(this.sessionDir, { recursive: true, force: true });
    } catch (err) {
      this.logger.debug('Error clearing session dir', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * Validate the persisted session by loading an authenticated page.
   * Returns a discriminated result rather than throwing on auth failure.
   */
  async validateSession(): Promise<
    { valid: true; user: MediumUser } | { valid: false; reason: string }
  > {
    if (!this.hasSession()) return { valid: false, reason: 'No saved session. Run `medium_login`.' };
    try {
      const ctx = await this.getContext();
      const user = await this.confirmLoggedIn(ctx);
      if (!user) {
        return { valid: false, reason: 'Session expired or signed out. Run `medium_login`.' };
      }
      this.cachedUser = user;
      return { valid: true, user };
    } catch (err) {
      return { valid: false, reason: err instanceof Error ? err.message : 'Unknown error' };
    }
  }

  // ── Read operations ─────────────────────────────────────────────────────

  /** Fetch and cache the authenticated user. */
  async currentUser(force = false): Promise<MediumUser> {
    if (this.cachedUser && !force) return this.cachedUser;
    const ctx = await this.getContext();
    const user = await this.confirmLoggedIn(ctx);
    if (!user) {
      throw new AuthError('Not logged in to Medium. Run the `medium_login` tool first.');
    }
    this.cachedUser = user;
    this.logger.debug('Fetched current user', { username: this.cachedUser.username });
    return this.cachedUser;
  }

  /**
   * Scrape the signed-in user's identity. `medium.com/me` redirects to the
   * user's profile (`medium.com/@username`), from which we derive the fields.
   */
  private async scrapeUser(page: Page): Promise<MediumUser> {
    let url = page.url();
    if (!/@[^/]+/.test(url)) {
      try {
        await page.goto(`${MEDIUM_ORIGIN}/me`, { waitUntil: 'domcontentloaded' });
        url = page.url();
      } catch {
        /* keep whatever url we have */
      }
    }
    const username = /@([^/?#]+)/.exec(url)?.[1] ?? 'me';
    const rawTitle = (await page.title().catch(() => '')).replace(/\s*[–-].*$/, '').trim();
    // Ignore interstitial/challenge titles so they never become the display name.
    const name =
      rawTitle && !/just a moment|attention required|verify|medium/i.test(rawTitle)
        ? rawTitle
        : username;
    const imageUrl = await page
      .locator('img[alt*="' + name + '" i], img[data-testid="authorPhoto"]')
      .first()
      .getAttribute('src')
      .catch(() => null);
    return {
      id: username,
      username,
      name,
      url: `${MEDIUM_ORIGIN}/@${username}`,
      imageUrl: imageUrl ?? '',
    };
  }

  /**
   * List publications the user can contribute to. Best-effort: the web UI does
   * not expose a stable list, so this returns an empty array unless it can be
   * scraped. Personal-profile publishing does not depend on this.
   */
  async listPublications(): Promise<MediumPublication[]> {
    this.logger.debug('listPublications is best-effort in browser mode; returning []');
    return [];
  }

  // ── Publishing ──────────────────────────────────────────────────────────

  /**
   * Compose and publish a story in the Medium editor.
   *
   * - `draft`  → the editor autosaves the story as a draft; we read its URL.
   * - `public` → opens the publish dialog, sets tags, and clicks "Publish now".
   * - `unlisted` → published, then marked unlisted if the option is available.
   */
  async createPost(request: CreatePostRequest): Promise<MediumPost> {
    const html =
      request.contentFormat === 'markdown' ? markdownToHtml(request.content) : request.content;
    const plain =
      request.contentFormat === 'markdown'
        ? toPlainText(request.content)
        : request.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const status = request.publishStatus ?? 'draft';
    const ctx = await this.getContext();
    if (!(await this.hasAuthCookie(ctx))) {
      throw new AuthError('Not logged in to Medium. Run the `medium_login` tool first.');
    }
    const page = await this.getPage();

    await page.goto(NEW_STORY_URL, { waitUntil: 'domcontentloaded' });

    // Title.
    const title = await this.firstVisible(page, SELECTORS.title, this.actionTimeoutMs);
    await title.click();
    await page.keyboard.type(request.title, { delay: 10 });
    await page.keyboard.press('Enter');

    // Body — paste rich HTML so headings/lists/code/images survive.
    await this.pasteHtml(page, html, plain);
    // Let Medium autosave settle so the draft URL is assigned.
    await page.waitForTimeout(1_500);

    if (status === 'draft') {
      const url = await this.resolvePostUrl(page);
      this.logger.info('Saved Medium draft', { url });
      return this.toPost(request, url, 'draft');
    }

    // Public / unlisted: open the publish dialog.
    const publishBtn = await this.firstVisible(page, SELECTORS.publishButton, this.actionTimeoutMs);
    await publishBtn.click();

    await this.addTags(page, (request.tags ?? []).slice(0, 5));

    if (status === 'unlisted') {
      await this.selectUnlisted(page);
    }

    const confirm = await this.firstVisible(page, SELECTORS.confirmPublish, this.actionTimeoutMs);
    await Promise.all([
      page.waitForLoadState('domcontentloaded').catch(() => undefined),
      confirm.click(),
    ]);
    await page.waitForTimeout(2_000);

    const url = await this.resolvePostUrl(page);
    this.logger.info('Published Medium post', { url, status });
    return this.toPost(request, url, status);
  }

  /** Write `html` to the clipboard and paste it into the focused editor body. */
  private async pasteHtml(page: Page, html: string, plain: string): Promise<void> {
    try {
      const body = await this.firstVisible(page, SELECTORS.body, this.actionTimeoutMs).catch(
        () => null,
      );
      if (body) await body.click();
      await page.evaluate(
        async ({ h, p }) => {
          // Runs in the browser; type the DOM globals absent from Node's lib.
          const g = globalThis as unknown as {
            ClipboardItem: new (items: Record<string, Blob>) => unknown;
            Blob: new (parts: unknown[], opts?: { type?: string }) => Blob;
            navigator: { clipboard: { write(data: unknown[]): Promise<void> } };
          };
          const item = new g.ClipboardItem({
            'text/html': new g.Blob([h], { type: 'text/html' }),
            'text/plain': new g.Blob([p], { type: 'text/plain' }),
          });
          await g.navigator.clipboard.write([item]);
        },
        { h: html, p: plain },
      );
      await page.keyboard.press('Control+V');
    } catch (err) {
      // Fallback: type the plain text so at least the content lands.
      this.logger.warn('HTML paste failed; falling back to plain-text insert', {
        error: err instanceof Error ? err.message : String(err),
      });
      await page.keyboard.insertText(plain);
    }
  }

  /** Type each tag into the publish dialog's topic input. */
  private async addTags(page: Page, tags: string[]): Promise<void> {
    if (tags.length === 0) return;
    try {
      const input = await this.firstVisible(page, SELECTORS.tagInput, this.actionTimeoutMs);
      for (const tag of tags) {
        await input.click();
        await input.type(tag, { delay: 10 });
        await page.keyboard.press('Enter');
      }
    } catch (err) {
      this.logger.warn('Could not set tags', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /** Best-effort: flip the publish dialog to "unlisted" if the control exists. */
  private async selectUnlisted(page: Page): Promise<void> {
    const candidates = [
      'text=/unlisted/i',
      'input[type="checkbox"][name*="unlisted" i]',
    ];
    for (const selector of candidates) {
      const el = page.locator(selector).first();
      if ((await el.count()) > 0) {
        await el.click().catch(() => undefined);
        return;
      }
    }
    this.logger.warn('Unlisted control not found; publishing as public');
  }

  /** Read back the story URL from the editor/post page. */
  private async resolvePostUrl(page: Page): Promise<string> {
    // Prefer an explicit "View story" link if present after publishing.
    const viewLink = page.locator('a:has-text("View story"), a:has-text("view story")').first();
    if ((await viewLink.count()) > 0) {
      const href = await viewLink.getAttribute('href').catch(() => null);
      if (href) return href.startsWith('http') ? href : `${MEDIUM_ORIGIN}${href}`;
    }
    return page.url();
  }

  /**
   * Derive Medium's post id from a story URL. Handles the editor form
   * (`/p/<id>/edit`) and the published form (`…/slug-<id>`).
   */
  private deriveId(url: string): string {
    const clean = (url.split('?')[0] ?? url).replace(/\/edit\/?$/, '');
    const editor = /\/p\/([0-9a-fA-F]+)/.exec(clean);
    if (editor) return editor[1]!;
    const slug = /-([0-9a-fA-F]{6,})$/.exec(clean);
    if (slug) return slug[1]!;
    return clean.split('/').filter(Boolean).pop() ?? clean;
  }

  private toPost(
    request: CreatePostRequest,
    url: string,
    publishStatus: MediumPost['publishStatus'],
  ): MediumPost {
    return {
      id: this.deriveId(url),
      title: request.title,
      authorId: this.cachedUser?.id ?? 'me',
      tags: (request.tags ?? []).slice(0, 5),
      url,
      canonicalUrl: request.canonicalUrl ?? '',
      publishStatus,
      license: request.license ?? 'all-rights-reserved',
      licenseUrl: '',
    };
  }
}
