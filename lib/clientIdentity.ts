/**
 * Who is calling? Used as rate-limit keys.
 *
 * - Device ID: a random UUID the app creates on first launch and sends as
 *   `X-Device-Id`. v1.0 apps don't send one, so it is optional.
 * - IP: Vercel sets `x-real-ip` / `x-forwarded-for`. A whole classroom on one
 *   school Wi-Fi shares one IP, so the IP limit must stay generous.
 */

const DEVICE_ID_PATTERN = /^[A-Za-z0-9-]{8,64}$/;

export function getDeviceId(headers: Headers): string | null {
  const id = headers.get('x-device-id')?.trim();
  return id && DEVICE_ID_PATTERN.test(id) ? id : null;
}

export function getClientIp(headers: Headers): string {
  const realIp = headers.get('x-real-ip')?.trim();
  if (realIp) return realIp;
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || 'unknown';
}
