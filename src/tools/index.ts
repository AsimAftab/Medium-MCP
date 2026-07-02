/**
 * Registers every tool module against the MCP server.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createRegistrar } from '../server/tool-registry.js';
import type { Container } from '../server/container.js';
import { registerWritingTools } from './writing-tools.js';
import { registerEditingTools } from './editing-tools.js';
import { registerSeoTools } from './seo-tools.js';
import { registerAssistantTools } from './assistant-tools.js';
import { registerContentTools } from './content-tools.js';
import { registerPublishTools } from './publish-tools.js';
import { registerConfigTools } from './config-tools.js';
import { registerResearchTools } from './research-tools.js';
import { registerImageTools } from './image-tools.js';
import { registerScheduleTools } from './schedule-tools.js';
import { registerMiscTools } from './misc-tools.js';

/** Wire all tool modules into the server. */
export function registerAllTools(server: McpServer, ctx: Container): void {
  const tool = createRegistrar(server, ctx);
  registerWritingTools(tool);
  registerEditingTools(tool);
  registerSeoTools(tool);
  registerAssistantTools(tool);
  registerContentTools(tool);
  registerPublishTools(tool);
  registerConfigTools(tool);
  registerResearchTools(tool);
  registerImageTools(tool);
  registerScheduleTools(tool);
  registerMiscTools(tool);
}
