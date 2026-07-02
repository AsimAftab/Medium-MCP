/**
 * Image-prompt tools for DALL·E, Midjourney, Flux and Stable Diffusion.
 */
import { z } from 'zod';
import type { Registrar } from '../server/tool-registry.js';
import type { ImageKind, ImageModel } from '../services/image-service.js';

export function registerImageTools(tool: Registrar): void {
  tool({
    name: 'generate_image_prompt',
    title: 'Generate Image Prompt',
    description:
      'Generate a text-to-image prompt (hero/thumbnail/banner/diagram) tuned for DALL·E, Midjourney, Flux or Stable Diffusion.',
    inputSchema: {
      subject: z.string().min(1).describe('Article topic / desired subject.'),
      kind: z.enum(['hero', 'thumbnail', 'banner', 'diagram']).default('hero'),
      model: z
        .enum(['dalle', 'midjourney', 'flux', 'stable-diffusion'])
        .default('dalle'),
      mood: z.string().optional().describe('Optional stylistic mood (e.g. "dark, futuristic").'),
    },
    handler: (args, ctx) => {
      const result = ctx.images.buildPrompt(
        String(args.subject),
        args.kind as ImageKind,
        args.model as ImageModel,
        args.mood as string | undefined,
      );
      const text = [
        `Prompt (${result.model}, ${result.kind}, ${result.aspectRatio}):`,
        result.prompt,
        result.negativePrompt ? `\nNegative: ${result.negativePrompt}` : '',
      ]
        .filter(Boolean)
        .join('\n');
      return { text, data: result };
    },
  });

  tool({
    name: 'set_featured_image',
    title: 'Set Featured Image',
    description: 'Attach a featured/hero image URL to a stored article.',
    inputSchema: { id: z.string().min(1), imageUrl: z.string().url() },
    handler: async (args, ctx) => {
      const article = await ctx.store.get(String(args.id));
      const updated = await ctx.store.update(
        { ...article, featuredImageUrl: String(args.imageUrl) },
        'set_featured_image',
      );
      return { text: `Featured image set for "${updated.title}".`, data: { id: updated.id } };
    },
  });
}
