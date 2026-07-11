"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@insforge/sdk";

const INSFORGE_URL = (process.env.NEXT_PUBLIC_INSFORGE_URL || "").replace(/\/+$/, "");
const INSFORGE_ANON = process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY || "";

const REPO_URL = "https://github.com/BABTUNA/Applied-Intelligence-Hackathon";

const STACK = [
  { key: "database",    label: "database",    note: "postgres + rls" },
  { key: "realtime",    label: "realtime",    note: "websocket fan-out" },
  { key: "functions",   label: "functions",   note: "edge / deno" },
  { key: "ai",          label: "ai gateway",  note: "openrouter" },
  { key: "rls",         label: "rls",         note: "anon policies" },
  { key: "hosting",     label: "hosting",     note: "this dashboard" },
];

const CATEGORY_TINT = {
  security:      { fg: "#FF8B6B", bg: "rgba(255,139,107,0.08)", border: "rgba(255,139,107,0.45)" },
  navigation:    { fg: "#C5FF00", bg: "rgba(197,255,0,0.10)",   border: "rgba(197,255,0,0.5)"   },
  configuration: { fg: "#8BC9FF", bg: "rgba(139,201,255,0.08)", border: "rgba(139,201,255,0.45)" },
  other:         { fg: "#BFC0BC", bg: "rgba(191,192,188,0.06)", border: "rgba(191,192,188,0.3)"  },
};

async function fetchSessions() {
  if (!INSFORGE_URL || !INSFORGE_ANON) return null;
  const url = `${INSFORGE_URL}/api/database/records/sessions?order=completed_at.desc&limit=20`;
  const resp = await fetch(url, {
    headers: { apikey: INSFORGE_ANON, Authorization: `Bearer ${INSFORGE_ANON}` },
  });
  if (!resp.ok) throw new Error(`insforge ${resp.status}`);
  const data = await resp.json();
  if (Array.isArray(data)) return data;
  return data?.rows || data?.data || [];
}

const OUTCOME_TINT = {
  completed: { fg: "#4ADE80", bg: "rgba(74,222,128,0.10)", border: "rgba(74,222,128,0.45)", label: "ok" },
  stopped:   { fg: "#FBBF24", bg: "rgba(251,191,36,0.10)", border: "rgba(251,191,36,0.45)", label: "stopped" },
  error:     { fg: "#F87171", bg: "rgba(248,113,113,0.10)", border: "rgba(248,113,113,0.45)", label: "error" },
  max_steps: { fg: "#F87171", bg: "rgba(248,113,113,0.10)", border: "rgba(248,113,113,0.45)", label: "max steps" },
  unknown:   { fg: "#9CA3AF", bg: "rgba(156,163,175,0.06)", border: "rgba(156,163,175,0.3)", label: "unknown" },
};

function deriveCounts(rows) {
  const users = new Set();
  const skills = new Set();
  let completedCount = 0;
  let knownCount = 0;
  for (const r of rows) {
    if (r.user_id) users.add(r.user_id);
    if (r.site && r.task) skills.add(`${r.site}::${r.task}`);
    const o = (r.outcome || "").toLowerCase();
    if (o && o !== "unknown") {
      knownCount++;
      if (o === "completed") completedCount++;
    }
  }
  const successRate = knownCount > 0 ? Math.round((completedCount / knownCount) * 100) : null;
  return { sessions: rows.length, users: users.size, skills: skills.size, successRate };
}

function formatRelative(iso) {
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(iso).toLocaleDateString();
}

