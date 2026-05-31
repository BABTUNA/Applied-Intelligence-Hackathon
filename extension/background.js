// EverNav background service worker.
//
// Responsibilities:
//   1. Route messages between popup ↔ content script.
//   2. Persist session state to chrome.storage.session (SW idles after ~30s).
//   3. Orchestrate: vision call → overlay step → success → write to Evermind + Butterbase.
//   4. On task start, check Evermind cache first. Cache hit = replay trail, skip vision.
//   5. Keep the SW warm during an active session via chrome.alarms.
//
// Structure: all stubs in this commit; vision/evermind/butterbase wired in later commits.

const KEEPALIVE_ALARM = "evernav-keepalive";
const SHARED_USER = "global_skills"; // cross-user cache-hit bucket

// ─── state helpers ────────────────────────────────────────────────────────────

async function getState() {
  const { sessionState } = await chrome.storage.session.get("sessionState");
  return sessionState || null;
}

async function setState(patch) {
  const cur = (await getState()) || {};
  const next = { ...cur, ...patch };
  await chrome.storage.session.set({ sessionState: next });
  return next;
}

async function clearState() {
  await chrome.storage.session.remove("sessionState");
}

// ─── keep-alive ───────────────────────────────────────────────────────────────

async function startKeepAlive() {
  await chrome.alarms.create(KEEPALIVE_ALARM, { periodInMinutes: 0.3 });
}

async function stopKeepAlive() {
  await chrome.alarms.clear(KEEPALIVE_ALARM);
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === KEEPALIVE_ALARM) {
    // No-op: just touching the SW keeps it warm.
  }
});

// ─── key/config access ────────────────────────────────────────────────────────

async function getConfig() {
  return await chrome.storage.local.get([
    "anthropic",
    "evermind",
    "butterbase",
    "bbAppId",
  ]);
}

// ─── vendor calls (stubs, filled in later commits) ────────────────────────────

const VISION_MODEL = "claude-sonnet-4-6";
const VISION_SYSTEM = `You guide users through web UIs.

You will receive a screenshot of the user's current browser tab and a JSON
list of interactive elements visible in the viewport. Each element has an
\`idx\`, \`tag\`, \`text\`, \`aria\`, \`testid\`, \`role\`, and \`bbox\`.

Pick the single next element the user should click to make progress on
their stated task. Prefer elements whose \`text\` or \`aria\` matches the
task intent. The screenshot is only the visible viewport — if the task
requires off-screen content, pick an element that will scroll there.

RESPONSE FORMAT — you MUST return ONLY a JSON object, no prose, no markdown:
{"idx": <number>, "instruction": "<one short imperative sentence>", "done": <boolean>}

If the task already appears complete, OR no element on the page is a
useful next step, return:
{"idx": -1, "instruction": "Task complete.", "done": true}

Never reply in English. Never explain. Always return JSON.`;

