/**
 * Prompt-composition engine for the AI writing tools.
 *
 * Design note: an MCP server does not (and should not) embed its own LLM — the
 * calling assistant is the model. Writing tools therefore return a precise,
 * self-contained *instruction* payload plus any source content and deterministic
 * scaffolding (outline, word target, SEO constraints). The host model executes
 * the instruction and returns finished prose, which can then be saved with
 * `create_article` / `update_article`. This keeps the server deterministic,
 * dependency-light and model-agnostic.
 */
import type { ArticleTemplate, WritingPersona } from './template-service.js';

export interface WritingInstruction {
  /** The directive the host model should follow. */
  instruction: string;
  /** Structured constraints for the model to honor. */
  constraints: string[];
  /** Source content to operate on (may be empty for fresh generation). */
  source?: string;
  /** Deterministic scaffolding (outline, headings, etc.). */
  scaffold?: string;
  /** How the model should return its result. */
  outputContract: string;
}

const MEDIUM_STYLE = [
  'Write in Markdown compatible with Medium (ATX headings, fenced code blocks with language hints, standard lists, links and images).',
  'Do not include front-matter or HTML unless explicitly asked.',
  'Use an H1 only for the title; use H2/H3 for sections.',
];

export interface CreateArticleParams {
  topic: string;
  outline?: string[];
  keywords?: string[];
  tone: string;
  audience?: string;
  targetWords?: number;
  template?: ArticleTemplate;
  language: string;
}

export class PromptBuilder {
  buildCreateArticle(p: CreateArticleParams): WritingInstruction {
    const outline = p.outline?.length
      ? p.outline
      : p.template?.outline ?? [
          'Introduction with a strong hook',
          'Background / context',
          '2–4 core sections',
          'Practical example or application',
          'Conclusion',
          'Call to action',
        ];

    const constraints = [
      `Tone/voice: ${p.tone}.`,
      `Language: ${p.language}.`,
      p.audience ? `Audience: ${p.audience}.` : 'Audience: a curious, technically-literate reader.',
      p.targetWords
        ? `Target length: approximately ${p.targetWords} words (±10%).`
        : 'Target length: 1200–1800 words.',
      p.keywords?.length
        ? `Naturally incorporate these keywords: ${p.keywords.join(', ')}.`
        : 'Choose and weave in 3–5 relevant SEO keywords.',
      ...MEDIUM_STYLE,
      p.template?.guidance ?? 'Prioritize clarity, specificity and skimmable structure.',
    ];

    return {
      instruction: `Write a complete, publication-ready Medium article about: "${p.topic}".`,
      constraints,
      scaffold: `Suggested outline:\n${outline.map((s, i) => `${i + 1}. ${s}`).join('\n')}`,
      outputContract:
        'Return the full article as Markdown. Begin with a single `# Title` line, then a one-line *subtitle* in italics, then the body. After the article, append a `---` separator followed by a `Tags:` line (5 comma-separated tags) and a `Meta description:` line (≤160 chars).',
    };
  }

  buildContinue(source: string, direction?: string): WritingInstruction {
    return {
      instruction: 'Continue this draft seamlessly from where it stops.',
      constraints: [
        'Match the existing tone, tense and formatting exactly.',
        direction ? `Direction: ${direction}.` : 'Advance the logical next section.',
        ...MEDIUM_STYLE,
      ],
      source,
      outputContract: 'Return only the newly-written continuation in Markdown (do not repeat the source).',
    };
  }

  buildRewrite(source: string, persona: WritingPersona): WritingInstruction {
    return {
      instruction: `Rewrite this article in a ${persona.name} voice.`,
      constraints: [...persona.directives, 'Preserve all facts, structure and code.', ...MEDIUM_STYLE],
      source,
      outputContract: 'Return the fully rewritten article as Markdown.',
    };
  }

  buildSummarize(source: string, kind: 'tldr' | 'executive' | 'social'): WritingInstruction {
    const spec = {
      tldr: 'A 2–3 sentence TL;DR.',
      executive: 'A one-paragraph executive summary (4–6 sentences) suitable for stakeholders.',
      social: 'A punchy social-media summary under 280 characters with 2–3 hashtags.',
    }[kind];
    return {
      instruction: `Summarize the article as: ${spec}`,
      constraints: ['Preserve the core thesis.', 'No new information.'],
      source,
      outputContract: 'Return only the summary text.',
    };
  }

  buildExpand(source: string, factor: number): WritingInstruction {
    return {
      instruction: `Expand this content to roughly ${factor}× its length.`,
      constraints: [
        'Add depth, examples, and detail — not filler.',
        'Preserve tone and structure; deepen existing sections before adding new ones.',
        ...MEDIUM_STYLE,
      ],
      source,
      outputContract: 'Return the expanded article as Markdown.',
    };
  }

  buildShorten(source: string, targetWords?: number): WritingInstruction {
    return {
      instruction: targetWords
        ? `Shorten this article to approximately ${targetWords} words.`
        : 'Shorten this article by roughly 40% while preserving meaning.',
      constraints: ['Keep every key point.', 'Cut redundancy and hedging.', ...MEDIUM_STYLE],
      source,
      outputContract: 'Return the shortened article as Markdown.',
    };
  }

  buildImprove(source: string, focus?: string[]): WritingInstruction {
    return {
      instruction: 'Improve this article end-to-end.',
      constraints: [
        `Improve: ${(focus ?? ['grammar', 'clarity', 'transitions', 'formatting', 'readability']).join(', ')}.`,
        'Do not change the author’s intent or facts.',
        ...MEDIUM_STYLE,
      ],
      source,
      outputContract: 'Return the improved article as Markdown, followed by a short bullet list of the changes you made.',
    };
  }

  /** Generic single-instruction assistant command over a fragment of text. */
  buildAssistant(command: string, source: string, extra: string[] = []): WritingInstruction {
    return {
      instruction: command,
      constraints: [...extra, ...MEDIUM_STYLE],
      source,
      outputContract: 'Return only the revised text in Markdown.',
    };
  }

  /** Render an instruction into a single human/model-readable prompt string. */
  render(ix: WritingInstruction): string {
    const parts = [`# Task\n${ix.instruction}`];
    if (ix.constraints.length) {
      parts.push(`\n## Constraints\n${ix.constraints.map((c) => `- ${c}`).join('\n')}`);
    }
    if (ix.scaffold) parts.push(`\n## Scaffold\n${ix.scaffold}`);
    parts.push(`\n## Output format\n${ix.outputContract}`);
    if (ix.source) parts.push(`\n## Source\n\n${ix.source}`);
    return parts.join('\n');
  }
}
