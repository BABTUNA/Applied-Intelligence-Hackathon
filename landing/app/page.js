"use client";

import { useState } from "react";

const DEMO_URL = "https://x.com/_BabTuna_/status/2061231929618518470";

function XIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

export default function Home() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("idle"); // idle | loading | done | error
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    const value = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setStatus("error");
      setError("Enter a valid email address.");
      return;
    }

    setStatus("loading");
    try {
      const resp = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: value }),
      });
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        throw new Error(data.error || `Request failed (${resp.status})`);
      }
      setStatus("done");
    } catch (err) {
      setStatus("error");
      setError(err.message || "Something went wrong. Try again.");
    }
  }

  return (
    <main className="wrap">
      <div className="ambient-bg" aria-hidden="true" />
      <div className="scanlines" aria-hidden="true" />

      <header className="topbar">
        <div className="brand">
          <span className="brand-bracket">[</span>
          evernav
          <span className="caret" />
          <span className="brand-bracket">]</span>
        </div>
        <a
          className="demo-link"
          href={DEMO_URL}
          target="_blank"
          rel="noopener noreferrer"
        >
          <XIcon />
          Watch the demo
        </a>
      </header>

      <section className="hero">
        <div>
          <span className="tag">
            <span className="tag-dot" />
            Early access
          </span>
          <h1>
            The web is <span className="strike-accent">hostile</span>. EverNav
            shows you <em>exactly</em> where to click.
          </h1>
          <p className="lede">
            A Chrome extension that watches the active tab and walks you through
            complex flows &mdash; rotating a token, configuring a webhook,
            changing a buried setting &mdash; one glowing step at a time. Just
            type what you want to do and hit <code>Guide me</code>.
          </p>
          <ul className="feature-list">
            <li>
              <span className="mark" aria-hidden="true" />
              Type a goal in plain English, get a guided click-by-click path.
            </li>
            <li>
              <span className="mark" aria-hidden="true" />
              The page blurs and the next element to click glows lime.
            </li>
            <li>
              <span className="mark" aria-hidden="true" />
              Works on the gnarliest dashboards &mdash; no tutorials required.
            </li>
          </ul>
        </div>

        <div className="signup">
          {status === "done" ? (
            <div className="success">
              <div className="success-badge" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              </div>
              <h2>You&rsquo;re on the list.</h2>
              <p>
                We&rsquo;ll email <strong>{email.trim()}</strong> the moment
                EverNav opens up. In the meantime, see it in action:
              </p>
              <a
                className="demo-link"
                href={DEMO_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                <XIcon />
                Watch the demo on X
              </a>
            </div>
          ) : (
            <form onSubmit={handleSubmit} noValidate>
              <div className="signup-head">// join the waitlist</div>
              <h2 className="signup-title">Get early access</h2>
              <p className="signup-sub">
                Drop your email and we&rsquo;ll send your invite when EverNav
                launches.
              </p>

              <div className="field">
                <label htmlFor="email">Email</label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (status === "error") {
                      setStatus("idle");
                      setError("");
                    }
                  }}
                  disabled={status === "loading"}
                  required
                />
              </div>

              <button className="submit" type="submit" disabled={status === "loading"}>
                {status === "loading" ? "Signing up…" : "Sign up"}
                {status !== "loading" && <span className="submit-arrow">→</span>}
              </button>

              {status === "error" && (
                <div className="form-msg err" role="alert">
                  {error}
                </div>
              )}

              <p className="form-note">No spam. One email when we launch.</p>
            </form>
          )}
        </div>
      </section>

      <footer>
        <span>EverNav · navigate the web · 2026</span>
        <a href={DEMO_URL} target="_blank" rel="noopener noreferrer">
          @_BabTuna_ →
        </a>
      </footer>
    </main>
  );
}