// Site-specific guidance injected as an additional system instruction when the
// agent is operating on a known site. Surfaces flow knowledge that's easy for
// vision alone to mis-route ("Password and authentication" vs "Developer
// settings" on github.com is a famous trap).
const SITE_HINTS = {
  "amazon.com": `SITE: amazon.com — known navigation traps.

============================================================
TASK FAMILY: view / check / find my returns / refunds / order status
============================================================

THE ONE CORRECT PATH:

  Step 1. Look at the top-right of the Amazon header. There is a
          dedicated link literally labeled "Returns & Orders"
          (sometimes "Returns\n& Orders" on two lines). It sits to
          the right of "Account & Lists" and to the left of the cart.
  Step 2. Click "Returns & Orders". This goes to /gp/your-account/order-history
          (or /orders). The page lists recent orders with return/refund
          status visible per order.
  Step 3. For an in-progress return: each order with an active return
          shows a "View return/refund status" or "Track return"
          button — click that.

If the user isn't logged in, the page redirects to sign-in first.
On the sign-in screen, the next correct step is the Email/phone field.

============================================================
HARD ANTI-PATTERNS — sidebar / header items that LOOK related but are
WRONG for any "view my returns" task:
============================================================

  ✗ "Account & Lists"              — broad account dropdown; not direct
  ✗ "Hello, sign in" / "Hello, <name>" — auth menu, not orders
  ✗ "Today's Deals"                — shopping deals
  ✗ "Customer Service"             — help articles, not order list
  ✗ "Buy Again"                    — re-purchase suggestions, not returns
  ✗ "Your Lists"                   — wishlists
  ✗ "Browsing History"             — products viewed
  ✗ "Gift Cards"                   — gift card mgmt
  ✗ ANY product card or category   — not navigation

The correct link's text must literally contain "Returns & Orders".
If you can't see it, the user is likely on a non-amazon.com Amazon
(e.g. Whole Foods Market) or a deeply nested checkout page — pick
the Amazon logo at top-left to return to the home page first.

============================================================

`,
  "github.com": `SITE: github.com — known navigation traps.

============================================================
TASK FAMILY: rotate / create / regenerate / view a personal access token
============================================================

THE ONE CORRECT PATH — top-down. Pick the FIRST step not yet completed:

  Step 1. From any page, click the user-avatar button in the top-right
          header. (Element text/aria will mention "navigation menu" or
          show the username.)
  Step 2. In the dropdown, click "Settings".
  Step 3. The settings left sidebar appears. Scroll the sidebar
          ALL THE WAY DOWN. The correct link is literally labeled
          "Developer settings". It sits at the very bottom of the
          sidebar, BELOW every other item.
  Step 4. In Developer settings, click "Personal access tokens".
  Step 5. Click "Tokens (classic)" (or "Fine-grained tokens" if the
          task says fine-grained).
  Step 6. Click the token to regenerate, then "Regenerate token".

============================================================
HARD ANTI-PATTERNS — these sidebar items are SEMANTICALLY MISLEADING
but they are WRONG for any personal-access-token task. Never pick them:
============================================================

  ✗ "Repositories"               — repo defaults; NOT tokens
  ✗ "Password and authentication" — 2FA / passkeys; NOT tokens
  ✗ "SSH and GPG keys"            — SSH keys; NOT tokens
  ✗ "Applications"                — OAuth apps you authorized; NOT tokens
  ✗ "Code, planning, and automation" — actions/issues; NOT tokens
  ✗ "Code security"               — repo security defaults; NOT tokens
  ✗ "Account security"            — login/sessions; NOT tokens
  ✗ "Billing and plans"           — payment; NOT tokens
  ✗ "Sessions"                    — active logins; NOT tokens
  ✗ "Security log"                — audit log; NOT tokens
  ✗ "Notifications"               — emails/alerts; NOT tokens

If you see ANY of the above with text matching the task keywords —
ignore them. The correct link's text must literally contain
"Developer settings". Nothing else.

If "Developer settings" is not visible in the current viewport, pick
an element that scrolls the sidebar (e.g., the last visible sidebar
link, so scrolling reveals more). Never click a wrong link just because
it's in view.

============================================================
OTHER COMMON GITHUB FLOWS
============================================================

For "create a new repository": click the "+" icon in the top-right
header → "New repository".

For "delete a repository": go to the repo page → click its "Settings"
tab (NOT the global settings) → scroll to "Danger Zone" at the bottom
→ "Delete this repository".`,
};

function siteHintsFor(url) {
  try {
    let host = new URL(url).hostname.replace(/^www\./, "");
    if (SITE_HINTS[host]) return SITE_HINTS[host];
    // Parent-domain fallback so smile.amazon.com / m.amazon.com match
    // the amazon.com entry without duplicating it.
    const parts = host.split(".");
    while (parts.length > 2) {
      parts.shift();
      const parent = parts.join(".");
      if (SITE_HINTS[parent]) return SITE_HINTS[parent];
    }
    return "";
  } catch {
    return "";
  }
}

