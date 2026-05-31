"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@insforge/sdk";

const INSFORGE_URL = (process.env.NEXT_PUBLIC_INSFORGE_URL || "").replace(/\/+$/, "");
const INSFORGE_ANON = process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY || "";

async function fetchSessions() {
  if (!INSFORGE_URL || !INSFORGE_ANON) return null;
  const url = `${INSFORGE_URL}/api/database/records/sessions?order=completed_at.desc&limit=100`;
  const resp = await fetch(url, {
    headers: {
      apikey: INSFORGE_ANON,
      Authorization: `Bearer ${INSFORGE_ANON}`,
    },
  });
  if (!resp.ok) throw new Error(`insforge ${resp.status}`);
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
  const [pulse, setPulse] = useState(0); // bumps each time realtime fires — drives the card flash animation
  const clientRef = useRef(null);

  // Initial fetch
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

  // Realtime — subscribe to the `sessions` channel and re-fetch on every insert.
  useEffect(() => {
    if (!INSFORGE_URL || !INSFORGE_ANON) return;
    let cancelled = false;

    const client = createClient({ baseUrl: INSFORGE_URL, anonKey: INSFORGE_ANON });
    clientRef.current = client;

    (async () => {
      try {
        await client.realtime.connect();
        const resp = await client.realtime.subscribe("sessions");
        if (!resp?.ok) {
          console.warn("[evernav] realtime subscribe failed:", resp?.error);
          return;
        }
        client.realtime.on("session_logged", async (payload) => {
          if (cancelled) return;
          console.log("[evernav] new session via realtime:", payload);
          setPulse((p) => p + 1);
          // Re-fetch counts to stay accurate (cheap, one HTTP call)
          try {
            const rows = await fetchSessions();
            if (!cancelled && rows) setCounts(deriveCounts(rows));
          } catch (e) {
            console.warn("[evernav] re-fetch failed:", e);
          }
        });
        client.realtime.on("error", ({ channel, code, message }) => {
          console.warn("[evernav] realtime error:", channel, code, message);
        });
      } catch (e) {
        console.warn("[evernav] realtime connect failed:", e);
      }
    })();

    return () => {
      cancelled = true;
      try { client.realtime.disconnect(); } catch {}
    };
  }, []);

  const display = (n) => (state === "loading" ? "…" : state === "unconfigured" ? "—" : n);
  const flashClass = pulse > 0 ? "card flash" : "card";

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
          <span>May 31, 2026</span>
          <span className="sep">/</span>
          <span>Chrome MV3</span>
        </div>
        <h1>Web UIs are hostile. EverNav shows you exactly where to click.</h1>
        <p>
          A Chrome extension that watches the active tab and walks you through complex flows —
          rotate a token, configure a webhook, change a setting — one glowing step at a time.
          Every completed task is logged to <code>insforge</code> in real time so the next
          agent picks up where this one left off.
        </p>
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
      </section>

      <footer>
        <span>EverNav · Applied Intelligence Hackathon · 2026</span>
        {state === "live" && (
          <span className="status-pill"><span className="pulse" />Live · InsForge realtime</span>
        )}
        {state === "loading" && (
          <span className="status-pill">Loading…</span>
        )}
        {state === "unconfigured" && (
          <span className="status-pill">Set NEXT_PUBLIC_INSFORGE_URL + ANON_KEY</span>
        )}
        {state === "error" && (
          <span className="status-pill">InsForge unreachable</span>
        )}
      </footer>
    </main>
  );
}
