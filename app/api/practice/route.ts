import { NextRequest } from 'next/server';
import { startRequestLog } from '@/lib/requestLog';
import { handleSpeechUpload } from '@/lib/speechUpload';

/**
 * Learning mode: the student says the translation back; this returns what
 * the speech model heard, transcribed in the target language. Scoring
 * happens in the app.
 *
 * The expected phrase is deliberately NOT sent to the model as a prompt:
 * that would bias the transcript toward the right answer and hide the
 * student's mistakes.
 */
export async function POST(req: NextRequest) {
  const log = startRequestLog('practice', req);
  return log.finish(
    await handleSpeechUpload(req, log, {
      langField: 'lang',
      requireSupportedLang: true,
      failureMessage: 'Practice transcription failed',
      route: '/api/practice',
    })
  );
}
