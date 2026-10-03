import { describe, expect, test } from 'vitest';
import { GET } from '../route';

describe('GET /api/languages', () => {
  test('lists every language with its voice provider and whether it can be spoken into the app', async () => {
    const res = GET();
    const { languages } = await res.json();

    expect(res.status).toBe(200);
    expect(languages.map((l: { code: string }) => l.code)).toEqual(['en', 'es', 'fr', 'de', 'zh', 'ar', 'ja', 'ko', 'wo', 'bm']);
    expect(languages.find((l: { code: string }) => l.code === 'wo')).toEqual({
      code: 'wo',
      name: 'Wolof',
      ttsProvider: 'local',
      speechInput: false,
    });
    expect(languages.find((l: { code: string }) => l.code === 'en')).toMatchObject({ ttsProvider: 'openai', speechInput: true });
  });

  test('does not expose prompt notes and is cacheable', async () => {
    const res = GET();

    expect(JSON.stringify(await res.json())).not.toContain('orthography');
    expect(res.headers.get('cache-control')).toContain('max-age=3600');
  });
});
