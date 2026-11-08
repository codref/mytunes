export { cleanReturnedLyrics, parseLyriaTranscript } from './lyriaTranscript';

export type DiffSide = 'left' | 'right' | 'both';

export type DiffRow =
  | { kind: 'equal'; left: string; right: string }
  | { kind: 'change'; left: string; right: string }
  | { kind: 'remove'; left: string }
  | { kind: 'add'; right: string };

export type HighlightToken = {
  text: string;
  common: boolean;
};

function normalizeLine(line: string): string {
  return line.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Line-level LCS diff (Myers-ish via classic DP). Fine for lyric sheet sizes. */
export function diffLyricLines(leftText: string, rightText: string): DiffRow[] {
  const a = leftText.split('\n');
  const b = rightText.split('\n');
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      if (normalizeLine(a[i]!) === normalizeLine(b[j]!)) {
        dp[i]![j] = (dp[i + 1]![j + 1] ?? 0) + 1;
      } else {
        dp[i]![j] = Math.max(dp[i + 1]![j] ?? 0, dp[i]![j + 1] ?? 0);
      }
    }
  }

  const rows: DiffRow[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (normalizeLine(a[i]!) === normalizeLine(b[j]!)) {
      rows.push({ kind: 'equal', left: a[i]!, right: b[j]! });
      i += 1;
      j += 1;
    } else if ((dp[i + 1]![j] ?? 0) >= (dp[i]![j + 1] ?? 0)) {
      rows.push({ kind: 'remove', left: a[i]! });
      i += 1;
    } else {
      rows.push({ kind: 'add', right: b[j]! });
      j += 1;
    }
  }
  while (i < n) {
    rows.push({ kind: 'remove', left: a[i]! });
    i += 1;
  }
  while (j < m) {
    rows.push({ kind: 'add', right: b[j]! });
    j += 1;
  }

  // Pair adjacent remove+add into change for denser side-by-side.
  const paired: DiffRow[] = [];
  for (let k = 0; k < rows.length; k += 1) {
    const cur = rows[k]!;
    const next = rows[k + 1];
    if (cur.kind === 'remove' && next?.kind === 'add') {
      paired.push({ kind: 'change', left: cur.left, right: next.right });
      k += 1;
    } else {
      paired.push(cur);
    }
  }
  return paired;
}

function tokenizePreserve(line: string): string[] {
  // Keep whitespace tokens so we can reassemble the line.
  return line.split(/(\s+)/).filter((t) => t.length > 0);
}

function wordKey(token: string): string {
  return token.toLowerCase().replace(/[^a-z0-9']/g, '');
}

/** Highlight tokens that appear in the other side's significant-word set. */
export function highlightCommonWords(line: string, otherLine: string): HighlightToken[] {
  const otherKeys = new Set(
    tokenizePreserve(otherLine)
      .map(wordKey)
      .filter((k) => k.length >= 2),
  );
  return tokenizePreserve(line).map((text) => {
    const key = wordKey(text);
    const isWord = key.length >= 2;
    return { text, common: isWord && otherKeys.has(key) };
  });
}

export function highlightAgainstCorpus(line: string, corpusKeys: Set<string>): HighlightToken[] {
  return tokenizePreserve(line).map((text) => {
    const key = wordKey(text);
    const isWord = key.length >= 2;
    return { text, common: isWord && corpusKeys.has(key) };
  });
}

export function significantWordKeys(text: string): Set<string> {
  const keys = new Set<string>();
  for (const line of text.split('\n')) {
    for (const tok of tokenizePreserve(line)) {
      const key = wordKey(tok);
      if (key.length >= 3) keys.add(key);
    }
  }
  return keys;
}

export function diffSummary(rows: DiffRow[]): {
  equal: number;
  changed: number;
  onlyLeft: number;
  onlyRight: number;
} {
  let equal = 0;
  let changed = 0;
  let onlyLeft = 0;
  let onlyRight = 0;
  for (const row of rows) {
    if (row.kind === 'equal') equal += 1;
    else if (row.kind === 'change') changed += 1;
    else if (row.kind === 'remove') onlyLeft += 1;
    else onlyRight += 1;
  }
  return { equal, changed, onlyLeft, onlyRight };
}
