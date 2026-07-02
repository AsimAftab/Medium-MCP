/**
 * Built-in article templates and writing personas.
 *
 * A template provides a structural skeleton (outline + guidance) that seeds
 * article generation. Personas describe tone/voice presets used by rewrite and
 * persona tools. Both are extensible via {@link registerTemplate} /
 * {@link registerPersona} (plugin architecture).
 */

export interface ArticleTemplate {
  id: string;
  name: string;
  description: string;
  /** Ordered section headings the article should contain. */
  outline: string[];
  /** Suggested tags for this kind of article. */
  suggestedTags: string[];
  /** Writing guidance passed to the host model. */
  guidance: string;
  defaultTone: string;
}

export interface WritingPersona {
  id: string;
  name: string;
  description: string;
  /** Voice/style directives applied when writing or rewriting. */
  directives: string[];
}

const TEMPLATES: ArticleTemplate[] = [
  {
    id: 'technical-tutorial',
    name: 'Technical Tutorial',
    description: 'Step-by-step how-to with code, prerequisites and takeaways.',
    outline: [
      'Introduction — the problem and what the reader will build',
      'Prerequisites',
      'Step 1 — Setup',
      'Step 2 — Core implementation',
      'Step 3 — Testing and validation',
      'Common pitfalls',
      'Conclusion and next steps',
    ],
    suggestedTags: ['programming', 'tutorial', 'software-development'],
    guidance:
      'Use concrete, runnable code blocks with language hints. Explain the why before the how. Keep steps atomic and verifiable.',
    defaultTone: 'technical',
  },
  {
    id: 'case-study',
    name: 'Case Study',
    description: 'Narrative of a real problem, approach, results and lessons.',
    outline: [
      'Context — the situation and stakeholders',
      'The challenge',
      'The approach',
      'Implementation details',
      'Results and metrics',
      'Lessons learned',
      'Conclusion',
    ],
    suggestedTags: ['case-study', 'engineering', 'lessons-learned'],
    guidance:
      'Lead with measurable outcomes. Use specific numbers. Balance narrative with concrete detail.',
    defaultTone: 'professional',
  },
  {
    id: 'opinion',
    name: 'Opinion',
    description: 'A persuasive argument for a point of view.',
    outline: [
      'Hook — the provocative claim',
      'Why this matters now',
      'Argument 1',
      'Argument 2',
      'Steelman the counterargument',
      'Rebuttal',
      'Call to action',
    ],
    suggestedTags: ['opinion', 'technology', 'culture'],
    guidance:
      'Take a clear stance early. Address the strongest opposing view honestly. End with conviction.',
    defaultTone: 'conversational',
  },
  {
    id: 'startup-story',
    name: 'Startup Story',
    description: 'Founding journey, pivots, traction and learnings.',
    outline: [
      'The spark — why we started',
      'Early days and first customers',
      'The hard pivot',
      'What worked',
      'What we got wrong',
      'Where we are now',
      'Advice for founders',
    ],
    suggestedTags: ['startup', 'entrepreneurship', 'founders'],
    guidance:
      'Be candid and specific. Share real numbers and real failures. Readers reward vulnerability.',
    defaultTone: 'storytelling',
  },
  {
    id: 'engineering-blog',
    name: 'Engineering Blog',
    description: 'Deep technical dive into a system or decision.',
    outline: [
      'Background and constraints',
      'The problem',
      'Design options considered',
      'The chosen architecture',
      'Trade-offs and results',
      'What we would do differently',
    ],
    suggestedTags: ['engineering', 'architecture', 'backend'],
    guidance: 'Include diagrams (as prompts), benchmarks and trade-off tables.',
    defaultTone: 'technical',
  },
  {
    id: 'ai-tutorial',
    name: 'AI Tutorial',
    description: 'Hands-on guide to building with AI/LLMs.',
    outline: [
      'What we are building and why',
      'Concepts you need',
      'Setting up the environment',
      'Building the core pipeline',
      'Prompting and evaluation',
      'Productionizing',
      'Conclusion',
    ],
    suggestedTags: ['artificial-intelligence', 'machine-learning', 'llm'],
    guidance:
      'Ground abstract concepts in runnable examples. Note model/version specifics and costs.',
    defaultTone: 'technical',
  },
  {
    id: 'product-launch',
    name: 'Product Launch',
    description: 'Announcement post introducing a product or feature.',
    outline: [
      'The one-line pitch',
      'The problem it solves',
      'Key features',
      'How it works',
      'Pricing / availability',
      'Get started',
    ],
    suggestedTags: ['product', 'launch', 'saas'],
    guidance: 'Lead with the benefit, not the feature list. End with a single clear CTA.',
    defaultTone: 'startup',
  },
  {
    id: 'weekly-newsletter',
    name: 'Weekly Newsletter',
    description: 'Curated roundup with commentary.',
    outline: [
      'Intro — theme of the week',
      'Top story',
      'Quick hits',
      'Tool of the week',
      'Closing thought',
    ],
    suggestedTags: ['newsletter', 'roundup', 'tech'],
    guidance: 'Keep it scannable. Add a personal take to each item.',
    defaultTone: 'conversational',
  },
  {
    id: 'learning-journal',
    name: 'Learning Journal',
    description: 'Reflection on something recently learned.',
    outline: [
      'What I set out to learn',
      'How I approached it',
      'Key insights',
      'What surprised me',
      'What is next',
    ],
    suggestedTags: ['learning', 'growth', 'reflection'],
    guidance: 'Honest, first-person and specific. Show the messy middle.',
    defaultTone: 'casual',
  },
  {
    id: 'personal-story',
    name: 'Personal Story',
    description: 'A personal narrative with a universal takeaway.',
    outline: [
      'The moment',
      'The backstory',
      'The turning point',
      'The resolution',
      'The lesson',
    ],
    suggestedTags: ['life', 'personal', 'inspiration'],
    guidance: 'Use scene and sensory detail. Earn the lesson; do not state it too early.',
    defaultTone: 'storytelling',
  },
  {
    id: 'career-advice',
    name: 'Career Advice',
    description: 'Actionable guidance for professional growth.',
    outline: [
      'The common mistake',
      'Why it happens',
      'A better approach',
      'Concrete steps',
      'A real example',
      'Summary',
    ],
    suggestedTags: ['career', 'advice', 'productivity'],
    guidance: 'Be prescriptive. Every section should give the reader something to do.',
    defaultTone: 'professional',
  },
  {
    id: 'programming-guide',
    name: 'Programming Guide',
    description: 'Comprehensive reference-style guide to a topic.',
    outline: [
      'Overview',
      'Core concepts',
      'Practical patterns',
      'Anti-patterns',
      'Performance considerations',
      'Further reading',
    ],
    suggestedTags: ['programming', 'guide', 'software-development'],
    guidance: 'Aim for completeness. Use tables and code liberally. Link to references.',
    defaultTone: 'technical',
  },
  {
    id: 'open-source-announcement',
    name: 'Open Source Announcement',
    description: 'Introduce and rally support for an OSS project.',
    outline: [
      'What it is',
      'Why we built it',
      'Features and demo',
      'Getting started',
      'Roadmap',
      'How to contribute',
    ],
    suggestedTags: ['open-source', 'github', 'developer-tools'],
    guidance: 'Show, do not tell — include a quickstart. Make contributing feel easy.',
    defaultTone: 'startup',
  },
];