async function callVision({ screenshotB64, elements, task, apiKey, siteHints }) {
  const system = siteHints
    ? `${VISION_SYSTEM}\n\n---\n\n${siteHints}`
    : VISION_SYSTEM;
  const body = {
    model: VISION_MODEL,
    max_tokens: 256,
    system,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: "image/jpeg",
              data: screenshotB64,
            },
          },
          {
            type: "text",
            text: `Task: ${task}\n\nElements (JSON):\n${JSON.stringify(elements)}`,
          },
        ],
      },
    ],
  };

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`vision ${resp.status}: ${text.slice(0, 200)}`);
  }

  const data = await resp.json();
  const text = data?.content?.[0]?.text || "";
  return parseVisionJson(text);
}

function parseVisionJson(text) {
  // 1) Try strict JSON parse (handles markdown fences + leading prose).
  const stripped = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  const match = stripped.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      const parsed = JSON.parse(match[0]);
      if (typeof parsed.idx === "number") {
        if (typeof parsed.done !== "boolean") parsed.done = false;
        if (typeof parsed.instruction !== "string") parsed.instruction = "Click this.";
        return parsed;
      }
    } catch (e) {
      // fall through to prose recovery
    }
  }

  // 2) Claude returned prose — recover a "done" signal from natural language.
  console.warn("[evernav] vision returned non-JSON; raw text:", text.slice(0, 400));
  const lower = text.toLowerCase();
  const doneSignals = [
    "task is complete",
    "task complete",
    "appears complete",
    "already done",
    "no further action",
    "no more steps",
    "successfully completed",
    "no actionable",
    "cannot determine",
    "unable to identify",
    "this page does not",
    "this page doesn't",
  ];
  if (doneSignals.some((s) => lower.includes(s))) {
    return { idx: -1, done: true, instruction: "Task complete." };
  }

  throw new Error(`vision returned non-JSON: ${text.slice(0, 120)}`);
}

// Verified against the everos Python SDK v0.4.0 (base_url https://api.evermind.ai,
// Authorization: Bearer). Endpoints: POST /api/v1/memories, /memories/search,
// /memories/flush.
const EVERMIND_BASE = "https://api.evermind.ai/api/v1";