export default function Home() {
  const [counts, setCounts] = useState({ sessions: 0, users: 0, skills: 0, successRate: null });
  const [recent, setRecent] = useState([]);
  const [state, setState] = useState("loading");
  const [pulse, setPulse] = useState(0);
  const [stackPulse, setStackPulse] = useState(0);
  const clientRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await fetchSessions();
        if (cancelled) return;
        if (rows === null) { setState("unconfigured"); return; }
        setCounts(deriveCounts(rows));
        setRecent(rows.slice(0, 6));
        setState("live");
      } catch (e) {
        if (cancelled) return;
        console.error(e);
        setState("error");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!INSFORGE_URL || !INSFORGE_ANON) return;
    let cancelled = false;
    const client = createClient({ baseUrl: INSFORGE_URL, anonKey: INSFORGE_ANON });
    clientRef.current = client;
    (async () => {
      try {
        await client.realtime.connect();
        const resp = await client.realtime.subscribe("sessions");
        if (!resp?.ok) { console.warn("[evernav] realtime subscribe failed:", resp?.error); return; }
        client.realtime.on("session_logged", async () => {
          if (cancelled) return;
          setPulse((p) => p + 1);
          setStackPulse((p) => p + 1);
          try {
            const rows = await fetchSessions();
            if (!cancelled && rows) {
              setCounts(deriveCounts(rows));
              setRecent(rows.slice(0, 6));
            }
          } catch (e) { console.warn("[evernav] re-fetch failed:", e); }
        });
        client.realtime.on("error", ({ channel, code, message }) => {
          console.warn("[evernav] realtime error:", channel, code, message);
        });
      } catch (e) { console.warn("[evernav] realtime connect failed:", e); }
    })();
    return () => { cancelled = true; try { client.realtime.disconnect(); } catch {} };
  }, []);

  // Tick once a minute so "Xs ago" labels stay fresh.
  useEffect(() => {
    const id = setInterval(() => setRecent((r) => [...r]), 30000);
    return () => clearInterval(id);
  }, []);

  const display = (n) => (state === "loading" ? "…" : state === "unconfigured" ? "—" : n);
  const flashClass = pulse > 0 ? "card flash" : "card";

  return (
    <main className="wrap">
      <div className="ambient-bg" aria-hidden="true" />
      <div className="scanlines" aria-hidden="true" />

      <div className="topbar">
        <div className="brand">
          <span className="brand-bracket">[</span>
          evernav
          <span className="caret" />
          <span className="brand-bracket">]</span>
        </div>
        <nav className="nav-links">
          <a href={REPO_URL} target="_blank" rel="noopener noreferrer">skills</a>
          <a href={REPO_URL} target="_blank" rel="noopener noreferrer">sessions</a>
          <a href={REPO_URL} target="_blank" rel="noopener noreferrer">docs</a>
        </nav>
        <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="cta">
          Get the extension <span className="cta-arrow">→</span>
        </a>
      </div>

      <section className="hero">
        <span className="tag">
          <span className="tag-dot" />
          Live agent navigation
        </span>
        <div className="meta">
          <span>v0.1.0</span>
          <span className="sep">/</span>
          <span>May 31, 2026</span>
          <span className="sep">/</span>
          <span>Chrome MV3</span>
          <span className="sep">/</span>
          <span>frontier tower</span>
        </div>
        <h1>
          Web UIs are <span className="strike-accent">hostile</span>. EverNav shows you
          <em> exactly </em> where to click.
        </h1>
        <p>
          A Chrome extension that watches the active tab and walks you through complex flows
          like rotating a token, configuring a webhook, or changing a setting, one glowing
          step at a time. Every completed task is logged to <code>insforge</code> in real
          time so the next agent picks up where this one left off.
        </p>
      </section>

      {/* Live request flow — packet animates on every realtime event */}
      <div className="section-head">
        <h2>Request flow</h2>
        <span className="stamp">live · per session</span>
      </div>
      <section className="pipeline-wrap">
        <div className={`pipeline ${stackPulse > 0 ? "firing" : ""}`} key={`pipe-${stackPulse}`}>
          <div className="pipeline-track" />
          <div className="pipeline-packet" />
          {[
            { key: "ext", label: "extension",  note: "chrome MV3" },
            { key: "fn",  label: "function",   note: "log-session" },
            { key: "ai",  label: "ai gateway", note: "claude haiku" },
            { key: "db",  label: "database",   note: "sessions ↑" },
            { key: "rt",  label: "realtime",   note: "ws fan-out" },
            { key: "ui",  label: "dashboard",  note: "this page" },
          ].map((n, i) => (
            <div className="pipeline-node" key={n.key} style={{ ["--i"]: i }}>
              <span className="pipeline-node-square" />
              <span className="pipeline-node-label">{n.label}</span>
              <span className="pipeline-node-note">{n.note}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Powered by InsForge — six feature pills */}
      <div className="section-head">
        <h2>Powered by InsForge</h2>
        <span className="stamp">platform · 6 surfaces</span>
      </div>
      <section className={`stack-row ${stackPulse > 0 ? "active" : ""}`} key={`stack-${stackPulse}`}>
        {STACK.map((s) => (
          <div className="stack-pill" key={s.key}>
            <span className="stack-mark" />
            <span className="stack-label">{s.label}</span>
            <span className="stack-note">{s.note}</span>
          </div>
        ))}
      </section>

      <div className="section-head">
        <h2>Live telemetry</h2>
        <span className="stamp">insforge · sessions · realtime</span>
      </div>

      <section className="grid">
        <div key={`s-${pulse}`} className={flashClass}>
          <span className="label">Skills learned</span>
          <span className="num">{display(counts.skills)}</span>
        </div>
        <div key={`u-${pulse}`} className={flashClass}>
          <span className="label">Users helped</span>
          <span className="num">{display(counts.users)}</span>
        </div>
        <div key={`n-${pulse}`} className={flashClass}>
          <span className="label">Sessions logged</span>
          <span className="num">{display(counts.sessions)}</span>
        </div>
        <div key={`sr-${pulse}`} className={flashClass}>
          <span className="label">Success rate</span>
          <span className="num">{display(counts.successRate !== null ? `${counts.successRate}%` : "—")}</span>
        </div>
      </section>

      {/* Recent sessions ticker */}
      <div className="section-head" style={{ marginTop: 32 }}>
        <h2>Recent activity</h2>
        <span className="stamp">last {Math.min(recent.length, 6)} sessions</span>
      </div>
      <section className="ticker">
        {recent.length === 0 && state === "live" && (
          <div className="ticker-empty">No sessions yet — run the extension to populate.</div>
        )}
        {recent.slice(0, 6).map((r, i) => {
          const cat = (r.category || "other").toLowerCase();
          const tint = CATEGORY_TINT[cat] || CATEGORY_TINT.other;
          const outcome = (r.outcome || "unknown").toLowerCase();
          const oTint = OUTCOME_TINT[outcome] || OUTCOME_TINT.unknown;
          const isFresh = i === 0 && pulse > 0;
          return (
            <div className={`ticker-row${isFresh ? " fresh" : ""}`} key={r.id || i}>
              <span className="ticker-user">{r.user_id}</span>
              <span className="ticker-sep">·</span>
              <span className="ticker-site">{r.site}</span>
              <span className="ticker-sep">·</span>
              <span className="ticker-task">{r.task}</span>
              <span
                className="ticker-cat"
                style={{ color: tint.fg, background: tint.bg, borderColor: tint.border }}
              >
                {cat}
              </span>
              <span
                className="ticker-outcome"
                style={{ color: oTint.fg, background: oTint.bg, borderColor: oTint.border }}
              >
                {oTint.label}
              </span>
              <span className="ticker-steps">{r.step_count}↻</span>
              <span className="ticker-time">{r.completed_at ? formatRelative(r.completed_at) : ""}</span>
            </div>
          );
        })}
      </section>

      <footer>
        <span>EverNav · Applied Intelligence Hackathon · 2026</span>
        {state === "live" && (
          <span className="status-pill"><span className="pulse" />Live · InsForge realtime</span>
        )}
        {state === "loading" && <span className="status-pill">Loading…</span>}
        {state === "unconfigured" && (
          <span className="status-pill">Set NEXT_PUBLIC_INSFORGE_URL + ANON_KEY</span>
        )}
        {state === "error" && <span className="status-pill">InsForge unreachable</span>}
      </footer>
    </main>
  );
}
