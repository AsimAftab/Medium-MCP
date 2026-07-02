import { describe, it, expect } from 'vitest';
import { PromptBuilder } from '../src/services/prompt-builder.js';

const pb = new PromptBuilder();

describe('PromptBuilder', () => {
  it('builds a create-article instruction with constraints and outline', () => {
    const ix = pb.buildCreateArticle({
      topic: 'AI Agents',
      tone: 'technical',
      language: 'en',
      targetWords: 2500,
      keywords: ['agents', 'orchestration'],
    });
    expect(ix.instruction).toContain('AI Agents');
    expect(ix.constraints.join(' ')).toContain('2500');
    expect(ix.constraints.join(' ')).toContain('agents');
    expect(ix.scaffold).toContain('outline');
  });

  it('renders an instruction to a single string with all sections', () => {
    const ix = pb.buildImprove('# Draft\n\nBody.', ['clarity']);
    const rendered = pb.render(ix);
    expect(rendered).toContain('# Task');
    expect(rendered).toContain('## Constraints');
    expect(rendered).toContain('## Output format');
    expect(rendered).toContain('## Source');
  });

  it('builds summarize variants', () => {
    expect(pb.buildSummarize('x', 'social').instruction).toMatch(/social/i);
    expect(pb.buildSummarize('x', 'tldr').instruction).toMatch(/TL;DR/i);
  });
});
