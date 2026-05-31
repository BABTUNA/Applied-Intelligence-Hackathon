"use client";

import { useEffect, useState } from "react";

const BB_BASE = process.env.NEXT_PUBLIC_BUTTERBASE_BASE || "https://api.butterbase.ai/v1";
const BB_APP = process.env.NEXT_PUBLIC_BB_APP_ID || "";
const BB_KEY = process.env.NEXT_PUBLIC_BB_READ_KEY || "";

async function fetchSessions() {
  if (!BB_APP || !BB_KEY) return null;
  const url = `${BB_BASE}/${encodeURIComponent(BB_APP)}/sessions?order=completed_at.desc&limit=100`;
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${BB_KEY}` } });
  if (!resp.ok) throw new Error(`butterbase ${resp.status}`);
  const data = await resp.json();
  if (Array.isArray(data)) return data;
  return data?.rows || data?.data || [];
}

function deriveCounts(rows) {
  const users = new Set();
  const skills = new Set();
  for (const r of rows) {
    if (r.user_id) users.add(r.user_id);
    if (r.site && r.task) skills.add(`${r.site}::${r.task}`);
  }
  return { sessions: rows.length, users: users.size, skills: skills.size };
}

export default function Home() {
  const [counts, setCounts] = useState({ sessions: 0, users: 0, skills: 0 });
  const [state, setState] = useState("loading");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await fetchSessions();
        if (cancelled) return;
        if (rows === null) {
          setState("unconfigured");
          return;
        }
        setCounts(deriveCounts(rows));
        setState("live");
      } catch (e) {
        if (cancelled) return;
        console.error(e);
        setState("error");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const display = (n) => (state === "loading" ? "…" : state === "unconfigured" ? "—" : n);

  return (
    <main className="wrap">
      <div className="topbar">
        <div className="brand">
          evernav<span className="caret" />
        </div>
        <nav className="nav-links">
          <a href="#">skills</a>
          <a href="#">sessions</a>
          <a href="#">docs</a>
        </nav>
        <button className="cta">Get the extension</button>
      </div>

      <section className="hero">
        <span className="tag">Live agent navigation</span>
        <div className="meta">
          <span>v0.1.0</span>
          <span className="sep">/</span>
          <span>May 30, 2026</span>
          <span className="sep">/</span>
          <span>Chrome MV3</span>
        </div>
        <h1>Web UIs are hostile. EverNav shows you exactly where to click.</h1>
        <p>
          A Chrome extension that watches the active tab and walks you through complex flows —
          rotate a token, configure a webhook, change a setting — one glowing step at a time.
          Every completed task is written to <code>evermind</code> as a shared skill the next
          agent can replay.
        </p>
      </section>

      <div className="section-head">
        <h2>Live telemetry</h2>
        <span className="stamp">butterbase · sessions</span>
      </div>

      <section className="grid">
        <div className="card">
          <span className="label">Skills learned</span>
          <span className="num">{display(counts.skills)}</span>
        </div>
        <div className="card">
          <span className="label">Users helped</span>
          <span className="num">{display(counts.users)}</span>
        </div>
        <div className="card">
          <span className="label">Sessions logged</span>
          <span className="num">{display(counts.sessions)}</span>
        </div>
      </section>

      <footer>
        <span>EverNav · Beta Fund × Evermind · 2026</span>
        {state === "live" && (
          <span className="status-pill"><span className="pulse" />Live · Butterbase</span>
        )}
        {state === "loading" && (
          <span className="status-pill">Loading…</span>
        )}
        {state === "unconfigured" && (
          <span className="status-pill">Set NEXT_PUBLIC_BB_APP_ID + READ_KEY</span>
        )}
        {state === "error" && (
          <span className="status-pill">Butterbase unreachable</span>
        )}
      </footer>
    </main>
  );
}
