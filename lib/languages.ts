/**
 * The API's one list of languages. Everything that depends on a language
 * (the translation prompt, which voice service speaks it, whether it can be
 * transcribed) reads from here. The app keeps the same codes with its own
 * display labels in language-translator/lib/languages.ts: change both together.
 *
 * ttsProvider
 *   'openai'  spoken by the OpenAI voice model
 *   'local'   spoken by the self-hosted tts-service on the Hetzner server
 *             (OpenAI's voices don't cover these languages)
 *
 * speechInput: false means the speech-to-text model can't transcribe the
 * language, so it can be typed and translated but not spoken or practiced.
 */
export type TtsProvider = 'openai' | 'local';

export type ApiLanguage = {
  code: string;
  /** English name, used in prompts. */
  name: string;
  ttsProvider: TtsProvider;
  speechInput: boolean;
  /** Extra instruction for the translator when this is the target language. */
  targetNote?: string;
};

export const LANGUAGES: readonly ApiLanguage[] = [
  { code: 'en', name: 'English', ttsProvider: 'openai', speechInput: true },
  { code: 'es', name: 'Spanish', ttsProvider: 'openai', speechInput: true },
  { code: 'fr', name: 'French', ttsProvider: 'openai', speechInput: true },
  { code: 'de', name: 'German', ttsProvider: 'openai', speechInput: true },
  { code: 'zh', name: 'Mandarin Chinese', ttsProvider: 'openai', speechInput: true },
  { code: 'ar', name: 'Arabic', ttsProvider: 'openai', speechInput: true },
  { code: 'ja', name: 'Japanese', ttsProvider: 'openai', speechInput: true },
  { code: 'ko', name: 'Korean', ttsProvider: 'openai', speechInput: true },
  {
    code: 'wo',
    name: 'Wolof',
    ttsProvider: 'local',
    speechInput: false,
    targetNote: 'Write Wolof in the standard Senegalese (CLAD) Latin orthography.',
  },
  {
    code: 'bm',
    name: 'Bambara',
    ttsProvider: 'local',
    speechInput: false,
    targetNote: 'Write Bambara in the standard Malian Latin orthography, using the letters ɛ, ɔ, ɲ and ŋ.',
  },
];

const BY_CODE = new Map(LANGUAGES.map((l) => [l.code, l]));

/** Exact, known codes only: client-supplied strings never reach a prompt. */
export function getLanguage(code: unknown): ApiLanguage | undefined {
  return typeof code === 'string' ? BY_CODE.get(code) : undefined;
}

export function isSupportedTarget(code: unknown): code is string {
  return getLanguage(code) !== undefined;
}

/** English names by code, for prompts. */
export const LANGUAGE_NAMES: Record<string, string> = Object.fromEntries(LANGUAGES.map((l) => [l.code, l.name]));

/** True for "auto" and unknown codes too: only a known language marked as text-only says no. */
export function supportsSpeechInput(code: unknown): boolean {
  return getLanguage(code)?.speechInput !== false;
}
