import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { checkAppAuth } from '@/lib/appAuth';
import { rejectOversizedTranscript } from '@/lib/limits';
import { getModelConfig } from '@/lib/models';
import { isSupportedTarget, translationSystemPrompt } from '@/lib/translationPrompt';
import { enforceRateLimit } from '@/lib/ratelimit';
import { startRequestLog, type RequestLog } from '@/lib/requestLog';
import { synthesizeSpeech, ttsProviderFor } from '@/lib/tts';

export async function POST(req: NextRequest) {
  const log = startRequestLog('translate', req);
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

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  try {
    const { transcript, fromLang, toLang } = await req.json();
    log.set({ fromLang, toLang, transcriptChars: typeof transcript === 'string' ? transcript.length : undefined });

    if (!transcript || !fromLang || !toLang) {
      log.set({ outcome: 'bad_request' });
      return NextResponse.json(
        { error: 'Missing transcript, fromLang, or toLang' },
        { status: 400 }
      );
    }

    if (!isSupportedTarget(toLang)) {
      log.set({ outcome: 'bad_request' });
      return NextResponse.json({ error: 'Unsupported target language' }, { status: 400 });
    }

    const textTooLong = rejectOversizedTranscript(String(transcript));
    if (textTooLong) {
      log.set({ outcome: 'text_too_long' });
      return textTooLong;
    }

    const models = getModelConfig();
    log.set({ translateModel: models.translateModel, ttsModel: models.ttsModel });

    // Step 1: translate
    const completion = await openai.chat.completions.create({
      model: models.translateModel,
      ...(models.translateReasoningEffort ? { reasoning_effort: models.translateReasoningEffort } : {}),
      messages: [
        {
          role: 'system',
          content: translationSystemPrompt(fromLang, toLang),
        },
        { role: 'user', content: transcript },
      ],
    });

    const translation = completion.choices[0].message.content?.trim() ?? '';

    // Step 2: convert translation to speech. A voice failure must not lose
    // the translation, so the text goes back without audio in that case.
    const audio = await synthesizeSpeech({ text: translation, lang: toLang, models }, { openai });

    log.set({
      outcome: 'ok',
      translationChars: translation.length,
      ttsProvider: ttsProviderFor(toLang),
      audio: audio ? 'ok' : 'unavailable',
    });
    return NextResponse.json({
      translation,
      audioBase64: audio ? audio.toString('base64') : null,
      mimeType: 'audio/mpeg',
      ...(audio ? {} : { audioUnavailable: true }),
    });
  } catch (err) {
    console.error('[/api/translate]', err);
    log.set({ outcome: 'error' });
    return NextResponse.json({ error: 'Translation failed' }, { status: 500 });
  }
}
