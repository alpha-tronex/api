import { describe, expect, test } from 'vitest';
import {
  MAX_AUDIO_BYTES,
  MAX_TRANSCRIPT_CHARS,
  MAX_UPLOAD_BYTES,
  rejectOversizedAudio,
  rejectOversizedTranscript,
  rejectOversizedUpload,
} from '../limits';

const upload = (length?: number) =>
  new Request('http://localhost/api/transcribe', {
    method: 'POST',
    headers: length === undefined ? {} : { 'content-length': String(length) },
  });

describe('rejectOversizedUpload', () => {
  test('rejects a declared body bigger than the upload cap with 413, before reading it', async () => {
    const res = rejectOversizedUpload(upload(MAX_UPLOAD_BYTES + 1));
    expect(res?.status).toBe(413);
    expect(await res?.json()).toEqual({ error: 'Recording too long' });
  });

  test('allows a body exactly at the cap', () => {
    expect(rejectOversizedUpload(upload(MAX_UPLOAD_BYTES))).toBeNull();
  });

  test('allows a request with no Content-Length (the audio size check still applies)', () => {
    expect(rejectOversizedUpload(upload())).toBeNull();
  });
});

describe('rejectOversizedAudio', () => {
  test('rejects audio over 2 MB', () => {
    expect(rejectOversizedAudio({ size: MAX_AUDIO_BYTES + 1 })?.status).toBe(413);
  });

  test('allows audio at exactly 2 MB', () => {
    expect(rejectOversizedAudio({ size: MAX_AUDIO_BYTES })).toBeNull();
  });
});

describe('rejectOversizedTranscript', () => {
  test('rejects text over 1,000 characters', async () => {
    const res = rejectOversizedTranscript('a'.repeat(MAX_TRANSCRIPT_CHARS + 1));
    expect(res?.status).toBe(413);
    expect(await res?.json()).toEqual({ error: 'Text too long' });
  });

  test('allows text at exactly 1,000 characters', () => {
    expect(rejectOversizedTranscript('a'.repeat(MAX_TRANSCRIPT_CHARS))).toBeNull();
  });
});
