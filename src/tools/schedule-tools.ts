/**
 * Scheduling tools backed by the local scheduling queue + poller.
 */
import { z } from 'zod';
import type { Registrar } from '../server/tool-registry.js';
import { articleIdField, publishStatusSchema } from '../schemas/common.js';
import { ValidationError } from '../utils/errors.js';

export function registerScheduleTools(tool: Registrar): void {
  tool({
    name: 'schedule_publish',
    title: 'Schedule Publish',
    description:
      'Schedule a stored article to publish at a future ISO-8601 time. The server maintains a local queue (Medium has no native scheduling) and publishes when due while running.',
    inputSchema: {
      id: articleIdField,
      scheduledFor: z.string().datetime().describe('ISO-8601 timestamp in the future.'),
      publishStatus: publishStatusSchema.default('public'),
      publication: z.string().optional(),
    },
    handler: async (args, ctx) => {
      const when = Date.parse(String(args.scheduledFor));
      if (when <= Date.now()) {
        throw new ValidationError('scheduledFor must be in the future.');
      }
      await ctx.store.get(String(args.id)); // ensure it exists
      const entry = await ctx.store.addSchedule({
        articleId: String(args.id),
        scheduledFor: String(args.scheduledFor),
        publishStatus: args.publishStatus as 'draft' | 'public' | 'unlisted',
        publication: args.publication as string | undefined,
      });
      return {
        text: `Scheduled "${String(args.id)}" for ${entry.scheduledFor} (schedule id: ${entry.id}).`,
        data: entry,
      };
    },
  });

  tool({
    name: 'list_scheduled',
    title: 'List Scheduled',
    description: 'List scheduled publishes.',
    inputSchema: { includeCompleted: z.boolean().default(false) },
    handler: async (args, ctx) => {
      const items = await ctx.store.listSchedule(Boolean(args.includeCompleted));
      return {
        text: items.length
          ? items.map((s) => `- ${s.scheduledFor} · ${s.articleId} · ${s.status} (${s.id})`).join('\n')
          : 'Nothing scheduled.',
        data: { scheduled: items },
      };
    },
  });

  tool({
    name: 'cancel_schedule',
    title: 'Cancel Schedule',
    description: 'Cancel a pending scheduled publish.',
    inputSchema: { scheduleId: z.string().min(1) },
    handler: async (args, ctx) => {
      const entry = await ctx.store.cancelSchedule(String(args.scheduleId));
      return { text: `Cancelled schedule ${entry.id}.`, data: entry };
    },
  });

  tool({
    name: 'run_due_schedules',
    title: 'Run Due Schedules',
    description: 'Immediately process any scheduled publishes whose time has arrived.',
    inputSchema: {},
    handler: async (_args, ctx) => {
      const processed = await ctx.scheduler.tick();
      return {
        text: `Processed ${processed.length} due schedule(s).`,
        data: { processed },
      };
    },
  });
}
