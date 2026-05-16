import { NextRequest, NextResponse } from 'next/server';
import OpenAI, { toFile } from 'openai';

export async function POST(req: NextRequest) {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  try {
    const formData = await req.formData();
    const audio    = formData.get('audio')    as File | null;
    const fromLang = formData.get('fromLang') as string | null;

    if (!audio || !fromLang) {
      return NextResponse.json({ error: 'Missing audio or fromLang' }, { status: 400 });
    }

    const transcription = await openai.audio.transcriptions.create({
      file:     await toFile(audio, 'recording.m4a', { type: 'audio/m4a' }),
      model:    'whisper-1',
      language: fromLang,
    });

    return NextResponse.json({ transcript: transcription.text });
  } catch (err) {
    console.error('[/api/transcribe]', err);
    return NextResponse.json({ error: 'Transcription failed' }, { status: 500 });
  }
}
