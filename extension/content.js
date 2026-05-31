// EverNav content script (runs on github.com).
//
// This commit: viewport element enumerator + message listener skeleton.
// Overlay rendering lands in the next commit; turbo handling after that.

const MAX_ELEMENTS = 80;
const VIEWPORT_PAD = 200; // px of slack above/below the viewport
const INTERACTIVE_SELECTOR = [
  "a[href]",
  "button",
  "input:not([type=hidden])",
  "textarea",
  "select",
  "[role=button]",
  "[role=link]",
  "[role=menuitem]",
  "[role=tab]",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

/** Map<number, Element> — index returned to SW resolves back to a live node here. */
let elementRegistry = new Map();

function isVisible(el) {
  const rect = el.getBoundingClientRect();
  if (rect.width < 4 || rect.height < 4) return false;
  const style = getComputedStyle(el);
  if (style.visibility === "hidden" || style.display === "none") return false;
  if (parseFloat(style.opacity || "1") < 0.1) return false;
  return true;
}

function isInExtendedViewport(el) {
  const rect = el.getBoundingClientRect();
  const vh = window.innerHeight;
  const vw = window.innerWidth;
  return (
    rect.bottom > -VIEWPORT_PAD &&
    rect.top < vh + VIEWPORT_PAD &&
    rect.right > 0 &&
    rect.left < vw
  );
}

function textOf(el) {
  // Visible text (no markup), trimmed and capped.
  const raw =
    el.getAttribute("aria-label") ||
    el.innerText ||
    el.value ||
    el.getAttribute("placeholder") ||
    el.getAttribute("title") ||
    "";
  return raw.replace(/\s+/g, " ").trim().slice(0, 80);
}

function describe(el, idx) {
  const rect = el.getBoundingClientRect();
  return {
    idx,
    tag: el.tagName.toLowerCase(),
    role: el.getAttribute("role") || undefined,
    text: textOf(el),
    aria: el.getAttribute("aria-label") || undefined,
    testid: el.getAttribute("data-testid") || undefined,
    bbox: [
      Math.round(rect.left),
      Math.round(rect.top),
      Math.round(rect.width),
      Math.round(rect.height),
    ],
  };
}

function buildElementList() {
  const all = Array.from(document.querySelectorAll(INTERACTIVE_SELECTOR));
  const visible = all.filter((el) => isVisible(el) && isInExtendedViewport(el));

  // Stable order: by document position (querySelectorAll order is doc order).
  const picked = visible.slice(0, MAX_ELEMENTS);

  elementRegistry = new Map();
  const out = picked.map((el, i) => {
    elementRegistry.set(i, el);
    return describe(el, i);
  });

  return out;
}

function resolveIndex(idx) {
  const el = elementRegistry.get(idx);
  if (!el || !el.isConnected) return null;
  return el;
}

function elementSignature(el) {
  // Stable-ish descriptor used to re-find an element during cached-trail replay.
  return {
    tag: el.tagName.toLowerCase(),
    text: textOf(el).toLowerCase(),
    aria: (el.getAttribute("aria-label") || "").toLowerCase() || undefined,
    testid: el.getAttribute("data-testid") || undefined,
    role: el.getAttribute("role") || undefined,
  };
}

// ─── overlay ──────────────────────────────────────────────────────────────────

const OVERLAY_IDS = [
  "__evernav_backdrop__",
  "__evernav_clone__",
  "__evernav_halo__",
  "__evernav_tooltip__",
];

let overlayState = null; // { target, onResize, onClick, instruction }

function clearOverlay() {
  for (const id of OVERLAY_IDS) {
    document.getElementById(id)?.remove();
  }
  if (overlayState) {
    window.removeEventListener("scroll", overlayState.onResize, true);
    window.removeEventListener("resize", overlayState.onResize);
    if (overlayState.target && overlayState.onClick) {
      overlayState.target.removeEventListener("click", overlayState.onClick, true);
    }
    overlayState = null;
  }
}

function positionElements(target) {
  const rect = target.getBoundingClientRect();
  const HALO_PAD = 12;   // room for the glow + ring stack
  const CLONE_PAD = 3;   // a touch larger than the element so blur edges never seep through
  const halo = document.getElementById("__evernav_halo__");
  const clone = document.getElementById("__evernav_clone__");
  const tip = document.getElementById("__evernav_tooltip__");

  if (halo) {
    halo.style.top = `${rect.top - HALO_PAD}px`;
    halo.style.left = `${rect.left - HALO_PAD}px`;
    halo.style.width = `${rect.width + HALO_PAD * 2}px`;
    halo.style.height = `${rect.height + HALO_PAD * 2}px`;
  }

  if (clone) {
    clone.style.top = `${rect.top - CLONE_PAD}px`;
    clone.style.left = `${rect.left - CLONE_PAD}px`;
    clone.style.width = `${rect.width + CLONE_PAD * 2}px`;
    clone.style.height = `${rect.height + CLONE_PAD * 2}px`;
    clone.style.padding = `${CLONE_PAD}px`;
  }

  if (tip) {
    const tipRect = tip.getBoundingClientRect();
    const below = rect.bottom + 12;
    const above = rect.top - tipRect.height - 12;
    const top = below + tipRect.height < window.innerHeight ? below : Math.max(8, above);
    const leftRaw = rect.left + rect.width / 2 - tipRect.width / 2;
    const left = Math.max(8, Math.min(window.innerWidth - tipRect.width - 8, leftRaw));
    tip.style.top = `${top}px`;
    tip.style.left = `${left}px`;
  }
}

function renderOverlay(target, instruction, opts = {}) {
  clearOverlay();
  if (!target) return false;

  target.scrollIntoView({ block: "center", behavior: "instant" });

  // Backdrop (blur layer)
  const backdrop = document.createElement("div");
  backdrop.id = "__evernav_backdrop__";
  document.documentElement.appendChild(backdrop);

  // Clone of target so it appears sharp above the blurred backdrop.
  // Using a literal innerHTML clone preserves rendered look without hooking
  // up React/Turbo internals.
  //
  // The clone wrapper inherits the page's body bg + text color so the
  // cloned element keeps the same readability it had in context. (Without
  // this, dark-mode GitHub's white text rendered on the previous cream
  // background was invisible — see screenshot bug.)
  const clone = document.createElement("div");
  clone.id = "__evernav_clone__";
  const bodyStyle = getComputedStyle(document.body);
  const pageBg = bodyStyle.backgroundColor;
  const pageColor = bodyStyle.color;
  // If body bg is transparent (rare), fall back to the html element's bg.
  const effectiveBg =
    pageBg && pageBg !== "rgba(0, 0, 0, 0)" && pageBg !== "transparent"
      ? pageBg
      : getComputedStyle(document.documentElement).backgroundColor || "#FAFAF7";
  clone.style.background = effectiveBg;
  clone.style.color = pageColor || "inherit";
  clone.innerHTML = target.outerHTML;
  // Strip ids from cloned subtree to avoid duplicate-id pollution.
  clone.querySelectorAll("[id]").forEach((n) => n.removeAttribute("id"));
  document.documentElement.appendChild(clone);

  // Halo
  const halo = document.createElement("div");
  halo.id = "__evernav_halo__";
  document.documentElement.appendChild(halo);

  // Tooltip
  if (instruction) {
    const tip = document.createElement("div");
    tip.id = "__evernav_tooltip__";
    tip.innerHTML = `<span class="__evernav_kicker__">Next step</span>${escapeHtml(instruction)}`;
    document.documentElement.appendChild(tip);
  }

  positionElements(target);

  // Reposition on scroll/resize. capture:true on scroll catches nested scrolls.
  const onResize = () => positionElements(target);
  window.addEventListener("scroll", onResize, true);
  window.addEventListener("resize", onResize);

  // Advance on the user actually clicking the target.
  const onClick = () => {
    const sig = elementSignature(target);
    chrome.runtime.sendMessage({
      type: "STEP_COMPLETED",
      stepIndex: opts.stepIndex ?? null,
      target: sig,
    });
    clearOverlay();
    if (typeof opts.onCompleted === "function") {
      // Defer so the page's own click handler runs first.
      setTimeout(opts.onCompleted, 0);
    }
  };
  target.addEventListener("click", onClick, { once: true, capture: true });

  overlayState = { target, onResize, onClick, instruction };
  return true;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

// ─── "agent thinking" indicator (shown while waiting for Claude) ─────────────

let thinkingEl = null;
let thinkingDim = null;

function showThinking(label) {
  hideThinking();

  thinkingDim = document.createElement("div");
  thinkingDim.id = "__evernav_thinking_dim__";
  document.documentElement.appendChild(thinkingDim);

  thinkingEl = document.createElement("div");
  thinkingEl.id = "__evernav_thinking__";
  thinkingEl.innerHTML = `
    <span class="__evernav_orb__"></span>
    <span class="__evernav_label__">${escapeHtml(label || "EverNav is thinking")}</span>
    <span class="__evernav_dots__"><span></span><span></span><span></span></span>
  `;
  document.documentElement.appendChild(thinkingEl);
}

function hideThinking() {
  thinkingEl?.remove();
  thinkingEl = null;
  thinkingDim?.remove();
  thinkingDim = null;
}

// ─── persistent control bar (Stop button while guidance is active) ──────────

let controlEl = null;

function showControl(task) {
  hideControl();
  controlEl = document.createElement("div");
  controlEl.id = "__evernav_control__";
  controlEl.innerHTML = `
    <span class="__evernav_control_dot__"></span>
    <span class="__evernav_control_label__">Guiding</span>
    <span class="__evernav_control_task__">${escapeHtml(task || "")}</span>
    <button class="__evernav_stop__" type="button">Stop</button>
  `;
  document.documentElement.appendChild(controlEl);
  controlEl.querySelector(".__evernav_stop__").addEventListener("click", (e) => {
    e.stopPropagation();
    chrome.runtime.sendMessage({ type: "STOP_GUIDANCE_FROM_PAGE" });
  });
}

function hideControl() {
  controlEl?.remove();
  controlEl = null;
}

// ─── signature-based element re-finding (for cached trail replay) ─────────────

function scoreMatch(candSig, want) {
  if (!candSig.tag || candSig.tag !== want.tag) return 0;
  let score = 10;
  if (want.testid && candSig.testid === want.testid) score += 100;
  if (want.text && candSig.text && candSig.text === want.text) score += 50;
  if (want.aria && candSig.aria && candSig.aria === want.aria) score += 30;
  if (want.role && candSig.role === want.role) score += 10;
  // Partial text match as a weak signal.
  if (want.text && candSig.text && candSig.text.includes(want.text)) score += 15;
  return score;
}

function findElementBySignature(want) {
  const all = Array.from(document.querySelectorAll(INTERACTIVE_SELECTOR));
  let best = null;
  let bestScore = 0;
  for (const el of all) {
    if (!isVisible(el)) continue;
    const sig = elementSignature(el);
    const s = scoreMatch(sig, want);
    if (s > bestScore) {
      bestScore = s;
      best = el;
    }
  }
  // Require at least a tag match + one strong attribute.
  return bestScore >= 25 ? best : null;
}

// ─── cached-trail replay ──────────────────────────────────────────────────────

let activeReplay = null;

function startReplay(trail) {
  activeReplay = { trail, step: 0 };
  advanceReplay();
}

function advanceReplay() {
  if (!activeReplay) return;
  const { trail, step } = activeReplay;
  if (step >= trail.length) {
    activeReplay = null;
    chrome.runtime.sendMessage({ type: "TRAIL_COMPLETE" });
    return;
  }
  const cur = trail[step];

  // Let the DOM settle after the previous click before re-searching.
  setTimeout(() => {
    if (!activeReplay) return; // cancelled
    const target = findElementBySignature(cur.target);
    if (!target) {
      chrome.runtime.sendMessage({
        type: "STEP_FAILED",
        stepIndex: step,
        reason: "signature_not_found",
        want: cur.target,
      });
      activeReplay = null;
      return;
    }
    renderOverlay(target, cur.instruction || "Click to continue", {
      stepIndex: step,
      onCompleted: () => {
        activeReplay.step += 1;
        advanceReplay();
      },
    });
  }, 300);
}

// ─── turbo + mutation handling ────────────────────────────────────────────────
//
// GitHub uses Turbo (turbo:load, turbo:render, turbo:frame-load) to swap DOM
// without a full page navigation. Any active overlay must be torn down or it
// will point at a detached node.

function onPageReshape() {
  if (overlayState && (!overlayState.target.isConnected || !document.documentElement.contains(overlayState.target))) {
    clearOverlay();
    // If we're mid-replay, advanceReplay will re-search on the next tick.
    if (activeReplay) advanceReplay();
  }
}

["turbo:load", "turbo:render", "turbo:frame-load", "turbo:visit"].forEach((evt) => {
  document.addEventListener(evt, () => {
    // Wait a beat for the new DOM to actually be present.
    setTimeout(onPageReshape, 100);
  });
});

const mo = new MutationObserver(() => {
  if (overlayState) onPageReshape();
});
mo.observe(document.documentElement, { childList: true, subtree: true });

// ─── messaging ────────────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      switch (msg.type) {
        case "ENUMERATE_ELEMENTS": {
          const elements = buildElementList();
          sendResponse({ ok: true, elements, url: location.href });
          break;
        }
        case "REPLAY_TRAIL": {
          startReplay(msg.trail || []);
          sendResponse({ ok: true, queued: msg.trail?.length || 0 });
          break;
        }
        case "HIGHLIGHT_INDEX": {
          hideThinking();
          const el = resolveIndex(msg.idx);
          const drawn = renderOverlay(el, msg.instruction, { stepIndex: msg.stepIndex });
          sendResponse({ ok: drawn, found: !!el });
          break;
        }
        case "CLEAR_OVERLAY": {
          hideThinking();
          clearOverlay();
          sendResponse({ ok: true });
          break;
        }
        case "SHOW_THINKING": {
          showThinking(msg.label);
          sendResponse({ ok: true });
          break;
        }
        case "HIDE_THINKING": {
          hideThinking();
          sendResponse({ ok: true });
          break;
        }
        case "SHOW_CONTROL": {
          showControl(msg.task);
          sendResponse({ ok: true });
          break;
        }
        case "HIDE_CONTROL": {
          hideControl();
          sendResponse({ ok: true });
          break;
        }
        default:
          sendResponse({ ok: false, error: `unknown type: ${msg.type}` });
      }
    } catch (e) {
      console.error("[evernav/content]", e);
      sendResponse({ ok: false, error: String(e.message || e) });
    }
  })();
  return true;
});

