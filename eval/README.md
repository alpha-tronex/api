# Golden test set

`phrases.json` lists short phrases in each supported language. `npm run eval:models` runs them through several OpenAI models and writes a report to `eval/results/<timestamp>/report.md`:

- **Speech-to-text:** error rate, latency and estimated cost per model.
- **Translation:** outputs side by side, with latency and cost.
- **Text-to-speech (optional):** latency, plus MP3s you can listen to.

## Recording the audio

Save one clip per phrase as `eval/audio/<id>.m4a` (for example `eval/audio/es-02.m4a`).

- **How:** iPhone Voice Memos works well. Record, then Share → Save to Files, rename to the id, and copy into `eval/audio/`.
- **Who:** read the phrase naturally. Students reading phrases, with their permission, are the most useful recordings for an ESL class, because accented English is exactly what the app has to handle. Add extra English phrases for that.
- **Privacy:** `eval/audio/` and `eval/results/` are gitignored, so voices never reach GitHub.

No recordings yet? `npm run eval:models -- --synthesize` creates the missing clips with TTS, so you can try the pipeline end to end. Synthetic speech is much easier to transcribe than real voices, so use it as a smoke test, not to decide between models.

## Running

```bash
npm run eval:models                                  # all phrases, default models
npm run eval:models -- --langs=en,es --limit=2       # quick, cheap check
npm run eval:models -- --stt=whisper-1,gpt-transcribe,gpt-4o-mini-transcribe
npm run eval:models -- --translate=gpt-4o-mini,gpt-6-luna:none,gpt-6-luna:low
npm run eval:models -- --tts                          # also compare tts-1 vs gpt-4o-mini-tts
```

This needs `OPENAI_API_KEY`, read from `api/.env.local`. The full set costs a few cents.

**After a run:** if a new model wins, switch production by setting the matching Vercel variable (`STT_MODEL`, `TRANSLATE_MODEL`, `TRANSLATE_REASONING_EFFORT`, `TTS_MODEL`, `TTS_VOICE`) and re-running the deploy workflow. Nothing needs to change in the code.
