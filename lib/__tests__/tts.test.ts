import { beforeEach, describe, expect, test, vi } from 'vitest';
import { getModelConfig, TTS_INSTRUCTIONS } from '../models';
import { DEFAULT_TTS_SERVICE_TIMEOUT_MS, synthesizeSpeech, ttsProviderFor, ttsServiceTimeoutMs } from '../tts';

const models = getModelConfig({});
const speechCreate = vi.fn();
const openai = { audio: { speech: { create: speechCreate } } } as never;
const fetchImpl = vi.fn();
const env = { TTS_SERVICE_URL: 'https://tts.example.test', TTS_SERVICE_KEY: 'shared-secret' };

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  speechCreate.mockReset().mockResolvedValue({ arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer });
  fetchImpl.mockReset().mockResolvedValue(new Response(new Uint8Array([7, 8]), { status: 200 }));
});

describe('ttsProviderFor', () => {
  test('follows the language list, defaulting to OpenAI', () => {
    expect(ttsProviderFor('wo')).toBe('local');
    expect(ttsProviderFor('bm')).toBe('local');
    expect(ttsProviderFor('es')).toBe('openai');
    expect(ttsProviderFor('xx')).toBe('openai');
  });
});

describe('ttsServiceTimeoutMs', () => {
  test('defaults to 12 seconds and accepts a sensible override', () => {
    expect(ttsServiceTimeoutMs({})).toBe(DEFAULT_TTS_SERVICE_TIMEOUT_MS);
    expect(ttsServiceTimeoutMs({ TTS_SERVICE_TIMEOUT_MS: '20000' })).toBe(20_000);
  });

  test.each(['0', '-5', 'abc', '999', '600000'])('ignores a bad value (%s)', (value) => {
    expect(ttsServiceTimeoutMs({ TTS_SERVICE_TIMEOUT_MS: value })).toBe(DEFAULT_TTS_SERVICE_TIMEOUT_MS);
  });
});

describe('synthesizeSpeech', () => {
  test('OpenAI languages use the voice model with the given instructions', async () => {
    const audio = await synthesizeSpeech({ text: 'Hola', lang: 'es', models, instructions: 'Say it kindly.' }, { openai, fetchImpl, env });

    expect(audio).toEqual(Buffer.from([1, 2, 3]));
    expect(speechCreate).toHaveBeenCalledWith(expect.objectContaining({ input: 'Hola', instructions: 'Say it kindly.' }));
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test('uses the normal instructions when none are given', async () => {
    await synthesizeSpeech({ text: 'Hola', lang: 'es', models }, { openai, fetchImpl, env });

    expect(speechCreate).toHaveBeenCalledWith(expect.objectContaining({ instructions: TTS_INSTRUCTIONS }));
  });

  test('Wolof goes to tts-service with the shared secret and a timeout', async () => {
    const audio = await synthesizeSpeech({ text: 'Na nga def?', lang: 'wo', models }, { openai, fetchImpl, env });

    expect(audio).toEqual(Buffer.from([7, 8]));
    expect(speechCreate).not.toHaveBeenCalled();
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://tts.example.test/speak');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json', 'X-TTS-Key': 'shared-secret' });
    expect(JSON.parse(init.body)).toEqual({ lang: 'wo', text: 'Na nga def?' });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  test('a trailing slash on TTS_SERVICE_URL is fine', async () => {
    await synthesizeSpeech({ text: 'I ni ce', lang: 'bm', models }, { openai, fetchImpl, env: { ...env, TTS_SERVICE_URL: 'https://tts.example.test//' } });

    expect(fetchImpl.mock.calls[0][0]).toBe('https://tts.example.test/speak');
  });

  test.each([
    ['the URL is not set', { TTS_SERVICE_KEY: 'k' }],
    ['the key is not set', { TTS_SERVICE_URL: 'https://tts.example.test' }],
  ])('returns null without calling out when %s', async (_why, partialEnv) => {
    const audio = await synthesizeSpeech({ text: 'Na nga def?', lang: 'wo', models }, { openai, fetchImpl, env: partialEnv });

    expect(audio).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test.each([
    ['the service answers with an error', () => fetchImpl.mockResolvedValue(new Response('nope', { status: 500 }))],
    ['the service is unreachable', () => fetchImpl.mockRejectedValue(new Error('ECONNREFUSED'))],
    ['the service times out', () => fetchImpl.mockRejectedValue(new DOMException('timed out', 'TimeoutError'))],
    ['the service returns an empty body', () => fetchImpl.mockResolvedValue(new Response(new Uint8Array(0), { status: 200 }))],
  ])('returns null when %s', async (_why, arrange) => {
    arrange();

    expect(await synthesizeSpeech({ text: 'Na nga def?', lang: 'wo', models }, { openai, fetchImpl, env })).toBeNull();
  });

  test('returns null when the OpenAI voice fails', async () => {
    speechCreate.mockRejectedValue(new Error('rate limited'));

    expect(await synthesizeSpeech({ text: 'Hola', lang: 'es', models }, { openai, fetchImpl, env })).toBeNull();
  });

  test('logs why audio failed but never the text', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    fetchImpl.mockRejectedValue(new Error('ECONNREFUSED'));

    await synthesizeSpeech({ text: 'sama mbóot', lang: 'wo', models }, { openai, fetchImpl, env });

    expect(JSON.stringify(error.mock.calls)).toContain('ECONNREFUSED');
    expect(JSON.stringify(error.mock.calls)).not.toContain('sama');
  });
});
