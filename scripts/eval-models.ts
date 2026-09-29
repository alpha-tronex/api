/**
 * Model eval harness: runs the golden test set (eval/phrases.json) through
 * several OpenAI models and writes a side-by-side report, so a model change
 * is a measured decision rather than a guess.
 *
 *   npm run eval:models                        # defaults below
 *   npm run eval:models -- --langs=en,es --limit=2
 *   npm run eval:models -- --stt=whisper-1,gpt-transcribe --translate=gpt-4o-mini,gpt-6-luna:none
 *   npm run eval:models -- --synthesize        # make missing audio with TTS (smoke test only)
 *   npm run eval:models -- --tts               # also time TTS and save MP3s to listen to
 *
 * Needs OPENAI_API_KEY (read from .env.local). Costs real money but little:
 * the full set is ~40 short clips. Output: eval/results/<timestamp>/.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import OpenAI, { toFile } from 'openai';
import { errorRate, estimateSpeechSeconds } from '../lib/evalScoring';
import { speechParams, transcriptionLanguageParams, type ModelConfig, type ReasoningEffort } from '../lib/models';

type Phrase = { id: string; lang: string; text: string };

/**
 * USD. Check https://openai.com/api/pricing before relying on these; they
 * only feed the cost column. STT is per audio minute, text per 1M tokens.
 */
const STT_PRICE_PER_MIN: Record<string, number> = {
  'whisper-1': 0.006,
  'gpt-4o-transcribe': 0.006,
  'gpt-4o-mini-transcribe': 0.003,
  'gpt-transcribe': 0.0045,
};
const TEXT_PRICE_PER_MTOK: Record<string, { input: number; output: number }> = {
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-6-luna': { input: 0.1, output: 0.5 },
};

const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English', es: 'Spanish', fr: 'French', de: 'German',
  zh: 'Mandarin Chinese', ar: 'Arabic', ja: 'Japanese', ko: 'Korean',
};

function arg(name: string, fallback: string): string {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}
const flag = (name: string) => process.argv.includes(`--${name}`);
const list = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);
const ms = (start: number) => Math.round(performance.now() - start);
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const usd = (x: number | undefined) => (x === undefined ? 'n/a' : `$${x.toFixed(5)}`);
const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');

