# Language Translator API

Next.js backend for the Language Translator app: transcription, translation and text-to-speech.

## Where things deploy

| Repo | Trigger | Goes to |
|---|---|---|
| [`api`](https://github.com/alpha-tronex/api) | push to `main` (after checks pass) | **Vercel** |
| [`language-translator`](https://github.com/alpha-tronex/language-translator) | push a `v*` tag, e.g. `v1.2.0` (after checks pass) | **EAS → TestFlight** |
| `tts-service` (planned, weeks 9–10) | push to `main` (after checks pass) | **Hetzner** |

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Checks

```bash
npm run lint
npm run typecheck   # next typegen && tsc --noEmit
npm test            # vitest; tests live in __tests__/ next to the code
```

CI/CD (`.github/workflows/ci.yml`) runs all three on every pull request and every push to `main`.

## Deploys

Production deploys only come from GitHub Actions, and only after the checks pass:

1. **Push to `main`:** the `checks` job runs first.
2. **`deploy` job:** `vercel pull` → `vercel build --prod` → `vercel deploy --prebuilt --prod`.
3. **Smoke test:** checks that `/privacy` returns 200 and that `POST /api/translate {}` returns 400.

If the checks fail, production stays on the previous version. Vercel's own Git auto-deploy is turned off for `main` in `vercel.json`, so there's no second, unchecked deploy.

- **Secrets:** add `VERCEL_TOKEN`, `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` under GitHub → Settings → Secrets and variables → Actions. The two IDs are in `.vercel/project.json`.
- **Re-deploy without a code change:** go to Actions → CI/CD → **Run workflow**.
- **Roll back:** in Vercel, open the project → Deployments → the previous production deployment → **Instant Rollback**.

## Rate limiting and request limits

`/api/transcribe` and `/api/translate` are rate-limited with Upstash Redis (`lib/ratelimit.ts`):

| Limit | Key | Default | Env override |
|---|---|---|---|
| Per device | `X-Device-Id` header (random ID made by the app) | 30 requests / 10 min | `RATE_LIMIT_DEVICE_PER_10MIN` |
| Per network | client IP | 300 requests / hour | `RATE_LIMIT_IP_PER_HOUR` |

- **Response:** over-limit requests get `429` with a `Retry-After` header.
- **Older apps:** v1.0 apps don't send a device ID, so they are limited by IP only.
- **Privacy:** Redis only stores SHA-256 hashes of the IDs, and they expire within the window.
- **Redis down:** if Redis is unreachable, requests are **allowed** (fail open), and the OpenAI spend cap is the backstop.
- **Local dev:** with no Redis credentials, rate limiting is off and a warning is logged.

Credentials: `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`, or `KV_REST_API_URL` + `KV_REST_API_TOKEN` (the names set by the Vercel Marketplace integration).

Size limits (`lib/limits.ts`) return `413`:

- **Audio:** over 2 MB is rejected with `Recording too long`.
- **Transcript:** over 1,000 characters is rejected with `Text too long`.

## Signed requests and request logs

**Signed requests** (`lib/appAuth.ts`): apps from v1.1 on sign each request. `X-App-Signature` is an HMAC-SHA256, made with `APP_SIGNING_KEY`, over the timestamp, method, path and device ID, and `X-App-Timestamp` carries the timestamp. The `APP_AUTH_MODE` setting decides what happens:

| `APP_AUTH_MODE` | Behavior |
|---|---|
| `off` | No checking |
| `log` (default) | Check and log the result, never block. v1.0 apps keep working. |
| `enforce` | Unsigned or invalid requests get `401 App update required` |

- **Timing:** signatures older or newer than 5 minutes are rejected, and a signature is tied to one route and one device ID.
- **Missing key:** if `APP_SIGNING_KEY` is unset, requests are allowed and a warning or error is logged, so a misconfiguration can't lock every user out.
- **Honest limit:** the key ships inside the app binary, so this deters casual abuse but isn't strong security. Rate limits and the OpenAI spend cap remain the real safety net.

**Request logs** (`lib/requestLog.ts`): each request writes one JSON line, with `"event":"api_request"`, to Vercel → Logs. Each line records:

- the route, status and response time;
- the app version (`none` for v1.0 apps) and the auth result;
- the languages, the audio size and text lengths, and the outcome.

The logs never include transcript or translation text, device IDs or IP addresses.

**When to switch to `enforce`:** once almost no log lines show `"appVersion":"none"`, meaning v1.0 users have updated, set `APP_AUTH_MODE=enforce` in Vercel and re-run the deploy workflow.

## Models

Every model is set by a Vercel environment variable, with a default in `lib/models.ts`. To change one, set the variable and re-run the deploy workflow; no code change is needed. The same steps roll back a model that misbehaves.

| Variable | Default | Notes |
|---|---|---|
| `STT_MODEL` | `gpt-transcribe` | `whisper-1` rolls back. The language hint is sent the way each model expects. |
| `TRANSLATE_MODEL` | `gpt-4o-mini` | Change only after `npm run eval:models` shows a better option |
| `TRANSLATE_REASONING_EFFORT` | unset | Only for reasoning models, e.g. `none` with `gpt-6-luna` to keep it fast |
| `TTS_MODEL` | `gpt-4o-mini-tts` | Speaks with clear-speech instructions. `tts-1` rolls back. |
| `TTS_VOICE` | `marin` | Newer voices fall back to `alloy` on `tts-1` |

`/api/transcribe` also returns `detectedLang` when the model reports it, which auto-detect will use. The request logs record which models served each request.

**Comparing models:** `npm run eval:models` runs the golden test set in `eval/` through several models and writes a side-by-side report. See `eval/README.md`.

## Routes

| Route | Input | Output |
|---|---|---|
| `POST /api/transcribe` | multipart `audio`, `fromLang` (a language code or `auto`) | `{ transcript, detectedLang? }` |
| `POST /api/translate` | JSON `{ transcript, fromLang, toLang }` | `{ translation, audioBase64, mimeType }` |
| `POST /api/practice` | multipart `audio`, `lang` (target language, never `auto`) | `{ transcript }`, the student's attempt. Scoring happens in the app. |

All three share the same size limits, request signing, rate limiting and request logging (`lib/speechUpload.ts` for the audio routes).

`/api/practice` never sends the expected phrase to the model, because that would bias the transcript toward the right answer.
