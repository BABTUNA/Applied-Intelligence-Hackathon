# Fixtures

Pre-recorded click trails used as demo-day fallbacks when:
- the live vision call hangs or fails
- the Evermind cache misses on the cross-user beat

Loaded into the extension via `scripts/prime-evermind.js`, which also pushes
the same trail into Evermind so the live cache-hit path works the same way.

## Re-recording

The shipped `rotate-pat-trail.json` is a **best guess** based on GitHub's
documented settings UI. Re-record after a successful live run so the
fallback signatures match the actual rendered DOM:

1. Open `github.com/settings`.
2. Open the extension service worker's DevTools console.
3. Run the demo flow live (vision-driven) end to end.
4. The trail built by `background.js` is logged on success — copy it.
5. Paste into `fixtures/<task-slug>-trail.json`, run the prime script again.
