import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { checkAppAuth } from '@/lib/appAuth';
import { rejectOversizedSpeakText } from '@/lib/limits';
import { getModelConfig, speechParams, wordInstructions } from '@/lib/models';
import { enforceRateLimit } from '@/lib/ratelimit';
import { startRequestLog, type RequestLog } from '@/lib/requestLog';
import { isSupportedTarget, LANGUAGE_NAMES } from '@/lib/translationPrompt';

/**
 * Learning mode, "tap a word to hear it": speaks one word (or a short
 * chunk) of a translation in the given language. Whole phrases are already
 * spoken by /api/translate, so the text here is capped at a few words.
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
    const tooLong = rejectOversizedSpeakText(text);
    if (tooLong) {
      log.set({ outcome: 'text_too_long' });
      return tooLong;
    }

    const models = getModelConfig();
    log.set({ ttsModel: models.ttsModel });

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const tts = await openai.audio.speech.create(speechParams(models, text, wordInstructions(LANGUAGE_NAMES[lang])));
    const audioBase64 = Buffer.from(await tts.arrayBuffer()).toString('base64');

    log.set({ outcome: 'ok' });
    return NextResponse.json({ audioBase64, mimeType: 'audio/mpeg' });
  } catch (err) {
    console.error('[/api/speak]', err);
    log.set({ outcome: 'error' });
    return NextResponse.json({ error: 'Speech failed' }, { status: 500 });
  }
}