async function main() {
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not set (put it in api/.env.local).');
  const openai = new OpenAI();

  const sttModels = list(arg('stt', 'whisper-1,gpt-transcribe'));
  // model[:reasoning effort], e.g. gpt-6-luna:none
  const translateModels = list(arg('translate', 'gpt-4o-mini,gpt-6-luna:none')).map((m) => {
    const [model, effort] = m.split(':');
    return { model, effort: effort as ReasoningEffort | undefined, label: m };
  });
  const ttsModels = list(arg('tts-models', 'tts-1,gpt-4o-mini-tts'));
  const langs = list(arg('langs', ''));
  const limit = Number(arg('limit', '0'));

  const all: Phrase[] = JSON.parse(readFileSync('eval/phrases.json', 'utf8')).phrases;
  const byLang = new Map<string, Phrase[]>();
  for (const p of all) {
    if (langs.length && !langs.includes(p.lang)) continue;
    const bucket = byLang.get(p.lang) ?? [];
    if (!limit || bucket.length < limit) bucket.push(p);
    byLang.set(p.lang, bucket);
  }
  const phrases = [...byLang.values()].flat();

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = join('eval', 'results', stamp);
  mkdirSync(outDir, { recursive: true });
  mkdirSync(join('eval', 'audio'), { recursive: true });

  // Audio: real recordings in eval/audio/<id>.m4a; optionally synthesize missing ones.
  const synthetic = new Set<string>();
  for (const p of phrases) {
    const path = join('eval', 'audio', `${p.id}.m4a`);
    if (existsSync(path) || !flag('synthesize')) continue;
    const speech = await openai.audio.speech.create({
      model: 'gpt-4o-mini-tts', voice: 'cedar', input: p.text, response_format: 'aac',
    });
    writeFileSync(path, Buffer.from(await speech.arrayBuffer()));
    synthetic.add(p.id);
    console.log(`synthesized ${path}`);
  }

  const results: Record<string, unknown>[] = [];
  const lines: string[] = [`# Model eval, ${new Date().toISOString()}`, ''];

  // ---- Speech-to-text ----
  const withAudio = phrases.filter((p) => existsSync(join('eval', 'audio', `${p.id}.m4a`)));
  lines.push('## Speech-to-text', '');
  if (withAudio.length === 0) {
    lines.push('No recordings found in eval/audio/. Record them (see eval/README.md) or pass --synthesize.', '');
  } else {
    if (synthetic.size || withAudio.some((p) => synthetic.has(p.id))) {
      lines.push(`> ${synthetic.size} clip(s) were synthesized by TTS this run. Synthetic speech is easy to transcribe, so treat those scores as a smoke test, not a verdict.`, '');
    }
    const totals = new Map<string, { errors: number; length: number; ms: number; cost: number; n: number }>();
    const rows: string[] = [];
    for (const p of withAudio) {
      const audio = readFileSync(join('eval', 'audio', `${p.id}.m4a`));
      const row = [p.id, cell(p.text)];
      for (const model of sttModels) {
        const start = performance.now();
        let text = '';
        try {
          const r = await openai.audio.transcriptions.create({
            file: await toFile(audio, `${p.id}.m4a`, { type: 'audio/m4a' }),
            model,
            ...transcriptionLanguageParams(model, p.lang),
          });
          text = r.text;
        } catch (e) {
          text = `ERROR: ${(e as Error).message}`;
        }
        const took = ms(start);
        const score = errorRate(p.text, text, p.lang);
        const price = STT_PRICE_PER_MIN[model];
        const cost = price === undefined ? 0 : (price * estimateSpeechSeconds(p.text, p.lang)) / 60;
        const t = totals.get(model) ?? { errors: 0, length: 0, ms: 0, cost: 0, n: 0 };
        totals.set(model, { errors: t.errors + score.errors, length: t.length + score.length, ms: t.ms + took, cost: t.cost + cost, n: t.n + 1 });
        results.push({ kind: 'stt', id: p.id, lang: p.lang, model, text, ...score, ms: took, synthetic: synthetic.has(p.id) });
        row.push(`${cell(text)} (${score.metric} ${pct(score.rate)}, ${took} ms)`);
      }
      rows.push(`| ${row.join(' | ')} |`);
      console.log(`stt ${p.id} done`);
    }
    lines.push('| Model | Error rate (WER/CER) | Avg latency | Est. cost for this set |', '|---|---|---|---|');
    for (const [model, t] of totals) {
      lines.push(`| ${model} | ${pct(t.errors / Math.max(1, t.length))} | ${Math.round(t.ms / t.n)} ms | ${usd(STT_PRICE_PER_MIN[model] === undefined ? undefined : t.cost)} |`);
    }
    lines.push('', '<details><summary>Per phrase</summary>', '', `| id | said | ${sttModels.join(' | ')} |`, `|${'---|'.repeat(sttModels.length + 2)}`, ...rows, '', '</details>', '');
  }

  // ---- Translation ----
  lines.push('## Translation', '', 'Source text is the reference phrase; English phrases go to Spanish, others to English. Quality needs a human (ideally native-speaker) read; latency and cost are measured.', '');
  const tTotals = new Map<string, { ms: number; cost: number; n: number }>();
  const tRows: string[] = [];
  for (const p of phrases) {
    const to = p.lang === 'en' ? 'es' : 'en';
    const row = [p.id, cell(p.text)];
    for (const tm of translateModels) {
      const start = performance.now();
      let out = '';
      let cost: number | undefined;
      try {
        const r = await openai.chat.completions.create({
          model: tm.model,
          ...(tm.effort ? { reasoning_effort: tm.effort } : {}),
          messages: [
            { role: 'system', content: `You are a professional translator. Translate the user's text from ${LANGUAGE_NAMES[p.lang]} to ${LANGUAGE_NAMES[to]}. Reply with ONLY the translation, no explanations.` },
            { role: 'user', content: p.text },
          ],
        });
        out = r.choices[0].message.content?.trim() ?? '';
        const price = TEXT_PRICE_PER_MTOK[tm.model];
        if (price && r.usage) cost = (r.usage.prompt_tokens * price.input + r.usage.completion_tokens * price.output) / 1e6;
      } catch (e) {
        out = `ERROR: ${(e as Error).message}`;
      }
      const took = ms(start);
      const t = tTotals.get(tm.label) ?? { ms: 0, cost: 0, n: 0 };
      tTotals.set(tm.label, { ms: t.ms + took, cost: t.cost + (cost ?? 0), n: t.n + 1 });
      results.push({ kind: 'translate', id: p.id, from: p.lang, to, model: tm.label, text: out, ms: took, cost });
      row.push(`${cell(out)} (${took} ms)`);
    }
    tRows.push(`| ${row.join(' | ')} |`);
    console.log(`translate ${p.id} done`);
  }
  lines.push('| Model | Avg latency | Cost for this set |', '|---|---|---|');
  for (const [label, t] of tTotals) lines.push(`| ${label} | ${Math.round(t.ms / t.n)} ms | ${usd(t.cost)} |`);
  lines.push('', `| id | source | ${translateModels.map((m) => m.label).join(' | ')} |`, `|${'---|'.repeat(translateModels.length + 2)}`, ...tRows, '');

  // ---- Text-to-speech (optional) ----
  if (flag('tts')) {
    lines.push('## Text-to-speech', '', `MP3s saved under ${outDir}/tts/<model>/ to listen to side by side.`, '', '| Model | Avg latency |', '|---|---|');
    const base: ModelConfig = { sttModel: '', translateModel: '', ttsModel: '', ttsVoice: 'marin' };
    for (const model of ttsModels) {
      const dir = join(outDir, 'tts', model);
      mkdirSync(dir, { recursive: true });
      let total = 0;
      for (const p of phrases) {
        const start = performance.now();
        const speech = await openai.audio.speech.create(speechParams({ ...base, ttsModel: model }, p.text));
        writeFileSync(join(dir, `${p.id}.mp3`), Buffer.from(await speech.arrayBuffer()));
        total += ms(start);
      }
      lines.push(`| ${model} | ${Math.round(total / phrases.length)} ms |`);
      console.log(`tts ${model} done`);
    }
    lines.push('');
  }

  writeFileSync(join(outDir, 'report.md'), lines.join('\n'));
  writeFileSync(join(outDir, 'results.json'), JSON.stringify(results, null, 2));
  console.log(`\nReport: ${join(outDir, 'report.md')}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? `Error: ${e.message}` : e);
  process.exit(1);
});
