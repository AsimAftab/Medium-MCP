/**
 * Constructs the MCP server: registers tools, prompts and resources, and starts
 * the local scheduler poller.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerAllTools } from '../tools/index.js';
import { registerPrompts } from '../prompts/index.js';
import { registerResources } from './resources.js';
import { createContainer, type Container } from './container.js';
import type { ConfigStore } from '../config/config.js';

export interface BuiltServer {
  server: McpServer;
  container: Container;
}

/** Build a fully-configured MCP server and its dependency container. */
export function buildServer(configStore?: ConfigStore): BuiltServer {
  const container = createContainer(configStore);

  const server = new McpServer(
    { name: 'medium-mcp', version: '1.0.0' },
    {
      instructions:
        'Medium MCP: research, write, edit, optimize, schedule and publish Medium articles. ' +
        'Writing/generation tools return a brief for you to fulfill; then persist with save_draft ' +
        'and publish with publish_article. Deterministic tools (markdown, SEO, quality, sections) ' +
        'operate directly. Configure MEDIUM_TOKEN to enable publishing.',
      capabilities: {
        tools: {},
        prompts: {},
        resources: {},
        logging: {},
      },
    },
  );

  registerAllTools(server, container);
  registerPrompts(server, container);
  registerResources(server, container);

  container.scheduler.start();

  return { server, container };
}
