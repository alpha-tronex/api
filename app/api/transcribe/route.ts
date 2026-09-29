import { NextRequest, NextResponse } from 'next/server';
import OpenAI, { toFile } from 'openai';
import { checkAppAuth } from '@/lib/appAuth';
import { rejectOversizedAudio, rejectOversizedUpload } from '@/lib/limits';
import { enforceRateLimit } from '@/lib/ratelimit';
import { startRequestLog, type RequestLog } from '@/lib/requestLog';

export async function POST(req: NextRequest) {
  const log = startRequestLog('transcribe', req);
  return log.finish(await handle(req, log));
}

async function handle(req: NextRequest, log: RequestLog): Promise<NextResponse> {
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
    const audio    = formData.get('audio')    as File | null;
    const fromLang = formData.get('fromLang') as string | null;
    log.set({ fromLang: fromLang ?? undefined, audioBytes: audio?.size });

    if (!audio || !fromLang) {
      log.set({ outcome: 'bad_request' });
      return NextResponse.json({ error: 'Missing audio or fromLang' }, { status: 400 });
    }

    const audioTooLarge = rejectOversizedAudio(audio);
    if (audioTooLarge) {
      log.set({ outcome: 'audio_too_large' });
      return audioTooLarge;
    }

    const transcription = await openai.audio.transcriptions.create({
      file:     await toFile(audio, 'recording.m4a', { type: 'audio/m4a' }),
      model:    'whisper-1',
      language: fromLang,
    });

    log.set({ outcome: 'ok', transcriptChars: transcription.text.length });
    return NextResponse.json({ transcript: transcription.text });
  } catch (err) {
    console.error('[/api/transcribe]', err);
    log.set({ outcome: 'error' });
    return NextResponse.json({ error: 'Transcription failed' }, { status: 500 });
  }
}
