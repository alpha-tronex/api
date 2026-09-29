import { describe, expect, test } from 'vitest';
import {
  DEFAULT_MODELS,
  getModelConfig,
  speechParams,
  transcriptionLanguageParams,
  TTS_INSTRUCTIONS,
} from '../models';

describe('getModelConfig', () => {
  test('uses the defaults when nothing is set', () => {
    expect(getModelConfig({})).toEqual({ ...DEFAULT_MODELS, translateReasoningEffort: undefined });
  });

  test('lets every model be overridden from Vercel env vars (instant rollback)', () => {
    expect(
      getModelConfig({
        STT_MODEL: 'whisper-1',
        TRANSLATE_MODEL: 'gpt-6-luna',
        TRANSLATE_REASONING_EFFORT: 'None',
        TTS_MODEL: 'tts-1',
        TTS_VOICE: 'alloy',
      })
    ).toEqual({
      sttModel: 'whisper-1',
      translateModel: 'gpt-6-luna',
      translateReasoningEffort: 'none',
      ttsModel: 'tts-1',
      ttsVoice: 'alloy',
    });
  });

  test('ignores malformed values instead of sending them to OpenAI', () => {
    const config = getModelConfig({ STT_MODEL: 'bad model; drop', TRANSLATE_REASONING_EFFORT: 'turbo', TTS_VOICE: ' ' });
    expect(config.sttModel).toBe(DEFAULT_MODELS.sttModel);
    expect(config.translateReasoningEffort).toBeUndefined();
    expect(config.ttsVoice).toBe(DEFAULT_MODELS.ttsVoice);
  });
});

describe('transcriptionLanguageParams', () => {
  test('gpt-transcribe takes a languages array', () => {
    expect(transcriptionLanguageParams('gpt-transcribe', 'fr')).toEqual({ languages: ['fr'] });
  });

  test('whisper-1 and gpt-4o transcribe models take a single language', () => {
    expect(transcriptionLanguageParams('whisper-1', 'fr')).toEqual({ language: 'fr' });
    expect(transcriptionLanguageParams('gpt-4o-mini-transcribe', 'fr')).toEqual({ language: 'fr' });
  });

  test('sends no hint for "auto" or a missing language, so the model detects it', () => {
    expect(transcriptionLanguageParams('gpt-transcribe', 'auto')).toEqual({});
    expect(transcriptionLanguageParams('whisper-1', null)).toEqual({});
  });
});

describe('speechParams', () => {
  const config = getModelConfig({});

  test('uses gpt-4o-mini-tts with the configured voice and clear-speech instructions', () => {
    expect(speechParams(config, 'Hola')).toEqual({
      model: 'gpt-4o-mini-tts',
      voice: 'marin',
      input: 'Hola',
      instructions: TTS_INSTRUCTIONS,
    });
  });

  test('rolling back to tts-1 drops instructions and swaps a newer-only voice for alloy', () => {
    expect(speechParams({ ...config, ttsModel: 'tts-1' }, 'Hola')).toEqual({
      model: 'tts-1',
      voice: 'alloy',
      input: 'Hola',
    });
  });

  test('keeps a voice tts-1 supports', () => {
    expect(speechParams({ ...config, ttsModel: 'tts-1-hd', ttsVoice: 'nova' }, 'Hi').voice).toBe('nova');
  });
});
