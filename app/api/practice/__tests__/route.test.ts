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

function attempt(fields: { audio?: Blob; lang?: string; expected?: string }) {
  const form = new FormData();
  if (fields.audio) form.append('audio', fields.audio, 'attempt.m4a');
  if (fields.lang) form.append('lang', fields.lang);
  if (fields.expected) form.append('expected', fields.expected);
  return new NextRequest('http://localhost/api/practice', { method: 'POST', body: form });
}

const clip = () => new Blob([new Uint8Array(2048)], { type: 'audio/m4a' });

beforeEach(() => {
  transcriptionsCreate.mockReset().mockResolvedValue({ text: 'Donde esta la estacion' });
  enforceRateLimit.mockReset().mockResolvedValue(null);
});

describe('POST /api/practice', () => {
  test('transcribes the attempt in the target language', async () => {
    const res = await POST(attempt({ audio: clip(), lang: 'es' }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ transcript: 'Donde esta la estacion' });
    expect(transcriptionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'gpt-transcribe', languages: ['es'] })
    );
  });

  test('never gives the model the expected answer, so mistakes are not hidden', async () => {
    await POST(attempt({ audio: clip(), lang: 'es', expected: '¿Dónde está la estación?' }));

    const params = transcriptionsCreate.mock.calls[0][0];
    expect(params).not.toHaveProperty('prompt');
    expect(JSON.stringify(params)).not.toContain('estación');
  });

  test('requires a real language: "auto" or unknown codes get 400 without calling OpenAI', async () => {
    expect((await POST(attempt({ audio: clip(), lang: 'auto' }))).status).toBe(400);
    expect((await POST(attempt({ audio: clip(), lang: 'xx' }))).status).toBe(400);
    expect(transcriptionsCreate).not.toHaveBeenCalled();
  });

  test('is rate-limited like the other routes', async () => {
    enforceRateLimit.mockResolvedValue(NextResponse.json({ error: 'Too many requests' }, { status: 429 }));

    const res = await POST(attempt({ audio: clip(), lang: 'es' }));

    expect(res.status).toBe(429);
    expect(transcriptionsCreate).not.toHaveBeenCalled();
  });

  test('in enforce mode, rejects unsigned requests with 401', async () => {
    vi.stubEnv('APP_AUTH_MODE', 'enforce');
    vi.stubEnv('APP_SIGNING_KEY', 'test-key');

    expect((await POST(attempt({ audio: clip(), lang: 'es' }))).status).toBe(401);
  });

  test('logs the route as "practice" without the transcript text', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    await POST(attempt({ audio: clip(), lang: 'es' }));

    const line = log.mock.calls[0][0] as string;
    expect(JSON.parse(line)).toMatchObject({ route: 'practice', status: 200, outcome: 'ok', audioBytes: 2048 });
    expect(line).not.toContain('Donde esta');
  });

  test('a generic 500 when OpenAI fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    transcriptionsCreate.mockRejectedValue(new Error('upstream'));

    const res = await POST(attempt({ audio: clip(), lang: 'es' }));

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Practice transcription failed' });
  });

  test.each(['wo', 'bm'])('rejects practice in %s with a clear message: the speech model cannot transcribe it', async (lang) => {
    const res = await POST(attempt({ audio: clip(), lang }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Speech input isn't available for this language yet. Type it instead." });
    expect(transcriptionsCreate).not.toHaveBeenCalled();
  });
});
