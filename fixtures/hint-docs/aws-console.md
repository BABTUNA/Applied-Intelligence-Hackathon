SITE: console.aws.amazon.com — known navigation traps.

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
