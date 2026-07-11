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
    "insforgeUrl",
    "insforgeAnonKey",
  ]);
}

// ─── hard navigation tracking ─────────────────────────────────────────────────

let _lastNavAt = 0;

// ─── vendor calls (stubs, filled in later commits) ────────────────────────────

const VISION_MODEL = "claude-sonnet-4-6";
const VISION_SYSTEM = `You guide users through web UIs.

You will receive a screenshot of the user's current browser tab and a JSON
list of interactive elements visible in the viewport. Each element has an
\`idx\`, \`tag\`, \`text\`, \`aria\`, \`testid\`, \`role\`, \`fid\` (fingerprint), and \`bbox\`.

The \`fid\` field is a stable element fingerprint that survives DOM reshuffles.
It uses one of these formats:
- \`tid:<data-testid>\` — from the element's data-testid attribute
- \`id:<stable-id>\` — from a stable HTML id
- \`fp:<tag>:<aria-or-text-and-role>\` — computed from tag + attributes

Pick the single next element the user should click to make progress on
their stated task. Prefer elements whose \`text\` or \`aria\` matches the
task intent. The screenshot is only the visible viewport — if the task
requires off-screen content, pick an element that will scroll there.

RESPONSE FORMAT — you MUST return ONLY a JSON object, no prose, no markdown:
{"idx": <number>, "fid": "<fingerprint string or null>", "instruction": "<one short imperative sentence>", "done": <boolean>}

If the task already appears complete, OR no element on the page is a
useful next step, return:
{"idx": -1, "fid": null, "instruction": "Task complete.", "done": true}

Never reply in English. Never explain. Always return JSON.`;

import { siteHintsFor } from "./site-hints.js";

// Vision call routes through the InsForge `vision-pick` edge function, which
// proxies to OpenRouter (via the InsForge AI Gateway) and returns clean
// {idx, instruction, done}. The Anthropic API key never leaves the server —
// the extension only ever knows the InsForge URL.
async function callVision({ screenshotB64, elements, task, siteHints, insforgeUrl, stepHistory }) {
  if (!insforgeUrl) throw new Error("insforge url not configured");

  const url = `${insforgeUrl.replace(/\/+$/, "")}/functions/vision-pick`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      screenshot_b64: screenshotB64,
      elements,
      task,
      site_hints: siteHints || null,
      step_history: Array.isArray(stepHistory) && stepHistory.length > 0 ? stepHistory : undefined,
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`vision-pick ${resp.status}: ${text.slice(0, 200)}`);
  }

  const data = await resp.json();
  if (data?.error) throw new Error(`vision-pick error: ${data.error}`);
  if (typeof data?.idx !== "number") throw new Error("vision-pick returned no idx");
  return {
    idx: data.idx,
    fid: typeof data.fid === "string" ? data.fid : null,
    instruction: typeof data.instruction === "string" ? data.instruction : "Click this.",
    done: typeof data.done === "boolean" ? data.done : false,
  };
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

// (Evermind integration removed for the Applied Intelligence branch — today's
// stack is Anthropic + InsForge only.)

// InsForge edge function `log-session`: validates, classifies the task via
// the InsForge AI gateway (OpenRouter → Claude Haiku), then inserts into the
// `sessions` table. The Postgres trigger fans the new row out to subscribed
// dashboard clients via realtime. Touching 4 InsForge surfaces in one call.
async function insforgeLog({ user, site, task, stepCount, stepSummary }) {
  const cfg = await getConfig();
  if (!cfg.insforgeUrl) {
    console.warn("[evernav] insforge url not set — skipping log");
    return;
  }

  const url = `${cfg.insforgeUrl.replace(/\/+$/, "")}/functions/log-session`;
  const body = {
    user_id: user,
    site,
    task,
    step_count: stepCount,
    step_summary: Array.isArray(stepSummary) ? stepSummary.slice(0, 15) : undefined,
  };

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await resp.json().catch(() => null);
    if (!resp.ok) {
      console.warn("[evernav] insforge log non-2xx:", resp.status, data);
    } else {
      console.log("[evernav] session logged — category:", data?.category);
    }
  } catch (e) {
    console.warn("[evernav] insforge log failed:", e.message);
  }
}

// ─── oscillation detection ────────────────────────────────────────────────────

const MAX_STEPS = 15;

