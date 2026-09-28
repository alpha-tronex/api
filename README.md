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
