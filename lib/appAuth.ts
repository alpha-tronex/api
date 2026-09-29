import { createHmac, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';

/**
 * Signed requests: only our app knows APP_SIGNING_KEY (baked into the build
 * via EAS), so the API can tell its own app from a script hitting the URL.
 *
 * The app sends:
 *   X-App-Timestamp  Unix seconds
 *   X-App-Signature  hex HMAC-SHA256(key, signingPayload(...))
 *
 * The key ships inside the app binary, so a determined attacker can extract
 * it. This raises the bar; rate limits and the OpenAI spend cap remain the
 * real safety net.
 *
 * APP_AUTH_MODE:
 *   off      don't check
 *   log      check and log the result, never block (default, so v1.0 apps
 *            that don't sign keep working)
 *   enforce  reject anything not validly signed with 401
 */

export type AuthMode = 'off' | 'log' | 'enforce';
export type AuthResult = 'valid' | 'missing' | 'invalid' | 'expired' | 'unconfigured' | 'skipped';

/** How far the app's clock may be from ours, either way. */
export const MAX_CLOCK_SKEW_SECONDS = 300;

type Env = Record<string, string | undefined>;

export function getAuthMode(env: Env = process.env): AuthMode {
  const mode = env.APP_AUTH_MODE?.trim().toLowerCase();
  return mode === 'off' || mode === 'enforce' ? mode : 'log';
}

/** Must match lib/appSignature.ts in the app exactly. */
export function signingPayload(timestamp: string, method: string, path: string, deviceId: string): string {
  return `${timestamp}\n${method.toUpperCase()}\n${path}\n${deviceId}`;
}

export function sign(secret: string, payload: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

function safeEqualHex(a: string, b: string): boolean {
  if (!/^[0-9a-f]+$/i.test(a) || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}

export function verifyAppSignature(req: Request, secret: string | undefined, nowSeconds: number): AuthResult {
  if (!secret) return 'unconfigured';

  const timestamp = req.headers.get('x-app-timestamp')?.trim();
  const signature = req.headers.get('x-app-signature')?.trim().toLowerCase();
  if (!timestamp || !signature) return 'missing';

  const ts = Number(timestamp);
  if (!/^\d+$/.test(timestamp) || Math.abs(nowSeconds - ts) > MAX_CLOCK_SKEW_SECONDS) return 'expired';

  const path = new URL(req.url).pathname;
  const deviceId = req.headers.get('x-device-id')?.trim() ?? '';
  const expected = sign(secret, signingPayload(timestamp, req.method, path, deviceId));
  return safeEqualHex(signature, expected) ? 'valid' : 'invalid';
}

let warnedUnconfigured = false;

/**
 * Returns the auth result (for logging) and, in enforce mode, a 401 response
 * when the request isn't validly signed.
 */
export function checkAppAuth(
  req: Request,
  env: Env = process.env,
  nowMs: number = Date.now()
): { result: AuthResult; response: NextResponse | null } {
  const mode = getAuthMode(env);
  if (mode === 'off') return { result: 'skipped', response: null };

  const result = verifyAppSignature(req, env.APP_SIGNING_KEY, Math.floor(nowMs / 1000));

  if (result === 'unconfigured') {
    // Misconfiguration must not lock every user out: allow, but say so loudly.
    if (!warnedUnconfigured || mode === 'enforce') {
      warnedUnconfigured = true;
      console[mode === 'enforce' ? 'error' : 'warn'](
        `[appAuth] APP_AUTH_MODE=${mode} but APP_SIGNING_KEY is not set; requests are NOT being verified.`
      );
    }
    return { result, response: null };
  }

  if (mode === 'enforce' && result !== 'valid') {
    return { result, response: NextResponse.json({ error: 'App update required' }, { status: 401 }) };
  }
  return { result, response: null };
}
