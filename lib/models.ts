/**
 * Which OpenAI models the API uses. Every choice can be changed with a
 * Vercel environment variable (then re-run the deploy workflow), so a model
 * that misbehaves in production can be rolled back without a code change.
 *
 *   STT_MODEL                   speech-to-text       default gpt-transcribe
 *   TRANSLATE_MODEL             translation          default gpt-4o-mini
 *   TRANSLATE_REASONING_EFFORT  none|minimal|low|…   default unset (only for
 *                               reasoning models such as gpt-6-luna)
 *   TTS_MODEL                   text-to-speech       default gpt-4o-mini-tts
 *   TTS_VOICE                   voice                default marin
 *
 * Translation stays on gpt-4o-mini until the eval harness
 * (scripts/eval-models.ts) shows a newer model is at least as good.
 */

export const DEFAULT_MODELS = {
  sttModel: 'gpt-transcribe',
  translateModel: 'gpt-4o-mini',
  ttsModel: 'gpt-4o-mini-tts',
  ttsVoice: 'marin',
} as const;

export const TTS_INSTRUCTIONS = 'Speak clearly and naturally at a moderate pace.';

const REASONING_EFFORTS = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const;
export type ReasoningEffort = (typeof REASONING_EFFORTS)[number];

export type ModelConfig = {
  sttModel: string;
  translateModel: string;
  translateReasoningEffort?: ReasoningEffort;
  ttsModel: string;
  ttsVoice: string;
};

type Env = Record<string, string | undefined>;

const MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{1,63}$/;

function modelOr(value: string | undefined, fallback: string): string {
  const v = value?.trim();
  return v && MODEL_ID.test(v) ? v : fallback;
}

export function getModelConfig(env: Env = process.env): ModelConfig {
  const effort = env.TRANSLATE_REASONING_EFFORT?.trim().toLowerCase();
  return {
    sttModel: modelOr(env.STT_MODEL, DEFAULT_MODELS.sttModel),
    translateModel: modelOr(env.TRANSLATE_MODEL, DEFAULT_MODELS.translateModel),
    translateReasoningEffort: (REASONING_EFFORTS as readonly string[]).includes(effort ?? '')
      ? (effort as ReasoningEffort)
      : undefined,
    ttsModel: modelOr(env.TTS_MODEL, DEFAULT_MODELS.ttsModel),
    ttsVoice: modelOr(env.TTS_VOICE, DEFAULT_MODELS.ttsVoice),
  };
}

/**
 * gpt-transcribe takes `languages: [...]`; whisper-1 and the gpt-4o
 * transcribe models take `language`. The API rejects requests with both.
 * No hint at all lets the model detect the language (for "auto").
 */
export function transcriptionLanguageParams(
  model: string,
  lang: string | null | undefined
): { languages: string[] } | { language: string } | Record<string, never> {
  if (!lang || lang === 'auto') return {};
  return model.startsWith('gpt-transcribe') ? { languages: [lang] } : { language: lang };
}

/** Voices only the gpt-4o-mini-tts family has. */
const NEWER_VOICES = new Set(['marin', 'cedar', 'ballad', 'verse']);

/**
 * Speech params for the configured model. The legacy tts-1 models ignore
 * style instructions and lack the newer voices, so fall back safely if
 * TTS_MODEL is rolled back to one of them.
 */
export function speechParams(config: ModelConfig, input: string) {
  const legacy = config.ttsModel.startsWith('tts-1');
  return {
    model: config.ttsModel,
    voice: legacy && NEWER_VOICES.has(config.ttsVoice) ? 'alloy' : config.ttsVoice,
    input,
    ...(legacy ? {} : { instructions: TTS_INSTRUCTIONS }),
  };
}
