/**
 * Session + account tools: log in to Medium (browser), check session status,
 * log out, fetch the current user, list publications, and view/reload config.
 *
 * Medium no longer issues API tokens, so authentication is a one-time browser
 * login whose session is persisted to disk. See {@link ../services/medium-service.ts}.
 */
import { z } from 'zod';
import type { Registrar } from '../server/tool-registry.js';

export function registerConfigTools(tool: Registrar): void {
  tool({
    name: 'medium_login',
    title: 'Medium Login',
    description:
      'Open a browser window to sign in to Medium. Complete the login (Google/email/2FA all work) in the window that appears; the session is saved to disk and reused headlessly for publishing. Run this once, or again whenever the session expires.',
    inputSchema: {
      timeoutSeconds: z
        .number()
        .int()
        .min(30)
        .max(600)
        .default(180)
        .describe('How long to wait for you to finish signing in.'),
    },
    handler: async (args, ctx) => {
      const timeoutMs = Number(args.timeoutSeconds ?? 180) * 1000;
      const user = await ctx.medium.login(timeoutMs);
      return {
        text: `Logged in as ${user.name} (@${user.username}). Session saved — publishing will now run headless.`,
        data: { user },
      };
    },
  });

  tool({
    name: 'session_status',
    title: 'Session Status',
    description: 'Check whether a valid Medium browser session exists.',
    inputSchema: {},
    handler: async (_args, ctx) => {
      const result = await ctx.medium.validateSession();
      if (result.valid) {
        return {
          text: `Session is active. Signed in as ${result.user.name} (@${result.user.username}).`,
          data: { valid: true, user: result.user },
        };
      }
      return {
        text: `No active session: ${result.reason}`,
        data: { valid: false, reason: result.reason },
      };
    },
  });

  tool({
    name: 'medium_logout',
    title: 'Medium Logout',
    description: 'Clear the saved Medium session. You will need to run medium_login again to publish.',
    inputSchema: {},
    handler: async (_args, ctx) => {
      await ctx.medium.logout();
      return { text: 'Session cleared.', data: { ok: true } };
    },
  });

  tool({
    name: 'current_user',
    title: 'Current User',
    description: 'Return the signed-in Medium user profile.',
    inputSchema: {},
    handler: async (_args, ctx) => {
      const user = await ctx.medium.currentUser();
      return { text: `${user.name} (@${user.username}) — ${user.url}`, data: user };
    },
  });

  tool({
    name: 'list_publications',
    title: 'List Publications',
    description:
      'List Medium publications the user can contribute to (best-effort in browser mode; personal-profile publishing does not require this).',
    inputSchema: {},
    handler: async (_args, ctx) => {
      const pubs = await ctx.medium.listPublications();
      return {
        text: pubs.length
          ? pubs.map((p) => `- ${p.name} (${p.id})`).join('\n')
          : 'No publications available.',
        data: { publications: pubs },
      };
    },
  });

  tool({
    name: 'get_config',
    title: 'Get Configuration',
    description: 'Return the current effective configuration (secrets redacted).',
    inputSchema: {},
    handler: (_args, ctx) => {
      const cfg = ctx.config.get();
      const safe = {
        medium: {
          sessionDir: cfg.medium.sessionDir,
          headless: cfg.medium.headless,
          actionTimeoutMs: cfg.medium.actionTimeoutMs,
          sessionActive: ctx.medium.hasSession(),
        },
        defaults: cfg.defaults,
        autosaveIntervalMs: cfg.autosaveIntervalMs,
        dataDir: cfg.dataDir,
        research: { provider: cfg.research.provider },
        logging: cfg.logging,
      };
      return { text: JSON.stringify(safe, null, 2), data: safe };
    },
  });

  tool({
    name: 'reload_config',
    title: 'Reload Configuration',
    description:
      'Reload configuration from the environment and apply overrides without restarting. Reconfigures live services (session dir, headless mode, research provider, log level).',
    inputSchema: {
      overrides: z
        .record(z.string())
        .optional()
        .describe('Key/value env overrides to apply (e.g. { MEDIUM_LOG_LEVEL: "debug" }).'),
    },
    handler: (args, ctx) => {
      const next = ctx.reload((args.overrides as Record<string, string>) ?? {});
      return {
        text: `Configuration reloaded. Log level: ${next.logging.level}, research: ${next.research.provider}.`,
        data: { logging: next.logging, research: next.research.provider },
      };
    },
  });
}
