SITE: claude.ai — known navigation traps.

============================================================
TASK FAMILY: cancel subscription / downgrade Pro / manage billing
============================================================

claude.ai uses a deliberately quiet cancel-subscription flow (classic
SaaS dark pattern — easy to upgrade, harder to leave). The path:

  Step 1. Click the user-profile menu. On desktop, it's the avatar
          or initials circle in the BOTTOM-LEFT corner of the
          sidebar (NOT the top header). On a collapsed sidebar it
          may sit at the bottom of the rail.
  Step 2. In the menu that opens, click "Settings".
  Step 3. The Settings panel has tabs. Click the "Account" tab
          (sometimes labeled "Profile") OR the "Billing" / "Plans"
          tab if visible.
  Step 4. Scroll to the subscription section. Look for "Manage
          subscription" or "Manage plan" — this opens a separate
          billing portal (often Stripe-powered).
  Step 5. In the billing portal, click "Cancel plan" / "Cancel
          subscription" (usually at the bottom of the page or
          inside the "Current plan" card).
  Step 6. Confirm cancellation in the modal that follows. There
          may be a retention survey or an "Are you sure?" upsell —
          click the cancel/confirm button, not the upsell offer.

============================================================
HARD ANTI-PATTERNS for cancel-subscription tasks:
============================================================

  ✗ "Upgrade" / "Try Pro" / "Get Claude Max" buttons — opposite direction
  ✗ "Refer a friend" / "Invite" links — upsell, not cancel
  ✗ "Help center" / "Support" / "Contact us" — slower path
  ✗ "Privacy", "Appearance", "Models" settings tabs — wrong tab
  ✗ "Sign out" / "Log out" — ends session, doesn't cancel
  ✗ "Delete account" — different action; only pick if user explicitly
    says "delete my account" (cancels the subscription too but also
    nukes all chat history)

============================================================
TASK: "delete my account"
============================================================

  Step 1. Avatar / profile in bottom-left → "Settings".
  Step 2. "Account" tab.
  Step 3. Scroll all the way down — "Delete account" is at the
          very bottom (red text).
  Step 4. Confirmation modal — type the confirmation string and
          click the red Delete button.

============================================================
TASK: "find my chat history" / "export conversations"
============================================================

  Step 1. Avatar / profile → "Settings".
  Step 2. "Account" tab → "Export data" button.
  Step 3. Confirm — Anthropic emails a download link.

============================================================
TASK: "change model" / "switch to Opus / Sonnet / Haiku"
============================================================

  Step 1. Look at the model selector in the chat composer at the
          BOTTOM of the conversation pane. It shows the current
          model (e.g. "Claude Sonnet 4.6").
  Step 2. Click it → pick the target model from the dropdown.

NOT in Settings — model is per-conversation, set from the composer.
