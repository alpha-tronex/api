/**
 * Builds the translation system prompt. Only known language codes ever reach
 * the prompt: client-supplied strings are never interpolated, so a request
 * can't smuggle instructions in through the language fields.
 */
export const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  zh: 'Mandarin Chinese',
  ar: 'Arabic',
  ja: 'Japanese',
  ko: 'Korean',
};

export function isSupportedTarget(code: unknown): code is string {
  return typeof code === 'string' && code in LANGUAGE_NAMES;
}

/**
 * fromLang "auto" (or anything unrecognised) lets the model identify the
 * source language itself; the app sends "auto" when the speech model
 * couldn't tell which language it heard.
 */
export function translationSystemPrompt(fromLang: unknown, toLang: string): string {
  const toName = LANGUAGE_NAMES[toLang];
  const fromName = typeof fromLang === 'string' ? LANGUAGE_NAMES[fromLang] : undefined;
  const direction = fromName ? `from ${fromName} to ${toName}` : `into ${toName}, whatever language it is written in`;
  return `You are a professional translator. Translate the user's text ${direction}. Reply with ONLY the translation, no explanations.`;
}
