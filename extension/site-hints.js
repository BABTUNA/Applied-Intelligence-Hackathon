// Static site hints — offline-only fallback for when Moss is unreachable.
// DEPRECATED: Moss semantic retrieval is now the primary hint source.
// These static hints only fire when the network is down. New hints should
// be added to fixtures/hint-docs/ and seeded via scripts/seed-moss.js.

export const SITE_HINTS = {
  "claude.ai": `SITE: claude.ai — known navigation traps.

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

`,
  "console.aws.amazon.com": `SITE: console.aws.amazon.com — known navigation traps.

============================================================
THE UNIVERSAL ESCAPE HATCH
============================================================

The top header has a SEARCH BAR (placeholder is usually "Search" or
"Search [Option+S]" / "Search [Alt+S]"). The search bar is the fastest
path to ANY AWS service. When the user names a service ("EC2", "S3",
"Lambda", "IAM", "CloudWatch", "RDS", "VPC"), STRONGLY PREFER typing
into the search bar over hunting through the "Services" menu or any
sidebar. Step 1 of almost every AWS task is: click the search bar.

To pick the search bar element, look for an input whose aria-label or
placeholder contains "Search". It usually sits inside the top header,
between the AWS logo (left) and the account/region menus (right).

============================================================
TASK: "launch an EC2 instance" / "spin up a VM" / "deploy a server"
============================================================

  1. Click the top search bar.
  2. Type "EC2" — pick the EC2 result in the dropdown (NOT EC2 Image
     Builder, NOT EC2 Global View — just "EC2").
  3. On the EC2 dashboard, click the orange "Launch instance" button.
     It's the most prominent CTA — usually top-right or in the
     "Launch instance" card.
  4. From there: Name → AMI (image) → Instance type → Key pair →
     Network → Storage → "Launch instance" again at the bottom.
     Guide step by step; each section is a clear panel on the page.

============================================================
TASK: "create a Lambda function" / "deploy a function"
============================================================

  1. Click the search bar → type "Lambda" → click "Lambda".
  2. Click "Create function" (orange CTA, top-right).
  3. Pick "Author from scratch" → fill name → choose runtime →
     click "Create function" at the bottom.

============================================================
TASK: "find my bill" / "what am I being charged" / "billing"
============================================================

  1. Click the account-name dropdown in the TOP-RIGHT corner of the
     header (shows your account alias or root email).
  2. Click "Billing and Cost Management" in the dropdown.
  3. Current month's charges are on the landing page.

============================================================
TASK: "switch region" / "change region"
============================================================

  1. The region selector lives in the TOP-RIGHT header, just LEFT of
     the account dropdown. It shows the current region name like
     "N. Virginia" or "Oregon".
  2. Click it → pick the target region from the list.

============================================================
TASK: "create IAM user" / "create access key" / "rotate credentials"
============================================================

  1. Search "IAM" in the search bar → click IAM.
  2. For a new user: left sidebar → "Users" → "Create user" button.
  3. For access keys on an existing user: Users → click the username →
     "Security credentials" tab → "Create access key".

============================================================
HARD ANTI-PATTERNS — do NOT pick these for service-discovery tasks:
============================================================

  ✗ "Services" menu in the header — slower than search. Only use if
    the search bar is somehow not available.
  ✗ "What's New", "Documentation", "Learn more" links — these teach,
    they don't navigate.
  ✗ "Favorites" / pinned services sidebar — only works if the
    service is already pinned. Default state is empty.
  ✗ Onboarding cards / tutorial tiles — never the right path.
  ✗ "Console Home" tile / "Recently visited" — only useful by accident.
  ✗ Any "Free tier" promotional card.

============================================================
REGION GOTCHA
============================================================

Most AWS services are region-scoped. If the user complains "my
instances aren't showing up" or "my bucket disappeared", first check
the region selector in the top-right — they may be looking at the
wrong region. EC2 is regional. S3 buckets are global but the console
view filters by region.

`,
  "amazon.com": `SITE: amazon.com — known navigation traps.

============================================================
TASK FAMILY: view / check / find my returns / refunds / order status
============================================================

THE ONE CORRECT PATH:

  Step 1. Look at the top-right of the Amazon header. There is a
          dedicated link literally labeled "Returns & Orders"
          (sometimes "Returns\n& Orders" on two lines). It sits to
          the right of "Account & Lists" and to the left of the cart.
  Step 2. Click "Returns & Orders". This goes to /gp/your-account/order-history
          (or /orders). The page lists recent orders with return/refund
          status visible per order.
  Step 3. For an in-progress return: each order with an active return
          shows a "View return/refund status" or "Track return"
          button — click that.

If the user isn't logged in, the page redirects to sign-in first.
On the sign-in screen, the next correct step is the Email/phone field.

============================================================
HARD ANTI-PATTERNS — sidebar / header items that LOOK related but are
WRONG for any "view my returns" task:
============================================================

  ✗ "Account & Lists"              — broad account dropdown; not direct
  ✗ "Hello, sign in" / "Hello, <name>" — auth menu, not orders
  ✗ "Today's Deals"                — shopping deals
  ✗ "Customer Service"             — help articles, not order list
  ✗ "Buy Again"                    — re-purchase suggestions, not returns
  ✗ "Your Lists"                   — wishlists
  ✗ "Browsing History"             — products viewed
  ✗ "Gift Cards"                   — gift card mgmt
  ✗ ANY product card or category   — not navigation

The correct link's text must literally contain "Returns & Orders".
If you can't see it, the user is likely on a non-amazon.com Amazon
(e.g. Whole Foods Market) or a deeply nested checkout page — pick
the Amazon logo at top-left to return to the home page first.

============================================================

`,
  "github.com": `SITE: github.com — known navigation traps.

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
→ "Delete this repository".`,
};

export function siteHintsFor(url) {
  try {
    let host = new URL(url).hostname.replace(/^www\./, "");
    if (SITE_HINTS[host]) return SITE_HINTS[host];
    // Parent-domain fallback so smile.amazon.com / m.amazon.com match
    // the amazon.com entry without duplicating it.
    const parts = host.split(".");
    while (parts.length > 2) {
      parts.shift();
      const parent = parts.join(".");
      if (SITE_HINTS[parent]) return SITE_HINTS[parent];
    }
    return "";
  } catch {
    return "";
  }
}
