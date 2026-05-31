# Demo-Day Checklist

Run through this in the 15 minutes before going on stage. Print it and tick
off as you go — eyes on the room, not on a screen full of tabs.

## Network

- [ ] Phone hotspot ON, laptop joined to the hotspot
- [ ] Conference WiFi (`ihealth guest`) **forgotten** (System Settings → Wi-Fi → Forget)
- [ ] Test: open `chat.openai.com` or any large page — loads in under 3s

## Keys + spend caps

- [ ] Anthropic spend cap set to ≤ $5 in the console (`console.anthropic.com/settings/limits`)
- [ ] Butterbase key still valid (load the dashboard URL, see live counts)
- [ ] Evermind key in the extension options page

## Cache priming

```bash
EVERMIND_KEY=... node scripts/prime-evermind.js fixtures/rotate-pat-trail.json
```

- [ ] Script printed `✓ Wrote skill...` and `✓ Verified — N hit(s)`
- [ ] Pasted the `chrome.storage.local.set(...)` snippet into the SW console
- [ ] Optional dry-run: open extension, type the demo task under `demo_user_2`, see cache hit

## Browser state

- [ ] `chrome://extensions` — EverNav enabled, pinned to toolbar, host permissions granted
- [ ] Logged into github.com, on `/settings/tokens`
- [ ] All banners dismissed (verify email, security alerts, etc.)
- [ ] Dashboard tab pre-loaded in a second tab — session count > 0
- [ ] DevTools open on SW (detached window, presenter-side only)

## Laptop

- [ ] Battery > 50% or plugged in
- [ ] Do Not Disturb ON
- [ ] Slack/email closed
- [ ] Screen mirroring resolution matches the venue projector
- [ ] Glow rendering test: hit Cmd+Shift+1, confirm halo visible at projector res

## Sanity

- [ ] Popup open, user badge says `demo_user_1`
- [ ] One full silent dry-run of all 3 beats
- [ ] Co-driver knows the 5 hot-keys (Cmd+Shift+1/2/D/R/L)

---

## If a beat fails — co-driver hot-keys

| Combo | When to use |
|---|---|
| `Cmd+Shift+1` | Beat 1 stalls — force-play fallback under `demo_user_1` |
| `Cmd+Shift+2` | Beat 2 cache misses — force-play same trail under `demo_user_2` |
| `Cmd+Shift+D` | Beat 3 — dashboard tab is closed/lost |
| `Cmd+Shift+R` | Re-prime Evermind mid-demo (presenter narrates "let me retry") |
| `Cmd+Shift+L` | Enlarge user-id badge so judges see the switch |

The presenter should NOT touch the keyboard during a beat — the co-driver
watches and triggers off-screen if needed.
