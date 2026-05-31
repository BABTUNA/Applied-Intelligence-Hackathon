#!/usr/bin/env node
//
// Prime Evermind with a fixture trail so the live cache-hit beat works.
// Also prints a snippet to paste into the extension's service-worker console
// to set the same trail as the chrome.storage.local fallback.
//
// Usage:
//   EVERMIND_KEY=evos_... node scripts/prime-evermind.js fixtures/rotate-pat-trail.json
//
// Optional env:
//   EVERMIND_BASE   default https://everos.evermind.ai/api/v1
//   SHARED_USER     default global_skills (must match background.js SHARED_USER)
//   DASHBOARD_URL   if set, also emitted in the storage.local snippet

const fs = require("node:fs");
const path = require("node:path");

const EVERMIND_BASE = process.env.EVERMIND_BASE || "https://api.evermind.ai/api/v1";
const SHARED_USER = process.env.SHARED_USER || "global_skills";
const KEY = process.env.EVERMIND_KEY;

function die(msg, code = 1) {
  console.error(`✗ ${msg}`);
  process.exit(code);
}

if (!KEY) die("EVERMIND_KEY env var is required.");

const fixturePath = process.argv[2];
if (!fixturePath) die("Usage: node scripts/prime-evermind.js <fixture.json>");

const fixture = JSON.parse(fs.readFileSync(path.resolve(fixturePath), "utf8"));
if (!fixture.task || !fixture.site || !Array.isArray(fixture.trail)) {
  die("Fixture missing task/site/trail.");
}

const session_id = fixture.session_id || `${fixture.site}::${slugify(fixture.task)}`;

function slugify(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64);
}

async function writeMemory() {
  const payload = {
    user_id: SHARED_USER,
    session_id,
    messages: [
      {
        message_id: `prime-${Date.now()}`,
        sender_id: "evernav",
        sender_name: "EverNav Primer",
        role: "assistant",
        timestamp: Date.now(),
        content: JSON.stringify({
          task: fixture.task,
          site: fixture.site,
          session_id,
          trail: fixture.trail,
        }),
      },
    ],
  };
  const resp = await fetch(`${EVERMIND_BASE}/memories`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const text = await resp.text();
  if (!resp.ok) die(`Evermind write failed (${resp.status}): ${text}`);
  console.log(`✓ Wrote skill to Evermind under ${SHARED_USER} / session ${session_id}`);
}

async function verifyRead() {
  const resp = await fetch(`${EVERMIND_BASE}/memories/search`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: `${fixture.task} on ${fixture.site}`,
      method: "hybrid",
      memory_types: ["episodic_memory"],
      top_k: 3,
      filters: { user_id: SHARED_USER },
    }),
  });
  if (!resp.ok) {
    console.warn(`⚠ Verify read non-2xx (${resp.status}). Cache may still be eventually consistent.`);
    return;
  }
  const data = await resp.json();
  const hits = data?.results || data?.memories || data?.hits || data?.data || [];
  if (hits.length > 0) {
    console.log(`✓ Verified — ${hits.length} hit(s) returned for the demo query.`);
  } else {
    console.warn("⚠ Verify read returned zero hits. Run again or check filters schema.");
  }
}

function printStorageSnippet() {
  const payload = { fallbackTrail: fixture };
  if (process.env.DASHBOARD_URL) payload.dashboardUrl = process.env.DASHBOARD_URL;

  console.log("\n────────────────────────────────────────────────────────────");
  console.log("Paste this into the extension service worker's DevTools console");
  console.log("(chrome://extensions → EverNav → 'service worker' link):");
  console.log("────────────────────────────────────────────────────────────");
  console.log(`chrome.storage.local.set(${JSON.stringify(payload)})`);
  console.log("────────────────────────────────────────────────────────────\n");
}

(async () => {
  await writeMemory();
  await verifyRead();
  printStorageSnippet();
})().catch((e) => die(e.message || String(e)));
