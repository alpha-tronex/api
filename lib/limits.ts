import { NextResponse } from 'next/server';

/** ~60 seconds of the app's AAC recording is well under this. */
export const MAX_AUDIO_BYTES = 2 * 1024 * 1024;
export const MAX_TRANSCRIPT_CHARS = 1000;
/** /api/speak is for one word (or a short chunk), not whole phrases. */
export const MAX_SPEAK_CHARS = 60;
/** Audio plus multipart overhead. */
export const MAX_UPLOAD_BYTES = MAX_AUDIO_BYTES + 64 * 1024;

function tooLarge(message: string) {
  return NextResponse.json({ error: message }, { status: 413 });
}

/**
 * Cheap early check on the declared body size, before the body is read.
 * Returns a 413 response, or null when the request may continue.
 */
export function rejectOversizedUpload(req: Request): NextResponse | null {
  const declared = Number(req.headers.get('content-length'));
  return Number.isFinite(declared) && declared > MAX_UPLOAD_BYTES
    ? tooLarge('Recording too long')
    : null;
}

/** Checks the actual audio size (Content-Length can be missing or wrong). */
export function rejectOversizedAudio(audio: { size: number }): NextResponse | null {
  return audio.size > MAX_AUDIO_BYTES ? tooLarge('Recording too long') : null;
}

export function rejectOversizedTranscript(transcript: string): NextResponse | null {
  return transcript.length > MAX_TRANSCRIPT_CHARS ? tooLarge('Text too long') : null;
}

export function rejectOversizedSpeakText(text: string): NextResponse | null {
  return text.length > MAX_SPEAK_CHARS ? tooLarge('Text too long') : null;
}
