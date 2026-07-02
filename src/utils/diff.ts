/**
 * Minimal line-level diff (LCS-based) for article comparison / revision review.
 */
export interface DiffLine {
  type: 'add' | 'remove' | 'context';
  text: string;
}

/** Compute a line diff between two texts. */
export function diffLines(a: string, b: string): DiffLine[] {
  const left = a.split('\n');
  const right = b.split('\n');
  const n = left.length;
  const m = right.length;

  // LCS length table.
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      lcs[i]![j] =
        left[i] === right[j]
          ? lcs[i + 1]![j + 1]! + 1
          : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }

  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (left[i] === right[j]) {
      out.push({ type: 'context', text: left[i]! });
      i += 1;
      j += 1;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      out.push({ type: 'remove', text: left[i]! });
      i += 1;
    } else {
      out.push({ type: 'add', text: right[j]! });
      j += 1;
    }
  }
  while (i < n) out.push({ type: 'remove', text: left[i++]! });
  while (j < m) out.push({ type: 'add', text: right[j++]! });
  return out;
}

/** Render a diff as a unified-style string. */
export function renderDiff(lines: DiffLine[]): string {
  return lines
    .map((l) => (l.type === 'add' ? `+ ${l.text}` : l.type === 'remove' ? `- ${l.text}` : `  ${l.text}`))
    .join('\n');
}

export interface DiffStats {
  added: number;
  removed: number;
  unchanged: number;
}

export function diffStats(lines: DiffLine[]): DiffStats {
  return lines.reduce<DiffStats>(
    (acc, l) => {
      if (l.type === 'add') acc.added += 1;
      else if (l.type === 'remove') acc.removed += 1;
      else acc.unchanged += 1;
      return acc;
    },
    { added: 0, removed: 0, unchanged: 0 },
  );
}
