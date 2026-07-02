/**
 * Image-prompt generation for popular text-to-image models. Produces
 * model-tuned prompt strings for hero/thumbnail/banner/diagram imagery.
 * The server never calls image APIs itself; it crafts prompts the user can
 * paste into DALL·E, Midjourney, Flux or Stable Diffusion.
 */

export type ImageModel = 'dalle' | 'midjourney' | 'flux' | 'stable-diffusion';
export type ImageKind = 'hero' | 'thumbnail' | 'banner' | 'diagram';

const KIND_SPEC: Record<ImageKind, { aspect: string; intent: string }> = {
  hero: { aspect: '16:9', intent: 'a striking editorial hero image' },
  thumbnail: { aspect: '1:1', intent: 'a bold, high-contrast thumbnail that reads at small size' },
  banner: { aspect: '3:1', intent: 'a wide banner suitable for the top of an article' },
  diagram: { aspect: '4:3', intent: 'a clean, labeled conceptual diagram' },
};

const MODEL_SUFFIX: Record<ImageModel, (aspect: string) => string> = {
  dalle: () => 'Style: modern, clean, professional. High detail, cohesive color palette.',
  midjourney: (aspect) =>
    `--ar ${aspect} --style raw --stylize 250 --quality 2`,
  flux: (aspect) => `Aspect ratio ${aspect}. Photorealistic detail, balanced composition.`,
  'stable-diffusion': () =>
    'masterpiece, best quality, highly detailed, sharp focus, professional lighting',
};

export interface ImagePromptResult {
  model: ImageModel;
  kind: ImageKind;
  aspectRatio: string;
  prompt: string;
  negativePrompt?: string;
}

export class ImageService {
  /**
   * Build an image prompt tuned to the target model and image kind.
   *
   * @param subject the article topic / desired subject
   * @param kind hero | thumbnail | banner | diagram
   * @param model target image model
   * @param mood optional stylistic mood (e.g. "dark, futuristic")
   */
  buildPrompt(
    subject: string,
    kind: ImageKind,
    model: ImageModel,
    mood?: string,
  ): ImagePromptResult {
    const spec = KIND_SPEC[kind];
    const moodClause = mood ? `, mood: ${mood}` : '';
    const core = `${spec.intent} representing "${subject}"${moodClause}`;
    const suffix = MODEL_SUFFIX[model](spec.aspect);
    const prompt =
      model === 'midjourney'
        ? `${core} ${suffix}`
        : `${core}. ${suffix}`;

    const result: ImagePromptResult = {
      model,
      kind,
      aspectRatio: spec.aspect,
      prompt,
    };
    if (model === 'stable-diffusion' || model === 'flux') {
      result.negativePrompt =
        'blurry, low quality, distorted, watermark, text artifacts, extra limbs, jpeg artifacts';
    }
    return result;
  }
}
