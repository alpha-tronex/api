import { describe, expect, test, vi } from 'vitest';
import {
  checkAppAuth,
  getAuthMode,
  MAX_CLOCK_SKEW_SECONDS,
  sign,
  signingPayload,
  verifyAppSignature,
} from '../appAuth';

const SECRET = 'test-signing-key';
const NOW = 1_800_000_000; // seconds
const DEVICE = '3f1c2a9e-8b4d-4c6e-9f10-2a3b4c5d6e7f';

function signedRequest(
  opts: { ts?: number; path?: string; method?: string; device?: string; secret?: string; tamper?: boolean } = {}
) {
  const ts = String(opts.ts ?? NOW);
  const path = opts.path ?? '/api/translate';
  const method = opts.method ?? 'POST';
  const device = opts.device ?? DEVICE;
  let signature = sign(opts.secret ?? SECRET, signingPayload(ts, method, path, device));
  if (opts.tamper) signature = signature.replace(/^./, (c) => (c === 'a' ? 'b' : 'a'));
  return new Request(`https://api.example.com${path}`, {
    method,
    headers: { 'x-app-timestamp': ts, 'x-app-signature': signature, 'x-device-id': device },
  });
}

describe('signingPayload', () => {
  test('is the exact format the app signs (changing it breaks every installed app)', () => {
    expect(signingPayload('1800000000', 'post', '/api/translate', 'dev-1')).toBe(
      '1800000000\nPOST\n/api/translate\ndev-1'
    );
  });
});

describe('verifyAppSignature', () => {
  test('accepts a correctly signed request', () => {
    expect(verifyAppSignature(signedRequest(), SECRET, NOW)).toBe('valid');
  });

  test('accepts requests without a device ID when that is what was signed', () => {
    expect(verifyAppSignature(signedRequest({ device: '' }), SECRET, NOW)).toBe('valid');
  });

  test('reports "missing" for unsigned requests (the v1.0 app)', () => {
    expect(verifyAppSignature(new Request('https://api.example.com/api/translate'), SECRET, NOW)).toBe('missing');
  });

  test('rejects a signature made with a different key', () => {
    expect(verifyAppSignature(signedRequest({ secret: 'wrong-key' }), SECRET, NOW)).toBe('invalid');
  });

  test('rejects a tampered signature', () => {
    expect(verifyAppSignature(signedRequest({ tamper: true }), SECRET, NOW)).toBe('invalid');
  });

  test('rejects a signature replayed on a different route', () => {
    const req = signedRequest({ path: '/api/transcribe' });
    const replayed = new Request('https://api.example.com/api/translate', { method: 'POST', headers: req.headers });
    expect(verifyAppSignature(replayed, SECRET, NOW)).toBe('invalid');
  });

  test('rejects a signature replayed with a different device ID (fresh rate-limit bucket)', () => {
    const req = signedRequest();
    const headers = new Headers(req.headers);
    headers.set('x-device-id', 'another-device-0001');
    expect(verifyAppSignature(new Request(req.url, { method: 'POST', headers }), SECRET, NOW)).toBe('invalid');
  });

  test('allows clock skew up to 5 minutes either way', () => {
    expect(verifyAppSignature(signedRequest({ ts: NOW - MAX_CLOCK_SKEW_SECONDS }), SECRET, NOW)).toBe('valid');
    expect(verifyAppSignature(signedRequest({ ts: NOW + MAX_CLOCK_SKEW_SECONDS }), SECRET, NOW)).toBe('valid');
  });

  test('rejects old or future timestamps so captured requests cannot be replayed later', () => {
    expect(verifyAppSignature(signedRequest({ ts: NOW - MAX_CLOCK_SKEW_SECONDS - 1 }), SECRET, NOW)).toBe('expired');
    expect(verifyAppSignature(signedRequest({ ts: NOW + MAX_CLOCK_SKEW_SECONDS + 1 }), SECRET, NOW)).toBe('expired');
  });

  test('rejects malformed timestamps and signatures without throwing', () => {
    const headers = { 'x-app-timestamp': '12abc', 'x-app-signature': 'zz' };
    expect(verifyAppSignature(new Request('https://api.example.com/api/translate', { headers }), SECRET, NOW)).toBe(
      'expired'
    );
    const badSig = { 'x-app-timestamp': String(NOW), 'x-app-signature': 'not-hex!' };
    expect(
      verifyAppSignature(new Request('https://api.example.com/api/translate', { headers: badSig }), SECRET, NOW)
    ).toBe('invalid');
  });

  test('reports "unconfigured" when the server has no key', () => {
    expect(verifyAppSignature(signedRequest(), undefined, NOW)).toBe('unconfigured');
  });
});

describe('getAuthMode', () => {
  test('defaults to log so v1.0 apps keep working', () => {
    expect(getAuthMode({})).toBe('log');
    expect(getAuthMode({ APP_AUTH_MODE: 'something-else' })).toBe('log');
  });

  test('accepts off and enforce, case-insensitively', () => {
    expect(getAuthMode({ APP_AUTH_MODE: 'off' })).toBe('off');
    expect(getAuthMode({ APP_AUTH_MODE: ' Enforce ' })).toBe('enforce');
  });
});

describe('checkAppAuth', () => {
  const nowMs = NOW * 1000;

  test('log mode: reports the result but never blocks', () => {
    const unsigned = new Request('https://api.example.com/api/translate', { method: 'POST' });
    expect(checkAppAuth(unsigned, { APP_SIGNING_KEY: SECRET, APP_AUTH_MODE: 'log' }, nowMs)).toEqual({
      result: 'missing',
      response: null,
    });
  });

  test('enforce mode: rejects an unsigned request with 401 "App update required"', async () => {
    const unsigned = new Request('https://api.example.com/api/translate', { method: 'POST' });
    const { result, response } = checkAppAuth(unsigned, { APP_SIGNING_KEY: SECRET, APP_AUTH_MODE: 'enforce' }, nowMs);
    expect(result).toBe('missing');
    expect(response?.status).toBe(401);
    expect(await response?.json()).toEqual({ error: 'App update required' });
  });

  test('enforce mode: lets a validly signed request through', () => {
    expect(checkAppAuth(signedRequest(), { APP_SIGNING_KEY: SECRET, APP_AUTH_MODE: 'enforce' }, nowMs)).toEqual({
      result: 'valid',
      response: null,
    });
  });

  test('off mode: skips checking entirely', () => {
    expect(checkAppAuth(signedRequest(), { APP_AUTH_MODE: 'off' }, nowMs).result).toBe('skipped');
  });

  test('enforce without a key allows the request (never lock everyone out) and logs an error', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const unsigned = new Request('https://api.example.com/api/translate', { method: 'POST' });

    expect(checkAppAuth(unsigned, { APP_AUTH_MODE: 'enforce' }, nowMs)).toEqual({
      result: 'unconfigured',
      response: null,
    });
    expect(error).toHaveBeenCalledWith(expect.stringContaining('APP_SIGNING_KEY is not set'));
  });
});
