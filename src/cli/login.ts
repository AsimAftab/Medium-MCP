#!/usr/bin/env node
/**
 * Standalone login helper.
 *
 * Opens a visible browser so you can sign in to Medium once, then persists the
 * session to `MEDIUM_SESSION_DIR`. The MCP server reuses the same session, so
 * after this succeeds `publish_article` works headlessly. Run with `bun run login`.
 *
 * Diagnostics go to stderr; nothing is written to stdout.
 */
import { loadConfig } from '../config/config.js';
import { Logger } from '../utils/logger.js';
import { MediumService } from '../services/medium-service.js';

async function main(): Promise<void> {
  const cfg = loadConfig();
  const logger = new Logger({
    level: cfg.logging.level,
    verbose: cfg.logging.verbose,
    base: { service: 'medium-login' },
  });
  const medium = new MediumService({
    sessionDir: cfg.medium.sessionDir,
    headless: cfg.medium.headless,
    actionTimeoutMs: cfg.medium.actionTimeoutMs,
    logger,
  });

  process.stderr.write(
    `Opening a browser window for Medium login…\n` +
      `Session dir: ${cfg.medium.sessionDir}\n\n`,
  );

  try {
    await medium.beginLogin();
    process.stderr.write(
      `A browser window is open. Sign in normally (Google/email/2FA all work) and\n` +
        `solve any "verify you are human" check. When you're fully signed in,\n` +
        `come back here and press Enter…`,
    );
    await waitForEnter();

    const user = await medium.completeLogin();
    process.stderr.write(
      `\n✅ Logged in as ${user.name} (@${user.username}). Session saved — publishing will now run headless.\n`,
    );
  } catch (err) {
    process.stderr.write(
      `\n❌ Login failed: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    process.exitCode = 1;
  } finally {
    await medium.close();
  }
}

/** Resolve when the user presses Enter in the terminal. */
function waitForEnter(): Promise<void> {
  return new Promise((resolve) => {
    process.stdin.resume();
    process.stdin.once('data', () => {
      process.stdin.pause();
      resolve();
    });
  });
}

void main();
