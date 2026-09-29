import { getDeviceId } from './clientIdentity';

/**
 * One structured JSON line per API request, visible in Vercel → Logs.
 * Never logs transcript or translation text, raw IPs, or device IDs: only
 * sizes, languages, timings and outcomes.
 */
export type LogFields = {
  auth?: string;
  fromLang?: string;
  toLang?: string;
  audioBytes?: number;
  transcriptChars?: number;
  translationChars?: number;
  outcome?: string;
  sttModel?: string;
  translateModel?: string;
  ttsModel?: string;
  detectedLang?: string;
};

export type RequestLog = {
  set(fields: LogFields): void;
  finish<R extends Response>(res: R): R;
};

const LANG_CODE = /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/;
const APP_VERSION = /^[0-9A-Za-z.+-]{1,32}$/;

/** Only log values we control the shape of. */
function safeLang(value: unknown): string | undefined {
  return typeof value === 'string' && LANG_CODE.test(value) ? value : value === undefined ? undefined : 'invalid';
}

export function startRequestLog(route: string, req: Request, now: () => number = Date.now): RequestLog {
  const started = now();
  const appVersion = req.headers.get('x-app-version')?.trim();
  const fields: LogFields & Record<string, unknown> = {};

  return {
    set(more) {
      Object.assign(fields, more);
      if ('fromLang' in more) fields.fromLang = safeLang(more.fromLang);
      if ('toLang' in more) fields.toLang = safeLang(more.toLang);
      if ('detectedLang' in more) fields.detectedLang = safeLang(more.detectedLang);
    },
    finish(res) {
      console.log(
        JSON.stringify({
          event: 'api_request',
          route,
          status: res.status,
          durationMs: now() - started,
          appVersion: appVersion && APP_VERSION.test(appVersion) ? appVersion : appVersion ? 'invalid' : 'none',
          hasDeviceId: getDeviceId(req.headers) !== null,
          ...fields,
        })
      );
      return res;
    },
  };
}
