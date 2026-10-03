import { describe, expect, test } from 'vitest';
import { getLanguage, isSupportedTarget, LANGUAGE_NAMES, LANGUAGES, supportsSpeechInput } from '../languages';

describe('languages', () => {
  test('codes are unique', () => {
    const codes = LANGUAGES.map((l) => l.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  test('the eight original languages use the OpenAI voice and can be spoken into the app', () => {
    for (const code of ['en', 'es', 'fr', 'de', 'zh', 'ar', 'ja', 'ko']) {
      expect(getLanguage(code)).toMatchObject({ ttsProvider: 'openai', speechInput: true });
    }
  });

  test('Wolof and Bambara use the self-hosted voice and are text-only as input', () => {
    expect(getLanguage('wo')).toMatchObject({ name: 'Wolof', ttsProvider: 'local', speechInput: false });
    expect(getLanguage('bm')).toMatchObject({ name: 'Bambara', ttsProvider: 'local', speechInput: false });
  });

  test('only exact known codes match, so client text can never pick a language', () => {
    expect(getLanguage('WO')).toBeUndefined();
    expect(getLanguage('wo; drop table')).toBeUndefined();
    expect(getLanguage(undefined)).toBeUndefined();
    expect(getLanguage(42)).toBeUndefined();
    expect(getLanguage('constructor')).toBeUndefined();
    expect(isSupportedTarget('toString')).toBe(false);
  });

  test('LANGUAGE_NAMES is derived from the list', () => {
    expect(LANGUAGE_NAMES.wo).toBe('Wolof');
    expect(Object.keys(LANGUAGE_NAMES)).toHaveLength(LANGUAGES.length);
  });

  test('speech input: no for Wolof and Bambara, yes for the rest and for "auto"', () => {
    expect(supportsSpeechInput('wo')).toBe(false);
    expect(supportsSpeechInput('bm')).toBe(false);
    expect(supportsSpeechInput('fr')).toBe(true);
    expect(supportsSpeechInput('auto')).toBe(true);
  });
});
