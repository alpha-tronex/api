import type OpenAI from 'openai';
import { getLanguage, type TtsProvider } from './languages';
import { speechParams, TTS_INSTRUCTIONS, type ModelConfig } from './models';

/**
 * Text-to-speech for any supported language. Routes by the language's
 * ttsProvider: OpenAI's voice model, or the self-hosted tts-service for
 * Wolof and Bambara.
 *
 * Returns null when the audio can't be made (service down, slow, not
 * configured, or the provider errored). Callers then return the text
 * without audio instead of failing the whole request.
 *
 *   TTS_SERVICE_URL         e.g. https://tts.alphatronex.com
 *   TTS_SERVICE_KEY         shared secret, same as TTS_SHARED_SECRET on the server
 *   TTS_SERVICE_TIMEOUT_MS  default 12000
 */
export const DEFAULT_TTS_SERVICE_TIMEOUT_MS = 12_000;

type Env = Record<string, string | undefined>;

export type SpeechRequest = {
  text: string;
  /** A known language code (validated by the caller). */
  lang: string;
  models: ModelConfig;
  /** OpenAI voice instructions; the local service has no equivalent. */
  instructions?: string;
};

export type SpeechDeps = {
  openai: Pick<OpenAI, 'audio'>;
  fetchImpl?: typeof fetch;
  env?: Env;
};

export function ttsProviderFor(lang: string): TtsProvider {
  return getLanguage(lang)?.ttsProvider ?? 'openai';
}

export function ttsServiceTimeoutMs(env: Env = process.env): number {
  const ms = Number(env.TTS_SERVICE_TIMEOUT_MS);
  return Number.isFinite(ms) && ms >= 1000 && ms <= 60_000 ? ms : DEFAULT_TTS_SERVICE_TIMEOUT_MS;
}

async function speakLocally(text: string, lang: string, fetchImpl: typeof fetch, env: Env): Promise<Buffer> {
  const url = env.TTS_SERVICE_URL?.trim().replace(/\/+$/, '');
  const key = env.TTS_SERVICE_KEY?.trim();
  if (!url || !key) throw new Error('TTS_SERVICE_URL or TTS_SERVICE_KEY is not set');

  const res = await fetchImpl(`${url}/speak`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-TTS-Key': key },
    body: JSON.stringify({ lang, text }),
    signal: AbortSignal.timeout(ttsServiceTimeoutMs(env)),
  });
  if (!res.ok) throw new Error(`tts-service responded ${res.status}`);
  const audio = Buffer.from(await res.arrayBuffer());
  if (audio.length === 0) throw new Error('tts-service returned no audio');
  return audio;
}

export async function synthesizeSpeech(
  { text, lang, models, instructions = TTS_INSTRUCTIONS }: SpeechRequest,
  { openai, fetchImpl = fetch, env = process.env }: SpeechDeps
): Promise<Buffer | null> {
  const provider = ttsProviderFor(lang);
  try {
    if (provider === 'local') return await speakLocally(text, lang, fetchImpl, env);
    const response = await openai.audio.speech.create(speechParams(models, text, instructions));
    return Buffer.from(await response.arrayBuffer());
  } catch (err) {
    // The reason only: never the text being spoken.
    console.error(`[tts:${provider}] ${lang} audio unavailable:`, err instanceof Error ? err.message : err);
    return null;
  }
}
