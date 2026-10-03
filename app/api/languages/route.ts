import { NextResponse } from 'next/server';
import { LANGUAGES } from '@/lib/languages';

/**
 * The supported languages and what each can do. Static and public (no
 * secrets, no model calls), so it is cached and not rate-limited.
 */
export function GET() {
  return NextResponse.json(
    {
      languages: LANGUAGES.map(({ code, name, ttsProvider, speechInput }) => ({ code, name, ttsProvider, speechInput })),
    },
    { headers: { 'Cache-Control': 'public, max-age=3600' } }
  );
}