// ─── demo-day hot-key safety net ──────────────────────────────────────────────
//
// Esoteric combinations to avoid clashes with github.com's own keybindings.
// Triggered off-screen by a co-driver when a demo beat fails.

const HOTKEYS = {
  Digit1: { type: "DEMO_FORCE_BEAT_1" },
  Digit2: { type: "DEMO_FORCE_BEAT_2" },
  KeyD:   { type: "DEMO_OPEN_DASHBOARD" },
  KeyR:   { type: "DEMO_REPRIME_CACHE" },
  KeyL:   { type: "DEMO_TOGGLE_BIG_BADGE" },
};

window.addEventListener(
  "keydown",
  (e) => {
    if (!e.shiftKey || !(e.metaKey || e.ctrlKey) || e.altKey) return;
    const action = HOTKEYS[e.code];
    if (!action) return;
    e.preventDefault();
    e.stopPropagation();
    if (action.type === "DEMO_TOGGLE_BIG_BADGE") {
      toggleBigBadge();
    } else {
      chrome.runtime.sendMessage(action);
    }
  },
  true
);

// Big user-id badge: makes the user-switch unmistakable on the projected screen.
let bigBadgeEl = null;
function toggleBigBadge() {
  if (bigBadgeEl) {
    bigBadgeEl.remove();
    bigBadgeEl = null;
    return;
  }
  chrome.storage.session.get("activeUser").then(({ activeUser }) => {
    bigBadgeEl = document.createElement("div");
    bigBadgeEl.id = "__evernav_big_badge__";
    Object.assign(bigBadgeEl.style, {
      position: "fixed",
      top: "24px",
      right: "24px",
      zIndex: "2147483647",
      padding: "14px 24px",
      background: "#0A0B0A",
      color: "#C5FF00",
      font: "600 28px/1 'JetBrains Mono', ui-monospace, monospace",
      letterSpacing: "0.5px",
      textTransform: "uppercase",
      border: "1px solid #252824",
      borderLeft: "3px solid #C5FF00",
      borderRadius: "4px",
      boxShadow: "0 20px 60px rgba(0, 0, 0, 0.55), 0 0 32px rgba(197, 255, 0, 0.25)",
      pointerEvents: "none",
    });
    bigBadgeEl.textContent = activeUser || "demo_user_1";
    document.documentElement.appendChild(bigBadgeEl);
  });
}

console.log("[evernav/content] loaded on", location.href);