function detectOscillation(stepHistory) {
  if (!Array.isArray(stepHistory) || stepHistory.length < 3) return null;
  const recent = stepHistory.slice(-4);
  // Check if same fingerprint appears 2+ times in last 4 steps
  const fidCounts = {};
  const instrCounts = {};
  for (const s of recent) {
    if (s.fid) fidCounts[s.fid] = (fidCounts[s.fid] || 0) + 1;
    if (s.instruction) instrCounts[s.instruction] = (instrCounts[s.instruction] || 0) + 1;
  }
  const repeatedFids = Object.entries(fidCounts).filter(([, c]) => c >= 2).map(([fid]) => fid);
  const repeatedInstrs = Object.entries(instrCounts).filter(([, c]) => c >= 2).map(([instr]) => instr);
  if (repeatedFids.length === 0 && repeatedInstrs.length === 0) return null;
  return { repeatedFids, repeatedInstrs };
}

// ─── orchestration ────────────────────────────────────────────────────────────

async function startGuidance({ task, user, tabId, url }) {
  const site = new URL(url).hostname;
  await startKeepAlive();
  await setState({
    task, user, site, tabId,
    trail: [], step: 0, status: "active", source: "live",
    stepHistory: [],
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
  if (!cfg.insforgeUrl) {
    console.error("[evernav] missing insforge url — set it in options");
    return;
  }

  // Hard limit — auto-stop after MAX_STEPS to prevent runaway sessions
  if (st.step >= MAX_STEPS) {
    console.warn("[evernav] maximum steps exceeded — stopping guidance");
    await stopGuidance({ tabId: st.tabId });
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
    // 300ms minimum floor (animation baseline)
    await new Promise((r) => setTimeout(r, 300));

    // Add extra buffer if hard nav was detected recently
    if (Date.now() - _lastNavAt < 2000) {
      await new Promise((r) => setTimeout(r, 500));
    }

    // Ask content script to report when DOM is settled
    try {
      const settleResp = await dispatchToContent(st.tabId, { type: "WAIT_FOR_SETTLED" });
      if (!settleResp?.ok) {
        // Content script is dead (hard nav) — fallback to a sleep
        await new Promise((r) => setTimeout(r, 1200));
      }
    } catch {
      await new Promise((r) => setTimeout(r, 1200));
    }

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

  // 3) Call vision — inject anti-loop directive if oscillation detected.
  let hints = siteHintsFor(tabMeta.url);
  const oscillation = detectOscillation(st.stepHistory || []);
  if (oscillation) {
    console.warn("[evernav] oscillation detected:", oscillation);
    const avoidList = [
      ...oscillation.repeatedFids.map((f) => `fingerprint ${f}`),
      ...oscillation.repeatedInstrs.map((i) => `"${i}"`),
    ];
    hints += `\n\nWARNING: The agent is oscillating. Do NOT click these recently-repeated elements: ${avoidList.join(", ")}. Pick a DIFFERENT element to make forward progress.`;
  }

  let pick;
  try {
    pick = await callVision({
      screenshotB64,
      elements,
      task: st.task,
      siteHints: hints,
      insforgeUrl: cfg.insforgeUrl,
      stepHistory: st.stepHistory || [],
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

  // Build step record for history
  const chosenElement = elements.find((e) => e.idx === pick.idx);
  const stepRecord = {
    stepIndex: st.step,
    instruction: pick.instruction,
    fid: pick.fid || chosenElement?.fid || null,
    elementText: chosenElement?.text || "",
    pageUrl: tabMeta.url,
    timestamp: Date.now(),
  };
  const updatedHistory = [...(st.stepHistory || []), stepRecord].slice(-10);
  await setState({ stepHistory: updatedHistory });

  // 5) Highlight the chosen element — pass both fid and idx for fingerprint-first resolution.
  const fid = pick.fid || chosenElement?.fid || null;
  await dispatchToContent(st.tabId, {
    type: "HIGHLIGHT_INDEX",
    idx: pick.idx,
    fid,
    instruction: pick.instruction,
    stepIndex: st.step,
  });
}

async function onStepCompleted({ stepIndex, target }) {
  const st = await getState();
  if (!st) return;

  const trail = [...(st.trail || []), { stepIndex, target }];
  await setState({ trail, step: stepIndex + 1 });

  // If this was the final step (vision returned done:true earlier), log + close.
  if (st.taskDone) {
    const stepSummary = (st.stepHistory || []).map((s) => ({
      instruction: s.instruction,
      element: s.elementText || null,
    }));
    await insforgeLog({
      user: st.user,
      site: st.site,
      task: st.task,
      stepCount: trail.length,
      stepSummary,
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
    stepHistory: [],
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
        case "PAGE_NAVIGATING":
          _lastNavAt = Date.now();
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
        // DEMO_REPRIME_CACHE removed (no Evermind cache to reprime on this branch)
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
