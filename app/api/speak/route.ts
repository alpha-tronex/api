import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { checkAppAuth } from '@/lib/appAuth';
import { rejectOversizedSpeakText, rejectOversizedTranscript } from '@/lib/limits';
import { getModelConfig, TTS_INSTRUCTIONS, wordInstructions } from '@/lib/models';
import { enforceRateLimit } from '@/lib/ratelimit';
import { startRequestLog, type RequestLog } from '@/lib/requestLog';
import { isSupportedTarget, LANGUAGE_NAMES } from '@/lib/languages';
import { synthesizeSpeech, ttsProviderFor } from '@/lib/tts';

/**
 * Text-to-speech without translating, for learning mode:
 *
 * - default: one word (or a short chunk) of a translation, "tap a word to
 *   hear it". Capped at a few words.
 * - `phrase: true`: a whole saved translation from the practice list, which
 *   has text but no audio on the phone. Capped like a transcript.
 *
 * Wolof and Bambara are spoken by the self-hosted tts-service (lib/tts.ts).
 */
export async function POST(req: NextRequest) {
  const log = startRequestLog('speak', req);
  return log.finish(await handle(req, log));
}

async function handle(req: NextRequest, log: RequestLog): Promise<NextResponse> {
  const auth = checkAppAuth(req);
  log.set({ auth: auth.result });
  if (auth.response) {
    log.set({ outcome: 'unauthorized' });
    return auth.response;
  }

  const limited = await enforceRateLimit(req);
  if (limited) {
    log.set({ outcome: 'rate_limited' });
    return limited;
  }

  try {
    const body = await req.json().catch(() => null);
    const text = typeof body?.text === 'string' ? body.text.trim() : '';
    const lang: unknown = body?.lang;
    const phrase = body?.phrase === true;
    log.set({ toLang: typeof lang === 'string' ? lang : undefined, transcriptChars: text.length });

    if (!text || !lang) {
      log.set({ outcome: 'bad_request' });
      return NextResponse.json({ error: 'Missing text or lang' }, { status: 400 });
    }
    // Only a known code reaches the voice instructions (no client text in prompts).
    if (!isSupportedTarget(lang)) {
      log.set({ outcome: 'bad_request' });
      return NextResponse.json({ error: 'Unsupported language' }, { status: 400 });
    }
    const tooLong = phrase ? rejectOversizedTranscript(text) : rejectOversizedSpeakText(text);
    if (tooLong) {
      log.set({ outcome: 'text_too_long' });
      return tooLong;
    }

    const models = getModelConfig();
    log.set({ ttsModel: models.ttsModel, ttsProvider: ttsProviderFor(lang) });

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const audio = await synthesizeSpeech(
      { text, lang, models, instructions: phrase ? TTS_INSTRUCTIONS : wordInstructions(LANGUAGE_NAMES[lang]) },
      { openai }
    );
    if (!audio) {
      log.set({ outcome: 'audio_unavailable', audio: 'unavailable' });
      return NextResponse.json({ error: 'Audio temporarily unavailable' }, { status: 503 });
    }
    const audioBase64 = audio.toString('base64');

    log.set({ outcome: 'ok' });
    return NextResponse.json({ audioBase64, mimeType: 'audio/mpeg' });
  } catch (err) {
    console.error('[/api/speak]', err);
    log.set({ outcome: 'error' });
    return NextResponse.json({ error: 'Speech failed' }, { status: 500 });
  }
}
