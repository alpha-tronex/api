import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { rejectOversizedTranscript } from '@/lib/limits';
import { enforceRateLimit } from '@/lib/ratelimit';

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
  const limited = await enforceRateLimit(req);
  if (limited) return limited;

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  try {
    const { transcript, fromLang, toLang } = await req.json();

    if (!transcript || !fromLang || !toLang) {
      return NextResponse.json(
        { error: 'Missing transcript, fromLang, or toLang' },
        { status: 400 }
      );
    }

    const textTooLong = rejectOversizedTranscript(String(transcript));
    if (textTooLong) return textTooLong;

    const fromName = LANGUAGE_NAMES[fromLang] ?? fromLang;
    const toName   = LANGUAGE_NAMES[toLang]   ?? toLang;

    // Step 1: translate with GPT-4o-mini
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
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
    const ttsResponse = await openai.audio.speech.create({
      model: 'tts-1',
      voice: 'alloy',
      input: translation,
    });

    const audioBuffer = Buffer.from(await ttsResponse.arrayBuffer());
    const audioBase64 = audioBuffer.toString('base64');

    return NextResponse.json({
      translation,
      audioBase64,
      mimeType: 'audio/mpeg',
    });
  } catch (err) {
    console.error('[/api/translate]', err);
    return NextResponse.json({ error: 'Translation failed' }, { status: 500 });
  }
}
