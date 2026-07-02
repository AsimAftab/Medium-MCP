import { describe, it, expect } from 'vitest';
import { diffLines, diffStats, renderDiff } from '../src/utils/diff.js';

describe('diff', () => {
  it('detects additions and removals', () => {
    const lines = diffLines('a\nb\nc', 'a\nx\nc');
    const stats = diffStats(lines);
    expect(stats.added).toBe(1);
    expect(stats.removed).toBe(1);
    expect(stats.unchanged).toBe(2);
  });

  it('renders a unified-style diff', () => {
    const rendered = renderDiff(diffLines('a', 'b'));
    expect(rendered).toContain('- a');
    expect(rendered).toContain('+ b');
  });

  it('reports no changes for identical text', () => {
    const stats = diffStats(diffLines('same\ntext', 'same\ntext'));
    expect(stats.added).toBe(0);
    expect(stats.removed).toBe(0);
  });
});
