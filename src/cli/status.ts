#!/usr/bin/env node
/**
 * Print whether a valid Medium session exists. Run with `bun run session`.
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
    base: { service: 'medium-status' },
  });
  const medium = new MediumService({
    sessionDir: cfg.medium.sessionDir,
    headless: cfg.medium.headless,
    actionTimeoutMs: cfg.medium.actionTimeoutMs,
    logger,
  });

  try {
    const result = await medium.validateSession();
    if (result.valid) {
      process.stderr.write(
        `✅ Session active. Signed in as ${result.user.name} (@${result.user.username}).\n`,
      );
    } else {
      process.stderr.write(`❌ No active session: ${result.reason}\n`);
      process.exitCode = 1;
    }
  } finally {
    await medium.close();
  }
}

void main();
