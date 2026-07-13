export const runtime = "edge";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const email = (body?.email || "").toString().trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return Response.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  // Optional: forward the signup to a webhook (Zapier, Discord, a Google Sheet,
  // your own endpoint, etc). Set SIGNUP_WEBHOOK_URL in the Vercel project env.
  // Without it, the signup is simply accepted (handy for a first deploy).
  const webhook = process.env.SIGNUP_WEBHOOK_URL;
  if (webhook) {
    try {
      const resp = await fetch(webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          source: "evernav-landing",
          ts: new Date().toISOString(),
        }),
      });
      if (!resp.ok) {
        return Response.json(
          { error: "Could not record signup. Please try again." },
          { status: 502 }
        );
      }
    } catch {
      return Response.json(
        { error: "Could not record signup. Please try again." },
        { status: 502 }
      );
    }
  } else {
    console.log(`[evernav] signup: ${email}`);
  }

  return Response.json({ ok: true });
}
