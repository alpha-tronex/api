import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { checkAppAuth } from '@/lib/appAuth';
import { rejectOversizedTranscript } from '@/lib/limits';
import { getModelConfig, speechParams } from '@/lib/models';
import { enforceRateLimit } from '@/lib/ratelimit';
import { startRequestLog, type RequestLog } from '@/lib/requestLog';

const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  zh: 'Mandarin Chinese',
  ar: 'Arabic',
  ja: 'Japanese',
  ko: 'Korean',
};

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

    const textTooLong = rejectOversizedTranscript(String(transcript));
    if (textTooLong) {
      log.set({ outcome: 'text_too_long' });
      return textTooLong;
    }

    const models = getModelConfig();
    log.set({ translateModel: models.translateModel, ttsModel: models.ttsModel });

    const fromName = LANGUAGE_NAMES[fromLang] ?? fromLang;
    const toName   = LANGUAGE_NAMES[toLang]   ?? toLang;

    // Step 1: translate
    const completion = await openai.chat.completions.create({
      model: models.translateModel,
      ...(models.translateReasoningEffort ? { reasoning_effort: models.translateReasoningEffort } : {}),
      messages: [
        {
          role: 'system',
          content: `You are a professional translator. Translate the user's text from ${fromName} to ${toName}. Reply with ONLY the translation, no explanations.`,
        },
        { role: 'user', content: transcript },
      ],
    });

    const translation = completion.choices[0].message.content?.trim() ?? '';

    // Step 2: convert translation to speech
    const ttsResponse = await openai.audio.speech.create(speechParams(models, translation));

    const audioBuffer = Buffer.from(await ttsResponse.arrayBuffer());
    const audioBase64 = audioBuffer.toString('base64');

    log.set({ outcome: 'ok', translationChars: translation.length });
    return NextResponse.json({
      translation,
      audioBase64,
      mimeType: 'audio/mpeg',
    });
  } catch (err) {
    console.error('[/api/translate]', err);
    log.set({ outcome: 'error' });
    return NextResponse.json({ error: 'Translation failed' }, { status: 500 });
  }
}
