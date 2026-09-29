/**
 * Scoring for the model eval harness (scripts/eval-models.ts): how far a
 * transcript is from what was actually said. Pure functions, no I/O.
 *
 * - WER (word error rate) for languages written with spaces.
 * - CER (character error rate) for Chinese, Japanese and Korean, where
 *   "words" aren't reliably space-separated.
 */

const CHARACTER_SCORED = new Set(['zh', 'ja', 'ko']);

export type ErrorRate = { metric: 'WER' | 'CER'; rate: number; errors: number; length: number };

/**
 * Lowercase, drop punctuation/symbols, collapse spaces. Accents and Arabic
 * diacritics are removed too (a transcript writing "esta" for "está" is
 * not a listening mistake). CJK text keeps its marks: decomposing Korean
 * would split syllables into letters.
 */
export function normalizeForScoring(text: string, lang: string): string {
  let t = text.normalize('NFKC').toLowerCase();
  if (!CHARACTER_SCORED.has(lang)) t = t.normalize('NFD').replace(/\p{M}/gu, '');
  return t
    .replace(/[\p{P}\p{S}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function scoringUnits(text: string, lang: string): string[] {
  const normalized = normalizeForScoring(text, lang);
  if (!normalized) return [];
  return CHARACTER_SCORED.has(lang) ? [...normalized.replace(/ /g, '')] : normalized.split(' ');
}

/** Levenshtein distance over tokens (substitutions + insertions + deletions). */
export function editDistance(a: readonly string[], b: readonly string[]): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = curr;
  }
  return prev[b.length];
}

export function errorRate(reference: string, hypothesis: string, lang: string): ErrorRate {
  const ref = scoringUnits(reference, lang);
  const hyp = scoringUnits(hypothesis, lang);
  const errors = editDistance(ref, hyp);
  return {
    metric: CHARACTER_SCORED.has(lang) ? 'CER' : 'WER',
    errors,
    length: ref.length,
    rate: ref.length === 0 ? (hyp.length === 0 ? 0 : 1) : errors / ref.length,
  };
}

/** Rough spoken length when the real duration isn't known: ~2.5 words/s, ~4 CJK chars/s. */
export function estimateSpeechSeconds(text: string, lang: string): number {
  const units = scoringUnits(text, lang).length;
  return Math.max(1, CHARACTER_SCORED.has(lang) ? units / 4 : units / 2.5);
}
