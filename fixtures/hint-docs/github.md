SITE: github.com — known navigation traps.

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
→ "Delete this repository".