const PERSONAS: WritingPersona[] = [
  {
    id: 'professional',
    name: 'Professional',
    description: 'Polished, authoritative, precise.',
    directives: [
      'Use confident, clear declarative sentences.',
      'Avoid slang and filler.',
      'Support claims with specifics.',
    ],
  },
  {
    id: 'casual',
    name: 'Casual',
    description: 'Relaxed and approachable.',
    directives: ['Write like talking to a smart friend.', 'Contractions welcome.'],
  },
  {
    id: 'technical',
    name: 'Technical',
    description: 'Precise, detailed, code-first.',
    directives: [
      'Be exact with terminology.',
      'Prefer examples and code to prose.',
      'Call out edge cases and trade-offs.',
    ],
  },
  {
    id: 'academic',
    name: 'Academic',
    description: 'Formal, cited, measured.',
    directives: ['Use formal register.', 'Hedge appropriately.', 'Reference sources.'],
  },
  {
    id: 'startup',
    name: 'Startup',
    description: 'Energetic, benefit-driven, momentum-oriented.',
    directives: ['Lead with impact.', 'Short punchy sentences.', 'One clear CTA.'],
  },
  {
    id: 'founder',
    name: 'Founder',
    description: 'Candid, first-person, lessons-driven.',
    directives: ['Share real numbers and mistakes.', 'Speak from experience.'],
  },
  {
    id: 'storytelling',
    name: 'Storytelling',
    description: 'Narrative, scene-driven, emotional arc.',
    directives: ['Open in a scene.', 'Use sensory detail.', 'Build to a turn.'],
  },
  {
    id: 'conversational',
    name: 'Conversational',
    description: 'Direct address, second person, engaging.',
    directives: ['Talk to “you”.', 'Ask rhetorical questions.', 'Keep it lively.'],
  },
];

export class TemplateService {
  private templates = new Map<string, ArticleTemplate>();
  private personas = new Map<string, WritingPersona>();

  constructor() {
    for (const t of TEMPLATES) this.templates.set(t.id, t);
    for (const p of PERSONAS) this.personas.set(p.id, p);
  }

  listTemplates(): ArticleTemplate[] {
    return [...this.templates.values()];
  }

  getTemplate(id: string): ArticleTemplate | undefined {
    return this.templates.get(id);
  }

  /** Register or override a template (plugin extension point). */
  registerTemplate(template: ArticleTemplate): void {
    this.templates.set(template.id, template);
  }

  listPersonas(): WritingPersona[] {
    return [...this.personas.values()];
  }

  getPersona(id: string): WritingPersona | undefined {
    return this.personas.get(id);
  }

  registerPersona(persona: WritingPersona): void {
    this.personas.set(persona.id, persona);
  }
}
