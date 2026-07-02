/**
 * AI writing-assistant tools. Most return a model instruction; a few
 * (reading level, tone consistency) are computed deterministically.
 */
import { z } from 'zod';
import type { Registrar } from '../server/tool-registry.js';
import { markdownField } from '../schemas/common.js';
import { fleschReadingEase, readingLevelLabel, countWords, toPlainText } from '../utils/text.js';

/** Canonical assistant commands mapped to concrete instructions. */
const COMMANDS: Record<string, string> = {
  improve_paragraph: 'Improve this paragraph for clarity, flow and impact.',
  rewrite_for_beginners: 'Rewrite this for a beginner audience with no prior knowledge.',
  explain_with_analogies: 'Rewrite this explaining the concepts using vivid analogies.',
  make_more_technical: 'Make this more technically precise and detailed.',
  reduce_ai_sounding: 'Rewrite to sound naturally human: vary sentence length, cut generic phrasing, remove hedging and clichés.',
  increase_engagement: 'Rewrite to maximize engagement: stronger hooks, direct address, vivid verbs.',
  improve_storytelling: 'Rewrite to strengthen the narrative arc and scene-setting.',
  improve_hook: 'Rewrite the opening into a compelling hook that earns the next sentence.',
  stronger_conclusion: 'Rewrite the conclusion to be more memorable and actionable.',
  humanize: 'Humanize this text: natural rhythm, concrete detail, personality — while preserving meaning.',
};

export function registerAssistantTools(tool: Registrar): void {
  tool({
    name: 'ai_assistant',
    title: 'AI Writing Assistant',
    description:
      'Run a targeted writing command over a fragment of text (improve paragraph, rewrite for beginners, explain with analogies, make more technical, reduce AI-sounding text, increase engagement, improve storytelling/hook, stronger conclusion, humanize).',
    inputSchema: {
      text: z.string().min(1).describe('The text/paragraph to transform.'),
      command: z
        .enum([
          'improve_paragraph',
          'rewrite_for_beginners',
          'explain_with_analogies',
          'make_more_technical',
          'reduce_ai_sounding',
          'increase_engagement',
          'improve_storytelling',
          'improve_hook',
          'stronger_conclusion',
          'humanize',
        ])
        .describe('The transformation to apply.'),
      customInstruction: z.string().optional().describe('Override with a custom instruction.'),
    },
    handler: (args, ctx) => {
      const command =
        (args.customInstruction as string | undefined) ??
        COMMANDS[String(args.command)] ??
        'Improve this text.';
      const ix = ctx.prompts.buildAssistant(command, String(args.text));
      return { text: ctx.prompts.render(ix), data: { instruction: ix } };
    },
  });

  const generator = (
    name: string,
    title: string,
    description: string,
    command: string,
    countable = false,
  ): void => {
    tool({
      name,
      title,
      description,
      inputSchema: {
        markdown: markdownField,
        ...(countable ? { count: z.number().int().min(1).max(15).default(5) } : {}),
      },
      handler: (args, ctx) => {
        const extra = countable ? [`Provide ${Number(args.count ?? 5)} options.`] : [];
        const ix = ctx.prompts.buildAssistant(command, String(args.markdown), extra);
        return { text: ctx.prompts.render(ix), data: { instruction: ix } };
      },
    });
  };

  generator(
    'generate_title',
    'Generate Title',
    'Generate a single click-worthy title for the article.',
    'Generate one click-worthy, honest, specific title for this article.',
  );
  generator(
    'generate_titles',
    'Generate Alternative Titles',
    'Generate several alternative titles.',
    'Generate distinct, high-quality alternative titles for this article.',
    true,
  );
  generator(
    'generate_subtitle',
    'Generate Subtitle',
    'Generate subtitle options for the article.',
    'Generate compelling subtitle options that complement the title.',
    true,
  );
  generator(
    'generate_tags',
    'Generate Tags',
    'Generate 5 relevant Medium tags.',
    'Generate exactly 5 relevant, popular Medium tags as a comma-separated list.',
  );
  generator(
    'generate_summary',
    'Generate Summary',
    'Generate a short summary of the article.',
    'Write a concise 2–3 sentence summary of this article.',
  );

  tool({
    name: 'reading_level',
    title: 'Reading Level Analysis',
    description: 'Compute Flesch reading-ease score and grade-level label (deterministic).',
    inputSchema: { markdown: markdownField },
    handler: (args) => {
      const score = fleschReadingEase(String(args.markdown));
      const label = readingLevelLabel(score);
      return {
        text: `Reading ease: ${score}/100 — ${label}`,
        data: { score, label, wordCount: countWords(String(args.markdown)) },
      };
    },
  });

  tool({
    name: 'tone_consistency',
    title: 'Tone Consistency Analysis',
    description:
      'Heuristically flag tone inconsistencies (formality swings, person shifts) for review.',
    inputSchema: { markdown: markdownField },
    handler: (args) => {
      const plain = toPlainText(String(args.markdown));
      const paragraphs = plain.split(/\n{2,}/).filter((p) => p.trim().length > 40);
      const firstPerson = paragraphs.filter((p) => /\b(I|we|my|our)\b/i.test(p)).length;
      const secondPerson = paragraphs.filter((p) => /\byou(r)?\b/i.test(p)).length;
      const contractions = paragraphs.filter((p) => /\b\w+'(s|re|ll|ve|t|d)\b/i.test(p)).length;
      const total = paragraphs.length || 1;
      const notes: string[] = [];
      if (firstPerson > 0 && secondPerson > 0 && Math.min(firstPerson, secondPerson) / total > 0.2) {
        notes.push('Mixes first-person and second-person voice; consider standardizing.');
      }
      if (contractions > 0 && contractions < total && contractions / total < 0.5) {
        notes.push('Inconsistent use of contractions (formality swings between paragraphs).');
      }
      return {
        text: notes.length ? `Possible tone issues:\n- ${notes.join('\n- ')}` : 'Tone appears consistent.',
        data: { paragraphs: total, firstPerson, secondPerson, contractions, notes },
      };
    },
  });
}
