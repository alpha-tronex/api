import { NextRequest, NextResponse } from 'next/server';
import OpenAI, { toFile } from 'openai';
import { checkAppAuth } from './appAuth';
import { rejectOversizedAudio, rejectOversizedUpload } from './limits';
import { getModelConfig, transcriptionLanguageParams } from './models';
import { enforceRateLimit } from './ratelimit';
import type { RequestLog } from './requestLog';
import { isSupportedTarget } from './translationPrompt';

export type SpeechUploadOptions = {
  /** Form field holding the language hint ("fromLang" or "lang"). */
  langField: string;
  /** Practice needs a real language; translation input may be "auto". */
  requireSupportedLang: boolean;
  /** Generic message for 500s (never leak the upstream error). */
  failureMessage: string;
  /** For console errors. */
  route: string;
};

/**
 * Shared pipeline for every audio-upload route: size checks → signed-request
 * check → rate limit → speech-to-text. Each route only chooses its options.
 */
export async function handleSpeechUpload(
  req: NextRequest,
  log: RequestLog,
  options: SpeechUploadOptions
): Promise<NextResponse> {
  const oversized = rejectOversizedUpload(req);
  if (oversized) {
    log.set({ outcome: 'upload_too_large' });
    return oversized;
  }

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
    const formData = await req.formData();
    const audio = formData.get('audio') as File | null;
    const lang = formData.get(options.langField) as string | null;
    log.set({ fromLang: lang ?? undefined, audioBytes: audio?.size });

    if (!audio || !lang) {
      log.set({ outcome: 'bad_request' });
      return NextResponse.json({ error: `Missing audio or ${options.langField}` }, { status: 400 });
    }
    if (options.requireSupportedLang && !isSupportedTarget(lang)) {
      log.set({ outcome: 'bad_request' });
      return NextResponse.json({ error: 'Unsupported language' }, { status: 400 });
    }

    const audioTooLarge = rejectOversizedAudio(audio);
    if (audioTooLarge) {
      log.set({ outcome: 'audio_too_large' });
      return audioTooLarge;
    }

    const { sttModel } = getModelConfig();
    log.set({ sttModel });
    const transcription = await openai.audio.transcriptions.create({
      file: await toFile(audio, 'recording.m4a', { type: 'audio/m4a' }),
      model: sttModel,
      ...transcriptionLanguageParams(sttModel, lang),
    });

    // gpt-transcribe reports the language it heard (used by auto-detect).
    const detectedLang = transcription.languages?.[0]?.code;
    log.set({ outcome: 'ok', transcriptChars: transcription.text.length, detectedLang });
    return NextResponse.json({
      transcript: transcription.text,
      ...(detectedLang ? { detectedLang } : {}),
    });
  } catch (err) {
    console.error(`[${options.route}]`, err);
    log.set({ outcome: 'error' });
    return NextResponse.json({ error: options.failureMessage }, { status: 500 });
  }
}