function slugify(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function sessionIdFor(site, task) {
  // Encodes site + task into a single filterable field. If filters in Evermind
  // turns out to accept only user_id (not arbitrary keys), session_id is still
  // first-class and we can filter on that instead.
  return `${site}::${slugify(task)}`;
}

async function evermindRead({ task, site }) {
  const cfg = await getConfig();
  if (!cfg.evermind) return null;

  const body = {
    query: `${task} on ${site}`,
    method: "hybrid",
    memory_types: ["episodic_memory"],
    top_k: 3,
    filters: { user_id: SHARED_USER },
  };

  let resp;
  try {
    resp = await fetch(`${EVERMIND_BASE}/memories/search`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${cfg.evermind}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    console.warn("[evernav] evermind unreachable:", e.message);
    return null;
  }
  if (!resp.ok) {
    console.warn("[evernav] evermind search non-2xx:", resp.status);
    return null;
  }

  const data = await resp.json();
  console.log("[evernav] evermind raw search response:", data);

  // The hybrid search response shape can vary across versions. Walk a few
  // common spots, coerce object-shaped wrappers to arrays, and never throw.
  let hits =
    data?.results ||
    data?.memories ||
    data?.hits ||
    data?.data ||
    data?.items ||
    [];
  if (!Array.isArray(hits)) {
    if (Array.isArray(hits?.items)) hits = hits.items;
    else if (Array.isArray(hits?.results)) hits = hits.results;
    else if (typeof hits === "object" && hits !== null) hits = [hits];
    else hits = [];
  }
  const wantId = sessionIdFor(site, task);

  for (const h of hits) {
    // Try common content paths.
    const raw =
      h?.content ||
      h?.message?.content ||
      h?.messages?.[0]?.content ||
      h?.text ||
      "";
    if (!raw) continue;
    let parsed;
    try { parsed = JSON.parse(raw); } catch { continue; }
    if (!parsed?.trail || !Array.isArray(parsed.trail)) continue;

    // Prefer exact session_id match (set on write); fall back to site match.
    const matchesId = h?.session_id === wantId || parsed?.session_id === wantId;
    const matchesSite = parsed?.site === site;
    if (matchesId || matchesSite) return parsed;
  }
  return null;
}

async function evermindWrite({ task, site, trail }) {
  const cfg = await getConfig();
  if (!cfg.evermind) return;

  const session_id = sessionIdFor(site, task);
  const payload = {
    user_id: SHARED_USER,
    session_id,
    messages: [
      {
        message_id: `evernav-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        sender_id: "evernav",
        sender_name: "EverNav Recorder",
        role: "assistant",
        timestamp: Date.now(),
        content: JSON.stringify({ task, site, session_id, trail }),
      },
    ],
  };

  try {
    const resp = await fetch(`${EVERMIND_BASE}/memories`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${cfg.evermind}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!resp.ok) {
      console.warn("[evernav] evermind write non-2xx:", resp.status, await resp.text());
    }
  } catch (e) {
    console.warn("[evernav] evermind write failed:", e.message);
  }
}

// REST API: POST /v1/{app_id}/{table} with the row body as JSON.
// Confirmed via the Butterbase MCP docs.
const BUTTERBASE_BASE = "https://api.butterbase.ai/v1";

async function butterbaseLog({ user, site, task, stepCount }) {
  const cfg = await getConfig();
  if (!cfg.butterbase || !cfg.bbAppId) {
    console.warn("[evernav] butterbase key/appId not set — skipping log");
    return;
  }

  const url = `${BUTTERBASE_BASE}/${encodeURIComponent(cfg.bbAppId)}/sessions`;
  const body = {
    user_id: user,
    site,
    task,
    step_count: stepCount,
    completed_at: new Date().toISOString(),
  };

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${cfg.butterbase}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      console.warn("[evernav] butterbase log non-2xx:", resp.status, await resp.text());
    }
  } catch (e) {
    console.warn("[evernav] butterbase log failed:", e.message);
  }
}

// ─── orchestration ────────────────────────────────────────────────────────────

async function startGuidance({ task, user, tabId, url }) {
  const site = new URL(url).hostname;
  await startKeepAlive();
  await setState({
    task, user, site, tabId,
    trail: [], step: 0, status: "active", source: "live",
  });
  // Persistent control bar — the popup vanishes the moment the user clicks
  // anywhere outside it, so we need a Stop button that lives on the page.
  await dispatchToContent(tabId, { type: "SHOW_CONTROL", task });
  // Always live. Evermind still gets written to on completion so the
  // knowledge base grows with every demo, but we don't short-circuit
  // the agent — judges should see the model actually reasoning.
  await requestNextLiveStep();
  return { ok: true, cacheHit: false, steps: null };
}

async function stopGuidance({ tabId }) {
  await dispatchToContent(tabId, { type: "CLEAR_OVERLAY" });
  await dispatchToContent(tabId, { type: "HIDE_THINKING" });
  await dispatchToContent(tabId, { type: "HIDE_CONTROL" });
  await stopKeepAlive();
  await clearState();
  return { ok: true };
}

async function requestNextLiveStep() {
  const st = await getState();
  if (!st || st.status !== "active") return;

  const cfg = await getConfig();
  if (!cfg.anthropic) {
    console.error("[evernav] missing anthropic key — set it in options");
    return;
  }

  const firstStep = st.step === 0;
  const thinkingLabel = firstStep ? "Reading the page…" : "Picking the next step…";

  // Fire the thinking pill + control bar immediately (best-effort — content
  // script might still be mid-teardown on a hard nav, so the message could
  // quietly drop).
  dispatchToContent(st.tabId, { type: "SHOW_THINKING", label: thinkingLabel });
  dispatchToContent(st.tabId, { type: "SHOW_CONTROL", task: st.task });

  // After a click, the page is almost always navigating (Turbo swap or hard
  // load on github.com). Screenshot/enumerate before it settles and we'll see
  // a stale DOM. Wait, then resend both UI bits in case the prior dispatch
  // hit a dying content script (or the new page hasn't mounted yet).
  if (!firstStep) {
    await new Promise((r) => setTimeout(r, 1500));
    dispatchToContent(st.tabId, { type: "SHOW_THINKING", label: thinkingLabel });
    dispatchToContent(st.tabId, { type: "SHOW_CONTROL", task: st.task });
  }

  // 1) Screenshot the active tab — capture against the EXACT window that holds
  //    our target tab, not chrome.windows.WINDOW_ID_CURRENT (which can be the
  //    DevTools window if it's focused, throwing "Cannot access devtools://").
  let tabMeta;
  try {
    tabMeta = await chrome.tabs.get(st.tabId);
  } catch (e) {
    console.error("[evernav] target tab disappeared:", e.message);
    await dispatchToContent(st.tabId, { type: "HIDE_THINKING" });
    await stopGuidance({ tabId: st.tabId });
    return;
  }
  if (!tabMeta?.url || !/^https?:\/\//i.test(tabMeta.url)) {
    console.error("[evernav] target tab is not a screenshotable URL:", tabMeta?.url);
    await dispatchToContent(st.tabId, { type: "HIDE_THINKING" });
    await stopGuidance({ tabId: st.tabId });
    return;
  }
  const screenshotDataUrl = await chrome.tabs.captureVisibleTab(tabMeta.windowId, {
    format: "jpeg",
    quality: 70,
  });
  const screenshotB64 = screenshotDataUrl.split(",")[1];

  // 2) Ask the content script for the current interactive-element list.
  //    On hard navs the content script may still be initializing — retry a
  //    few times before giving up.
  let enumResp = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    enumResp = await dispatchToContent(st.tabId, { type: "ENUMERATE_ELEMENTS" });
    if (enumResp?.ok && Array.isArray(enumResp.elements) && enumResp.elements.length > 0) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  if (!enumResp?.ok) {
    console.error("[evernav] could not enumerate elements after retries");
    await dispatchToContent(st.tabId, { type: "HIDE_THINKING" });
    return;
  }
  const elements = enumResp.elements;

  // 3) Call vision.
  let pick;
  try {
    pick = await callVision({
      screenshotB64,
      elements,
      task: st.task,
      apiKey: cfg.anthropic,
      siteHints: siteHintsFor(tabMeta.url),
    });
  } catch (e) {
    console.error("[evernav] vision call failed:", e);
    await dispatchToContent(st.tabId, { type: "HIDE_THINKING" });
    // Fail-safe: stop the session so the pill doesn't get stuck and so
    // we don't keep retrying against a bad page. User can hit Guide me
    // again to restart from the current viewport.
    await stopGuidance({ tabId: st.tabId });
    return;
  }

  // 4) If the model says done, flip the flag — the next STEP_COMPLETED will
  //    trigger the write+log path. If the user is already done, just close out.
  if (pick.done || pick.idx === -1) {
    await setState({ taskDone: true });
    // Synthesize a completion (no real click happened) so onStepCompleted runs.
    onStepCompleted({ stepIndex: st.step, target: null });
    return;
  }

  // 5) Highlight the chosen element.
  await dispatchToContent(st.tabId, {
    type: "HIGHLIGHT_INDEX",
    idx: pick.idx,
    instruction: pick.instruction,
    stepIndex: st.step,
  });
}

async function onStepCompleted({ stepIndex, target }) {
  const st = await getState();
  if (!st) return;

  const trail = [...(st.trail || []), { stepIndex, target }];
  await setState({ trail, step: stepIndex + 1 });

  // If this was the final step (vision returned done:true earlier), persist + log.
  if (st.taskDone) {
    await evermindWrite({ task: st.task, site: st.site, trail });
    await butterbaseLog({
      user: st.user,
      site: st.site,
      task: st.task,
      stepCount: trail.length,
    });
    await stopGuidance({ tabId: st.tabId });
  } else if (st.source === "live") {
    await requestNextLiveStep();
  }
}

// ─── messaging ────────────────────────────────────────────────────────────────

async function ensureContentScript(tabId) {
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
    await chrome.scripting.insertCSS({ target: { tabId }, files: ["overlay.css"] });
    // Let the new instance's message listener register.
    await new Promise((r) => setTimeout(r, 120));
    return true;
  } catch (e) {
    console.warn("[evernav] could not inject content script:", e.message);
    return false;
  }
}

async function dispatchToContent(tabId, msg) {
  try {
    return await chrome.tabs.sendMessage(tabId, msg);
  } catch (e) {
    const orphaned = String(e.message || "").includes("Receiving end");
    if (!orphaned) {
      console.warn("[evernav] content script error:", e.message);
      return null;
    }
    // Orphaned content script (e.g. extension was reloaded while tab stayed
    // open). Inject a fresh one and retry once.
    console.log("[evernav] content script orphaned — re-injecting");
    const ok = await ensureContentScript(tabId);
    if (!ok) return null;
    try {
      return await chrome.tabs.sendMessage(tabId, msg);
    } catch (e2) {
      console.warn("[evernav] retry after inject failed:", e2.message);
      return null;
    }
  }
}

// ─── demo-day fallbacks ───────────────────────────────────────────────────────

const DASHBOARD_URL_KEY = "dashboardUrl";

async function getFallbackTrail() {
  // Pre-baked in chrome.storage.local by the prime-evermind script (commit 16).
  // Shape: { task, site, trail: [{target: {tag,text,aria,...}, instruction}, ...] }
  const { fallbackTrail } = await chrome.storage.local.get("fallbackTrail");
  return fallbackTrail || null;
}

async function demoForceReplay(userOverride) {
  const fb = await getFallbackTrail();
  if (!fb) {
    console.warn("[evernav] no fallback trail in storage — see scripts/prime-evermind");
    return;
  }
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;

  if (userOverride) {
    await chrome.storage.session.set({ activeUser: userOverride });
  }
  await setState({
    task: fb.task,
    user: userOverride || "demo_user_1",
    site: fb.site,
    tabId: tab.id,
    trail: fb.trail,
    step: 0,
    status: "active",
    source: "fallback",
  });
  await dispatchToContent(tab.id, { type: "REPLAY_TRAIL", trail: fb.trail });
}

async function demoOpenDashboard() {
  const { dashboardUrl } = await chrome.storage.local.get(DASHBOARD_URL_KEY);
  if (!dashboardUrl) {
    console.warn("[evernav] dashboardUrl not set in storage.local");
    return;
  }
  await chrome.tabs.create({ url: dashboardUrl });
}

async function demoReprimeCache() {
  const st = await getState();
  const fb = await getFallbackTrail();
  if (!fb) return;
  await evermindWrite({
    task: fb.task,
    site: fb.site,
    trail: fb.trail,
  });
  console.log("[evernav] cache re-primed:", fb.task);
}

// ─── message router ───────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      switch (msg.type) {
        case "START_GUIDANCE":
          sendResponse(await startGuidance(msg));
          break;
        case "STOP_GUIDANCE":
          sendResponse(await stopGuidance(msg));
          break;
        case "STOP_GUIDANCE_FROM_PAGE": {
          // Stop button on the in-page control bar — tabId isn't on the msg,
          // pull it from sender or state.
          const tabId = sender?.tab?.id ?? (await getState())?.tabId;
          if (tabId != null) await stopGuidance({ tabId });
          sendResponse({ ok: true });
          break;
        }
        case "STEP_COMPLETED":
          await onStepCompleted(msg);
          sendResponse({ ok: true });
          break;
        case "DEMO_FORCE_BEAT_1":
          await demoForceReplay("demo_user_1");
          sendResponse({ ok: true });
          break;
        case "DEMO_FORCE_BEAT_2":
          await demoForceReplay("demo_user_2");
          sendResponse({ ok: true });
          break;
        case "DEMO_OPEN_DASHBOARD":
          await demoOpenDashboard();
          sendResponse({ ok: true });
          break;
        case "DEMO_REPRIME_CACHE":
          await demoReprimeCache();
          sendResponse({ ok: true });
          break;
        default:
          sendResponse({ ok: false, error: `unknown type: ${msg.type}` });
      }
    } catch (e) {
      console.error("[evernav]", e);
      sendResponse({ ok: false, error: String(e.message || e) });
    }
  })();
  return true; // keep channel open for async sendResponse
});

console.log("[evernav] background service worker loaded");
