import { describe, expect, test } from 'vitest';
import { editDistance, errorRate, estimateSpeechSeconds, normalizeForScoring, scoringUnits } from '../evalScoring';

describe('normalizeForScoring', () => {
  test('ignores case, punctuation and accents, which are not listening mistakes', () => {
    expect(normalizeForScoring('¿Dónde está la estación?', 'es')).toBe('donde esta la estacion');
    expect(normalizeForScoring("Où est la gare ?", 'fr')).toBe('ou est la gare');
  });

  test('strips Arabic diacritics', () => {
    expect(normalizeForScoring('أُرِيدُ كُوبًا', 'ar')).toBe(normalizeForScoring('أريد كوبا', 'ar'));
  });

  test('keeps Korean syllables intact', () => {
    expect(normalizeForScoring('물 한 잔 주세요.', 'ko')).toBe('물 한 잔 주세요');
  });
});

describe('scoringUnits', () => {
  test('splits spaced languages into words', () => {
    expect(scoringUnits('Where is the station?', 'en')).toEqual(['where', 'is', 'the', 'station']);
  });

  test('splits Chinese, Japanese and Korean into characters, ignoring spaces', () => {
    expect(scoringUnits('我想要一杯水。', 'zh')).toEqual(['我', '想', '要', '一', '杯', '水']);
    expect(scoringUnits('물 한 잔', 'ko')).toEqual(['물', '한', '잔']);
  });
});

describe('editDistance', () => {
  test.each([
    [[], [], 0],
    [['a', 'b', 'c'], ['a', 'b', 'c'], 0],
    [['a', 'b', 'c'], ['a', 'x', 'c'], 1],
    [['a', 'b', 'c'], ['a', 'c'], 1],
    [['a', 'c'], ['a', 'b', 'c'], 1],
    [['k', 'i', 't', 't', 'e', 'n'], ['s', 'i', 't', 't', 'i', 'n', 'g'], 3],
  ])('%j → %j = %i', (a, b, d) => {
    expect(editDistance(a, b)).toBe(d);
  });
});

describe('errorRate', () => {
  test('a perfect transcript scores 0 even with different punctuation and case', () => {
    expect(errorRate('Where is the train station?', 'where is the train station', 'en')).toEqual({
      metric: 'WER',
      rate: 0,
      errors: 0,
      length: 5,
    });
  });

  test('one wrong word out of five is a 20% WER', () => {
    expect(errorRate('Where is the train station?', 'Where is the rain station?', 'en').rate).toBeCloseTo(0.2);
  });

  test('uses CER for Japanese', () => {
    const result = errorRate('駅はどこですか？', '駅はどこでしか', 'ja');
    expect(result.metric).toBe('CER');
    expect(result.errors).toBe(1);
  });

  test('an empty transcript of real speech is a 100% error', () => {
    expect(errorRate('Hello there', '', 'en').rate).toBe(1);
  });
});

describe('estimateSpeechSeconds', () => {
  test('estimates about 2.5 words per second, with a 1-second floor', () => {
    expect(estimateSpeechSeconds('one two three four five', 'en')).toBe(2);
    expect(estimateSpeechSeconds('Hi', 'en')).toBe(1);
  });
});
