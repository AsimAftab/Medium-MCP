#!/usr/bin/env node
/**
 * medium-mcp entrypoint.
 *
 * Connects the MCP server over stdio. All diagnostics go to stderr so stdout
 * stays reserved for the MCP protocol.
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { buildServer } from './server/server.js';

async function main(): Promise<void> {
  const { server, container } = buildServer();
  const logger = container.logger;

  const transport = new StdioServerTransport();
  await server.connect(transport);

  logger.info('medium-mcp started', {
    sessionActive: container.medium.hasSession(),
    dataDir: container.config.get().dataDir,
  });

  const shutdown = (signal: string): void => {
    logger.info('Shutting down', { signal });
    container.scheduler.stop();
    void Promise.resolve(container.medium.close())
      .catch(() => undefined)
      .then(() => server.close())
      .finally(() => process.exit(0));
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  // Log, then exit: after an uncaught exception the process (and possibly the
  // stdio transport) is in an undefined state — limping on risks corrupt data.
  process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception', { error: err.message, stack: err.stack });
    container.scheduler.stop();
    process.exit(1);
  });
  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled rejection', { reason: String(reason) });
    container.scheduler.stop();
    process.exit(1);
  });
}

main().catch((err) => {
  process.stderr.write(
    `${JSON.stringify({ level: 'error', msg: 'Fatal startup error', error: String(err) })}\n`,
  );
  process.exit(1);
});
