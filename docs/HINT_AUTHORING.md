# Authoring Site Hints for EverNav

Site hints are short navigation guides that help the vision model avoid
common pitfalls on known websites. They are the single most effective way
to improve first-attempt accuracy on complex flows.

## Where hints live

| Source | Purpose |
|--------|---------|
| `fixtures/hint-docs/*.md` | Markdown files seeded into Moss (primary) |
| `extension/site-hints.js` | Static fallback (offline-only, deprecated) |

Moss is the **primary** source. The static hints in `site-hints.js` only
fire when the network is down. All new hints should go into
`fixtures/hint-docs/`.

## Creating a new hint file

1. Create a markdown file in `fixtures/hint-docs/` named after the site:

   ```
   fixtures/hint-docs/example.com.md
   ```

2. Use `====` separators and `TASK FAMILY:` headers to group related flows:

   ```markdown
   SITE: example.com — known navigation traps.

   ============================================================
   TASK FAMILY: reset password / change password
   ============================================================

   Step 1. Click "Account" in the top-right header.
   Step 2. Click "Security" in the left sidebar.
   Step 3. Click "Change password".

   ============================================================
   HARD ANTI-PATTERNS
   ============================================================

   ✗ "Help center" — slower path through support articles
   ✗ "Contact us" — opens a ticket, doesn't change password
   ```

3. Run the seed script to push hints into Moss:

   ```bash
   node scripts/seed-moss.js
   ```

## How the seed script works

`scripts/seed-moss.js` reads every file in `fixtures/hint-docs/` and
upserts its content into the Moss vector store. The `FILENAME_TO_SITE`
mapping (lines 36-41 in the seed script) maps filenames to site
hostnames for metadata tagging.

If your filename matches the site hostname (e.g., `github.com.md` →
`github.com`), no mapping entry is needed. Add an entry only when the
filename differs from the hostname.

## Writing effective hints

- **Be specific about element locations**: "top-right header", "bottom
  of the left sidebar", "inside the Danger Zone section".
- **Name exact text**: Use the literal link/button text the model will
  see in the element list.
- **List anti-patterns**: The model often picks semantically similar but
  wrong elements. Explicitly list what NOT to click.
- **One correct path**: Don't offer alternatives. Pick the shortest
  reliable path and describe it step by step.
- **Keep it concise**: Hints are injected into the system prompt. Aim
  for 30-60 lines per task family.
