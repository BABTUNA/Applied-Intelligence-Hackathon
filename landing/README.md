# EverNav — Landing page

A standalone Next.js landing + waitlist signup page for **EverNav**, built to
deploy on [Vercel](https://vercel.com). No InsForge / external backend required.

- Email waitlist form with client + server-side validation
- Link to the [X demo](https://x.com/_BabTuna_/status/2061231929618518470)
- Matches the EverNav dark + lime aesthetic

## Develop

```bash
cd landing
npm install
npm run dev          # http://localhost:3000
```

## Deploy to Vercel

```bash
npm i -g vercel      # if you don't have it
cd landing
vercel               # follow prompts, then `vercel --prod`
```

Or import the repo at [vercel.com/new](https://vercel.com/new) and set the
**Root Directory** to `landing/`. Vercel auto-detects Next.js — no extra config.

## Where do signups go?

The `POST /api/signup` route validates the email. By default it just accepts the
signup (and logs it to the function output). To actually capture emails, set an
env var in the Vercel project:

| Variable | Purpose |
|---|---|
| `SIGNUP_WEBHOOK_URL` | Each signup is POSTed here as JSON `{ email, source, ts }`. Point it at a Zapier/Make hook, a Discord webhook, a Google Sheet endpoint, or your own API. |

See `.env.example`.
