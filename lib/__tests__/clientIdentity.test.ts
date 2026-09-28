import { describe, expect, test } from 'vitest';
import { getClientIp, getDeviceId } from '../clientIdentity';

describe('getDeviceId', () => {
  test('returns the X-Device-Id header when it looks like an ID', () => {
    const id = '3f1c2a9e-8b4d-4c6e-9f10-2a3b4c5d6e7f';
    expect(getDeviceId(new Headers({ 'x-device-id': id }))).toBe(id);
  });

  test('returns null for v1.0 apps that send no device ID', () => {
    expect(getDeviceId(new Headers())).toBeNull();
  });

  test('rejects junk so it cannot be used to spray fresh rate-limit keys', () => {
    expect(getDeviceId(new Headers({ 'x-device-id': 'short' }))).toBeNull();
    expect(getDeviceId(new Headers({ 'x-device-id': 'a'.repeat(65) }))).toBeNull();
    expect(getDeviceId(new Headers({ 'x-device-id': 'has spaces and ; semicolons' }))).toBeNull();
  });
});

describe('getClientIp', () => {
  test('prefers x-real-ip (set by Vercel)', () => {
    expect(getClientIp(new Headers({ 'x-real-ip': '203.0.113.7', 'x-forwarded-for': '198.51.100.1' }))).toBe(
      '203.0.113.7'
    );
  });

  test('falls back to the first x-forwarded-for entry (the original client)', () => {
    expect(getClientIp(new Headers({ 'x-forwarded-for': '198.51.100.1, 10.0.0.1' }))).toBe('198.51.100.1');
  });

  test('uses a shared "unknown" bucket when no IP header is present', () => {
    expect(getClientIp(new Headers())).toBe('unknown');
  });
});
