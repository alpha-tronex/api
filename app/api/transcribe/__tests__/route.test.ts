import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const { transcriptionsCreate, enforceRateLimit } = vi.hoisted(() => ({
  transcriptionsCreate: vi.fn(),
  enforceRateLimit: vi.fn(),
}));

vi.mock('openai', () => ({
  default: vi.fn(function OpenAI() {
    return { audio: { transcriptions: { create: transcriptionsCreate } } };
  }),
  toFile: vi.fn(async (file: unknown) => file),
}));
vi.mock('@/lib/ratelimit', () => ({ enforceRateLimit }));

import { POST } from '../route';
import { MAX_AUDIO_BYTES } from '@/lib/limits';

function upload(fields: { audio?: Blob; fromLang?: string }, headers: Record<string, string> = {}) {
  const form = new FormData();
  if (fields.audio) form.append('audio', fields.audio, 'recording.m4a');
  if (fields.fromLang) form.append('fromLang', fields.fromLang);
  return new NextRequest('http://localhost/api/transcribe', { method: 'POST', body: form, headers });
}

const smallAudio = () => new Blob([new Uint8Array(1024)], { type: 'audio/m4a' });

beforeEach(() => {
  transcriptionsCreate.mockReset();
  enforceRateLimit.mockReset().mockResolvedValue(null);
});

describe('POST /api/transcribe', () => {
  test('returns the transcript for a valid upload', async () => {
    transcriptionsCreate.mockResolvedValue({ text: 'Where is the station?' });

    const res = await POST(upload({ audio: smallAudio(), fromLang: 'en' }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ transcript: 'Where is the station?' });
    expect(transcriptionsCreate).toHaveBeenCalledWith(expect.objectContaining({ language: 'en' }));
  });

  test('returns the rate limiter response without calling OpenAI', async () => {
    enforceRateLimit.mockResolvedValue(
      NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': '30' } })
    );

    const res = await POST(upload({ audio: smallAudio(), fromLang: 'en' }));

    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('30');
    expect(transcriptionsCreate).not.toHaveBeenCalled();
  });

  test('rejects a declared upload over the cap before rate limiting or reading the body', async () => {
    const res = await POST(
      upload({ audio: smallAudio(), fromLang: 'en' }, { 'content-length': String(10 * 1024 * 1024) })
    );

    expect(res.status).toBe(413);
    expect(enforceRateLimit).not.toHaveBeenCalled();
    expect(transcriptionsCreate).not.toHaveBeenCalled();
  });

  test('rejects audio over 2 MB with 413 and does not send it to OpenAI', async () => {
    const bigAudio = new Blob([new Uint8Array(MAX_AUDIO_BYTES + 1)], { type: 'audio/m4a' });

    const res = await POST(upload({ audio: bigAudio, fromLang: 'en' }));

    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: 'Recording too long' });
    expect(transcriptionsCreate).not.toHaveBeenCalled();
  });

  test('returns 400 when audio or fromLang is missing', async () => {
    expect((await POST(upload({ fromLang: 'en' }))).status).toBe(400);
    expect((await POST(upload({ audio: smallAudio() }))).status).toBe(400);
  });

  test('returns a generic 500 when OpenAI fails, without leaking the error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    transcriptionsCreate.mockRejectedValue(new Error('invalid api key sk-...'));

    const res = await POST(upload({ audio: smallAudio(), fromLang: 'en' }));

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Transcription failed' });
  });
});
