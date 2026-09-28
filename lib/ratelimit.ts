import { createHash } from 'node:crypto';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { NextResponse } from 'next/server';
import { getClientIp, getDeviceId } from './clientIdentity';

/** Anything with Upstash Ratelimit's `limit()` shape; tests pass fakes. */
export type Limiter = {
  limit(identifier: string): Promise<{ success: boolean; reset: number }>;
};
export type Limiters = { device: Limiter; ip: Limiter };

/**
 * Defaults. One translation is 2 requests (transcribe + translate), so the
 * device limit allows ~15 translations per 10 minutes. The IP limit is high
 * because a class on school Wi-Fi shares one IP. Override with env vars.
 */
export const DEFAULT_DEVICE_LIMIT = 30; // per 10 minutes
export const DEFAULT_IP_LIMIT = 300; // per hour

type Env = Record<string, string | undefined>;

function positiveInt(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

/**
 * Builds the Upstash limiters, or returns null when Redis isn't configured
 * (local dev). Accepts both the Upstash names and the KV_* names that the
 * Vercel Marketplace integration sets.
 */
export function createLimiters(env: Env = process.env): Limiters | null {
  const url = env.UPSTASH_REDIS_REST_URL ?? env.KV_REST_API_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN ?? env.KV_REST_API_TOKEN;
  if (!url || !token) return null;

  const redis = new Redis({ url, token });
  return {
    device: new Ratelimit({
      redis,
      prefix: 'rl:device',
      limiter: Ratelimit.slidingWindow(positiveInt(env.RATE_LIMIT_DEVICE_PER_10MIN, DEFAULT_DEVICE_LIMIT), '10 m'),
      // Upstash fails open (allows the request) if Redis doesn't answer in time.
      timeout: 2000,
    }),
    ip: new Ratelimit({
      redis,
      prefix: 'rl:ip',
      limiter: Ratelimit.slidingWindow(positiveInt(env.RATE_LIMIT_IP_PER_HOUR, DEFAULT_IP_LIMIT), '1 h'),
      timeout: 2000,
    }),
  };
}

/**
 * Redis only ever sees a SHA-256 hash of the device ID or IP, never the raw
 * value. Counters expire with the window (10 minutes / 1 hour).
 */
export function rateLimitKey(kind: 'device' | 'ip', value: string): string {
  return createHash('sha256').update(`${kind}:${value}`).digest('hex');
}

let cached: Limiters | null | undefined;
let warnedUnconfigured = false;

function defaultLimiters(): Limiters | null {
  if (cached === undefined) cached = createLimiters();
  if (cached === null && !warnedUnconfigured) {
    warnedUnconfigured = true;
    console.warn('[ratelimit] Upstash Redis is not configured; rate limiting is OFF.');
  }
  return cached;
}

function tooManyRequests(reset: number, now: number) {
  const retryAfter = Math.max(1, Math.ceil((reset - now) / 1000));
  return NextResponse.json(
    { error: 'Too many requests' },
    { status: 429, headers: { 'Retry-After': String(retryAfter) } }
  );
}

/**
 * Returns a 429 response when the caller is over a limit, or null when the
 * request may continue. Requests without a device ID (v1.0 apps) are limited
 * by IP only. If Redis errors, the request is allowed (fail open) so a Redis
 * outage never blocks a class mid-lesson; the spend cap is the backstop.
 */
export async function enforceRateLimit(
  req: Request,
  limiters: Limiters | null = defaultLimiters(),
  now: number = Date.now()
): Promise<NextResponse | null> {
  if (!limiters) return null;

  try {
    const deviceId = getDeviceId(req.headers);
    if (deviceId) {
      const device = await limiters.device.limit(rateLimitKey('device', deviceId));
      if (!device.success) return tooManyRequests(device.reset, now);
    }

    const ip = await limiters.ip.limit(rateLimitKey('ip', getClientIp(req.headers)));
    if (!ip.success) return tooManyRequests(ip.reset, now);
  } catch (err) {
    console.error('[ratelimit] check failed; allowing request', err);
  }
  return null;
}
