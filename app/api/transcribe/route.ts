import { NextRequest } from 'next/server';
import { startRequestLog } from '@/lib/requestLog';
import { handleSpeechUpload } from '@/lib/speechUpload';

/** Speech → text for the phrase to translate. `fromLang` may be "auto". */
export async function POST(req: NextRequest) {
  const log = startRequestLog('transcribe', req);
  return log.finish(
    await handleSpeechUpload(req, log, {
      langField: 'fromLang',
      requireSupportedLang: false,
      failureMessage: 'Transcription failed',
      route: '/api/transcribe',
    })
  );
}
