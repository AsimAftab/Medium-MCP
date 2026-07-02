/**
 * Reusable Zod building blocks shared across tool input schemas.
 */
import { z } from 'zod';

export const publishStatusSchema = z.enum(['draft', 'public', 'unlisted']);
export const visibilitySchema = z.enum(['public', 'unlisted', 'private']);

export const toneSchema = z
  .enum([
    'professional',
    'casual',
    'technical',
    'academic',
    'startup',
    'founder',
    'storytelling',
    'conversational',
  ])
  .describe('Writing voice/tone.');

export const markdownField = z.string().min(1).describe('Article body in Markdown.');

export const titleField = z.string().min(1).max(200).describe('Article title.');

export const tagsField = z
  .array(z.string().min(1).max(40))
  .max(5)
  .optional()
  .describe('Up to 5 Medium tags.');

export const articleIdField = z
  .string()
  .min(1)
  .describe('Local article id (e.g. art_xxx).');

export const licenseSchema = z
  .enum([
    'all-rights-reserved',
    'cc-40-by',
    'cc-40-by-sa',
    'cc-40-by-nd',
    'cc-40-by-nc',
    'cc-40-by-nc-nd',
    'cc-40-by-nc-sa',
    'cc-40-zero',
    'public-domain',
  ])
  .describe('Content license.');
