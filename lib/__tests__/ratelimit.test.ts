import { describe, expect, test, vi } from 'vitest';
import { createLimiters, enforceRateLimit, rateLimitKey, type Limiter, type Limiters } from '../ratelimit';

const NOW = 1_800_000_000_000;
const DEVICE = '3f1c2a9e-8b4d-4c6e-9f10-2a3b4c5d6e7f';

function limiter(success: boolean, resetInMs = 42_000): Limiter & { limit: ReturnType<typeof vi.fn> } {
  return { limit: vi.fn(async () => ({ success, reset: NOW + resetInMs })) };
}

function request(headers: Record<string, string> = {}) {
  return new Request('http://localhost/api/translate', { method: 'POST', headers });
}

describe('enforceRateLimit', () => {
  test('lets the request through when both device and IP are under their limits', async () => {
    const limiters = { device: limiter(true), ip: limiter(true) };

    const res = await enforceRateLimit(request({ 'x-device-id': DEVICE, 'x-real-ip': '203.0.113.7' }), limiters, NOW);

    expect(res).toBeNull();
    expect(limiters.device.limit).toHaveBeenCalledWith(rateLimitKey('device', DEVICE));
    expect(limiters.ip.limit).toHaveBeenCalledWith(rateLimitKey('ip', '203.0.113.7'));
  });

  test('returns 429 with Retry-After in whole seconds when the device is over its limit', async () => {
    const limiters = { device: limiter(false, 41_200), ip: limiter(true) };

    const res = await enforceRateLimit(request({ 'x-device-id': DEVICE }), limiters, NOW);

    expect(res?.status).toBe(429);
    expect(res?.headers.get('Retry-After')).toBe('42');
    expect(await res?.json()).toEqual({ error: 'Too many requests' });
    expect(limiters.ip.limit).not.toHaveBeenCalled();
  });

  test('returns 429 when the shared IP is over its limit even if the device is fine', async () => {
    const limiters = { device: limiter(true), ip: limiter(false) };

    const res = await enforceRateLimit(request({ 'x-device-id': DEVICE }), limiters, NOW);

    expect(res?.status).toBe(429);
  });

  test('limits v1.0 apps (no device ID) by IP only, so they keep working', async () => {
    const limiters = { device: limiter(true), ip: limiter(true) };

    expect(await enforceRateLimit(request({ 'x-real-ip': '203.0.113.7' }), limiters, NOW)).toBeNull();
    expect(limiters.device.limit).not.toHaveBeenCalled();
    expect(limiters.ip.limit).toHaveBeenCalledWith(rateLimitKey('ip', '203.0.113.7'));
  });

  test('never sends Retry-After: 0, even if the window has already reset', async () => {
    const limiters = { device: limiter(false, -500), ip: limiter(true) };

    const res = await enforceRateLimit(request({ 'x-device-id': DEVICE }), limiters, NOW);

    expect(res?.headers.get('Retry-After')).toBe('1');
  });

  test('fails open when Redis errors, so an outage never blocks a class mid-lesson', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const broken: Limiters = {
      device: { limit: vi.fn(async () => Promise.reject(new Error('ECONNRESET'))) },
      ip: limiter(true),
    };

    expect(await enforceRateLimit(request({ 'x-device-id': DEVICE }), broken, NOW)).toBeNull();
  });

  test('does nothing when rate limiting is not configured (local dev)', async () => {
    expect(await enforceRateLimit(request(), null, NOW)).toBeNull();
  });
});

describe('rateLimitKey', () => {
  test('never exposes the raw device ID or IP to Redis', () => {
    const key = rateLimitKey('ip', '203.0.113.7');
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(key).not.toContain('203.0.113.7');
  });

  test('is stable, and a device ID and an IP with the same text get different keys', () => {
    expect(rateLimitKey('device', 'abc12345')).toBe(rateLimitKey('device', 'abc12345'));
    expect(rateLimitKey('device', 'abc12345')).not.toBe(rateLimitKey('ip', 'abc12345'));
  });
});

describe('createLimiters', () => {
  test('returns null without Redis credentials', () => {
    expect(createLimiters({})).toBeNull();
  });

  test('accepts the Upstash variable names', () => {
    expect(
      createLimiters({ UPSTASH_REDIS_REST_URL: 'https://example.upstash.io', UPSTASH_REDIS_REST_TOKEN: 't' })
    ).not.toBeNull();
  });

  test('accepts the KV_* names set by the Vercel Marketplace integration', () => {
    expect(createLimiters({ KV_REST_API_URL: 'https://example.upstash.io', KV_REST_API_TOKEN: 't' })).not.toBeNull();
  });
});
