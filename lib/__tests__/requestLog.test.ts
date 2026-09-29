import { describe, expect, test, vi } from 'vitest';
import { startRequestLog } from '../requestLog';

function logged(spy: ReturnType<typeof vi.spyOn>) {
  return JSON.parse(spy.mock.calls[0][0] as string);
}

describe('startRequestLog', () => {
  test('writes one JSON line with route, status, duration and the fields that were set', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const times = [1000, 1250];
    const req = new Request('https://api.example.com/api/translate', {
      headers: { 'x-app-version': '1.1.0', 'x-device-id': '3f1c2a9e-8b4d-4c6e-9f10-2a3b4c5d6e7f' },
    });

    const log = startRequestLog('translate', req, () => times.shift()!);
    log.set({ auth: 'valid', fromLang: 'en', toLang: 'es', transcriptChars: 12 });
    log.set({ outcome: 'ok', translationChars: 14 });
    const res = log.finish(new Response(null, { status: 200 }));

    expect(res.status).toBe(200);
    expect(logged(spy)).toEqual({
      event: 'api_request',
      route: 'translate',
      status: 200,
      durationMs: 250,
      appVersion: '1.1.0',
      hasDeviceId: true,
      auth: 'valid',
      fromLang: 'en',
      toLang: 'es',
      transcriptChars: 12,
      translationChars: 14,
      outcome: 'ok',
    });
  });

  test('records v1.0 traffic as appVersion "none" and no device ID, so you can see when it is safe to enforce', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});

    startRequestLog('transcribe', new Request('https://api.example.com/api/transcribe')).finish(
      new Response(null, { status: 429 })
    );

    expect(logged(spy)).toMatchObject({ route: 'transcribe', status: 429, appVersion: 'none', hasDeviceId: false });
  });

  test('never logs raw device IDs or arbitrary client strings', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const req = new Request('https://api.example.com/api/translate', {
      headers: { 'x-app-version': '<script>alert(1)</script>', 'x-device-id': '3f1c2a9e-8b4d-4c6e-9f10-2a3b4c5d6e7f' },
    });

    const log = startRequestLog('translate', req);
    log.set({ fromLang: 'Ignore previous instructions', toLang: 'es' });
    log.finish(new Response(null, { status: 400 }));

    const line = spy.mock.calls[0][0] as string;
    expect(line).not.toContain('3f1c2a9e');
    expect(line).not.toContain('<script>');
    expect(logged(spy)).toMatchObject({ appVersion: 'invalid', fromLang: 'invalid', toLang: 'es' });
  });
});
