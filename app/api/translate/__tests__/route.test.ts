import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const { chatCreate, speechCreate, enforceRateLimit } = vi.hoisted(() => ({
  chatCreate: vi.fn(),
  speechCreate: vi.fn(),
  enforceRateLimit: vi.fn(),
}));

vi.mock('openai', () => ({
  default: vi.fn(function OpenAI() {
    return {
      chat: { completions: { create: chatCreate } },
      audio: { speech: { create: speechCreate } },
    };
  }),
}));
vi.mock('@/lib/ratelimit', () => ({ enforceRateLimit }));

import { POST } from '../route';
import { MAX_TRANSCRIPT_CHARS } from '@/lib/limits';

function translate(body: unknown) {
  return new NextRequest('http://localhost/api/translate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  chatCreate.mockReset().mockResolvedValue({ choices: [{ message: { content: ' Hola ' } }] });
  speechCreate.mockReset().mockResolvedValue({ arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer });
  enforceRateLimit.mockReset().mockResolvedValue(null);
});

describe('POST /api/translate', () => {
  test('returns the trimmed translation and base64 MP3 audio', async () => {
    const res = await POST(translate({ transcript: 'Hello', fromLang: 'en', toLang: 'es' }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ translation: 'Hola', audioBase64: 'AQID', mimeType: 'audio/mpeg' });
    expect(speechCreate).toHaveBeenCalledWith(expect.objectContaining({ input: 'Hola' }));
  });

  test('returns the rate limiter response without calling OpenAI', async () => {
    enforceRateLimit.mockResolvedValue(NextResponse.json({ error: 'Too many requests' }, { status: 429 }));

    const res = await POST(translate({ transcript: 'Hello', fromLang: 'en', toLang: 'es' }));

    expect(res.status).toBe(429);
    expect(chatCreate).not.toHaveBeenCalled();
    expect(speechCreate).not.toHaveBeenCalled();
  });

  test('rejects text over 1,000 characters with 413 before calling OpenAI', async () => {
    const res = await POST(
      translate({ transcript: 'a'.repeat(MAX_TRANSCRIPT_CHARS + 1), fromLang: 'en', toLang: 'es' })
    );

    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: 'Text too long' });
    expect(chatCreate).not.toHaveBeenCalled();
  });

  test('returns 400 when a field is missing', async () => {
    expect((await POST(translate({ transcript: 'Hello', fromLang: 'en' }))).status).toBe(400);
  });

  test('returns a generic 500 when OpenAI fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    chatCreate.mockRejectedValue(new Error('upstream'));

    const res = await POST(translate({ transcript: 'Hello', fromLang: 'en', toLang: 'es' }));

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Translation failed' });
  });
});
