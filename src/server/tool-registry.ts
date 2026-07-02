/**
 * Tool registration helpers.
 *
 * Wraps `McpServer.registerTool` with consistent structured-content responses,
 * per-call request ids, timing, and typed error translation so every tool has
 * uniform observability and error semantics.
 */
import type { McpServer, ToolCallback } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ZodRawShape } from 'zod';
import { toAppError } from '../utils/errors.js';
import { newRequestId } from '../utils/logger.js';
import type { Container } from './container.js';

export interface ToolResult {
  /** Human-readable text summary (always shown to the model/user). */
  text: string;
  /** Optional machine-readable payload attached as structured content. */
  data?: unknown;
}

export type ToolHandler<TArgs> = (
  args: TArgs,
  ctx: Container,
) => Promise<ToolResult> | ToolResult;

export interface ToolDefinition<Shape extends ZodRawShape> {
  name: string;
  title: string;
  description: string;
  inputSchema: Shape;
  handler: ToolHandler<Record<string, unknown>>;
}

/**
 * Build the registrar bound to a container. Returns a `tool()` function used by
 * each domain module to declare its tools.
 */
export function createRegistrar(server: McpServer, ctx: Container) {
  return function tool<Shape extends ZodRawShape>(def: ToolDefinition<Shape>): void {
    const callback = async (args: Record<string, unknown>): Promise<CallToolResult> => {
        const requestId = newRequestId();
        const log = ctx.logger.child({ tool: def.name, requestId });
        const start = Date.now();
        try {
          log.debug('Tool invoked', { args: redact(args) });
          const result = await def.handler(args, ctx);
          log.info('Tool succeeded', { durationMs: Date.now() - start });
          const response: CallToolResult = {
            content: [{ type: 'text', text: result.text }],
          };
          if (result.data !== undefined) {
            response.structuredContent = { data: result.data };
          }
          return response;
        } catch (err) {
          const appErr = toAppError(err);
          log.error('Tool failed', {
            durationMs: Date.now() - start,
            code: appErr.code,
            message: appErr.message,
          });
          return {
            isError: true,
            content: [{ type: 'text', text: `Error [${appErr.code}]: ${appErr.message}` }],
            structuredContent: { error: appErr.toJSON() },
          };
        }
      };

    server.registerTool(
      def.name,
      {
        title: def.title,
        description: def.description,
        inputSchema: def.inputSchema,
      },
      callback as unknown as ToolCallback<Shape>,
    );
  };
}

export type Registrar = ReturnType<typeof createRegistrar>;

/** Redact obviously sensitive fields before logging tool arguments. */
function redact(args: Record<string, unknown>): Record<string, unknown> {
  const clone: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args)) {
    clone[k] = /token|key|secret|password/i.test(k) ? '«redacted»' : v;
  }
  return clone;
}
