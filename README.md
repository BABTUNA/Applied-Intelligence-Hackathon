<p align="center">
  <img src="docs/logo.svg" alt="EverNav — live agent navigation for hostile web UIs" width="780"/>
</p>

<p align="center">
  <a href="https://uqi28a23.insforge.site"><b>Live dashboard</b></a> ·
  <a href="#how-it-works">How it works</a> ·
  <a href="#setup">Setup</a>
</p>

A Chrome extension that guides you through complex web UIs.
Type what you want to do, and EverNav blurs the page and glows the exact
element to click. Every completed task is logged to InsForge in real time —
the next agent picks up where the last one left off.

Built for the **Applied Intelligence Hackathon @ Frontier Tower (2026-05-31)**.

## How it works

<p align="center">
  <img src="docs/architecture.svg" alt="EverNav architecture — two loops: Claude vision guidance + InsForge logging with realtime fan-out" width="780"/>
</p>

Two loops running side by side:

1. **Live guidance loop** — extension screenshots the active tab, sends the screenshot + DOM element list to **Claude Sonnet 4.6 vision**, gets back `{idx, instruction, done}`, blurs the page and halos the chosen element. Repeats on every click.

2. **Logging loop** — when the task is done, the extension POSTs to the InsForge **edge function** `log-session`, which calls the InsForge **AI gateway** (OpenRouter → Claude Haiku 4.5) to classify the task into one of `security / navigation / configuration / other`, then inserts the row into the **Postgres** `sessions` table. An `AFTER INSERT` trigger publishes a `session_logged` event over **realtime** WebSockets, fan-out to the **Next.js dashboard** hosted on InsForge — counters tick up and the matching card flashes lime, no refresh.

That's six InsForge surfaces lit up by one user click.

## Repo layout

```
extension/    Chrome MV3 extension (sideload in developer mode)
dashboard/    Next.js static-export dashboard, deployed via InsForge
functions/    InsForge edge functions (log-session)
migrations/   Postgres schema migrations (sessions table, RLS, realtime trigger)
docs/         Logo, architecture diagram, demo-day pre-flight
```

## Setup

### 1. Get your three API keys

| Provider | URL | Note |
|---|---|---|
| Anthropic | `console.anthropic.com` | Set a $5 spend cap. |
| Butterbase | `dashboard.butterbase.ai` | Apply promo `Build0530`. Generate a `bb_sk_` key and note your **app_id**. |
| Evermind | `everos.evermind.ai` | Cloud signup. |

### 2. Stand up the Butterbase backend

Install the Butterbase MCP plugin in Claude Code:

```bash
claude plugin marketplace add https://github.com/NetGPT-Inc/butterbase-plugin
claude plugin install butterbase
export BUTTERBASE_API_KEY=bb_sk_...
```

Then ask Claude Code: *"call init_app with name='evernav', then manage_schema apply with this schema."* The MCP tools handle the rest.

```json
{
  "tables": {
    "sessions": {
      "columns": {
        "id":           { "type": "uuid",        "primaryKey": true, "default": "gen_random_uuid()" },
        "user_id":      { "type": "text",        "nullable": false },
        "site":         { "type": "text",        "nullable": false },
        "task":         { "type": "text",        "nullable": false },
        "step_count":   { "type": "integer",     "nullable": false, "default": "0" },
        "completed_at": { "type": "timestamptz", "nullable": false, "default": "now()" }
      },
      "indexes": {
        "sessions_completed_at_idx": { "columns": ["completed_at"] }
      }
    }
  }
}
```

`init_app` returns three URLs:
- `api_url` — `https://api.butterbase.ai/v1/{app_id}` (REST endpoint for the extension)
- `url` — `https://{subdomain}.butterbase.dev` (where your deployed frontend will live)
- `subdomain` — your app's subdomain

Note the **app_id** (looks like `app_xxxxxxxxxxxx`) — you'll paste it into the extension options page.

Service-key auth (the `bb_sk_*` token) runs as `butterbase_service` which bypasses RLS automatically — no policy setup needed for the hackathon. The REST data API path is:

```
POST /v1/{app_id}/sessions     # insert a row
GET  /v1/{app_id}/sessions     # list rows (supports order/limit/offset)
```

### 3. Sideload the extension

```
chrome://extensions  →  Developer mode ON  →  Load unpacked  →  pick extension/
```

Pin the extension. Click ⚙ in the popup → paste your three keys + your Butterbase app_id → Save.

### 4. Build + deploy the dashboard

```bash
cd dashboard
cp .env.example .env.local
# edit .env.local: NEXT_PUBLIC_BB_APP_ID and NEXT_PUBLIC_BB_READ_KEY
npm install
npm run build      # produces ./out
```

Zip the build output from WSL/Git Bash (NOT PowerShell `Compress-Archive` — it
writes backslashes into the zip and Cloudflare Pages serves JS as `text/html`):

```bash
cd out && zip -r ../frontend.zip . && cd ..
```

Then ask Claude Code (with the Butterbase MCP loaded):

> *"Call `create_frontend_deployment` with framework=`nextjs-static` for app
> `app_xxxxxxxxxxxx`. Give me the uploadUrl. Then I'll PUT the zip; after that
> call `manage_frontend` action=`start_deployment` with the deployment_id."*

After upload:
```bash
curl -X PUT "<uploadUrl>" -H "Content-Type: application/zip" --data-binary @frontend.zip
```

Wait for status `READY`, then poll the live URL (`https://{subdomain}.butterbase.dev`)
until your build appears — Cloudflare edge propagation can take a few minutes.

### 5. Prime the Evermind cache

```bash
EVERMIND_KEY=evos_... \
DASHBOARD_URL=https://your-app.butterbase.ai \
node scripts/prime-evermind.js fixtures/rotate-pat-trail.json
```

Paste the `chrome.storage.local.set(...)` snippet the script prints into the extension service worker's DevTools console (`chrome://extensions` → EverNav → "service worker").

### 6. Demo

1. Open `github.com/settings/tokens`.
2. Click the extension. Type `rotate my personal access token`. Hit **Guide me**.
3. First time: vision picks each element, blur + glow walks you through.
4. Switch user (popup → `switch`). Same task → instant cache replay from Evermind.
5. Open the dashboard URL → session count incremented.

See `docs/demo-day-checklist.md` for the 15-minute pre-flight and co-driver hot-key map.

## Security

- API keys live in `chrome.storage.local`, never in the repo.
- `.env.local` is gitignored. Use `.env.example` as a template.
- **Rotate every key within an hour of demo end** — treat any key that ever existed on the demo laptop as burned.

## Known caveats

- Butterbase REST contract confirmed via MCP: `POST /v1/{app_id}/{table}` with `Authorization: Bearer bb_sk_...` and a JSON row body.
- The Evermind cloud `/memories/search` response envelope isn't documented inline; the parser is liberal in what it accepts (`results`, `memories`, `hits`, `data`).
- The shipped fallback trail in `fixtures/` is a best-guess. Re-record after the first successful live run.
- Scope is github.com only (manifest content_scripts). Adding sites is one line.
- Dashboard deploys are Cloudflare Pages — after `READY`, edge propagation can take a few minutes. Poll before declaring it live.
