import { getLanguage, isSupportedTarget, LANGUAGE_NAMES } from './languages';

// Re-exported so existing imports keep working; lib/languages.ts is the source.
export { isSupportedTarget, LANGUAGE_NAMES };

/**
 * Builds the translation system prompt. Only known language codes ever reach
 * the prompt: client-supplied strings are never interpolated, so a request
 * can't smuggle instructions in through the language fields.
 *
 * fromLang "auto" (or anything unrecognised) lets the model identify the
 * source language itself; the app sends "auto" when the speech model
 * couldn't tell which language it heard.
 */
export function translationSystemPrompt(fromLang: unknown, toLang: string): string {
  const target = getLanguage(toLang);
  const toName = target?.name;
  const fromName = getLanguage(fromLang)?.name;
  const direction = fromName ? `from ${fromName} to ${toName}` : `into ${toName}, whatever language it is written in`;
  const note = target?.targetNote ? ` ${target.targetNote}` : '';
  return `You are a professional translator. Translate the user's text ${direction}.${note} Reply with ONLY the translation, no explanations.`;
}
