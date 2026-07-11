// log-session: agent-callable session ingestion endpoint.
//
// Flow (touching FOUR InsForge surfaces in one request):
//   1. Extension POSTs { user_id, site, task, step_count } to this function.
//   2. Function calls the InsForge AI Gateway (OpenRouter) to classify the
//      task into one of: security / navigation / configuration / other.
//   3. Function inserts the row (including the AI-derived category) into
//      the `sessions` table via the InsForge DB SDK.
//   4. The Postgres trigger we set up earlier publishes a realtime event
//      so the dashboard counters tick up immediately.
//
// One agent → four surfaces (functions + AI gateway + database + realtime).

import { createClient } from "npm:@insforge/sdk";
import OpenAI from "npm:openai";

const ALLOWED_ORIGINS = [
  /^chrome-extension:\/\//,
  /^https?:\/\/localhost(:\d+)?$/,
  /^https:\/\/.*\.insforge\.site$/,
  /^https:\/\/.*\.insforge\.app$/,
];

const DEFAULT_ORIGIN = "https://uqi28a23.insforge.site";

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") || "";
  const allowed = ALLOWED_ORIGINS.some((re) => re.test(origin));
  return {
    "Access-Control-Allow-Origin": allowed ? origin : DEFAULT_ORIGIN,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
  };
}

// ─── rate limiting ───────────────────────────────────────────────────────────
const RATE_LIMIT = 10; // requests per minute
const RATE_WINDOW = 60_000;
const RATE_MAX_IPS = 500;

const _rateBuckets: Map<string, number[]> = new Map();

function checkRateLimit(req: Request): boolean {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || req.headers.get("cf-connecting-ip")
    || "unknown";
  const now = Date.now();
  let timestamps = _rateBuckets.get(ip) || [];
  timestamps = timestamps.filter((t) => now - t < RATE_WINDOW);
  if (timestamps.length >= RATE_LIMIT) {
    _rateBuckets.set(ip, timestamps);
    return false;
  }
  timestamps.push(now);
  _rateBuckets.set(ip, timestamps);
  if (_rateBuckets.size > RATE_MAX_IPS) {
    const oldest = _rateBuckets.keys().next().value;
    if (oldest) _rateBuckets.delete(oldest);
  }
  return true;
}

const VALID_CATEGORIES = ["security", "navigation", "configuration", "other"];

async function classifyTask(task: string, site: string): Promise<string> {
  const apiKey = Deno.env.get("OPENROUTER_API_KEY");
  if (!apiKey) {
    console.warn("[log-session] no OPENROUTER_API_KEY, defaulting to 'other'");
    return "other";
  }
  try {
    const client = new OpenAI({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey,
      defaultHeaders: {
        "HTTP-Referer": "https://uqi28a23.insforge.site",
        "X-Title": "EverNav",
      },
    });
    const completion = await client.chat.completions.create({
      model: "anthropic/claude-haiku-4.5",
      max_tokens: 8,
      messages: [
        {
          role: "system",
          content:
            "Classify the user's web navigation task into exactly one word: " +
            "security, navigation, configuration, or other. " +
            "security = anything about tokens, passwords, keys, 2FA, auth. " +
            "navigation = finding pages, orders, returns, history. " +
            "configuration = changing settings, preferences, integrations. " +
            "other = everything else. " +
            "Respond with only the single word, lowercase, no punctuation.",
        },
        { role: "user", content: `Site: ${site}\nTask: ${task}` },
      ],
    });
    const raw = completion.choices?.[0]?.message?.content?.trim().toLowerCase() || "";
    const cleaned = raw.replace(/[^a-z]/g, "");
    return VALID_CATEGORIES.includes(cleaned) ? cleaned : "other";
  } catch (e) {
    console.warn("[log-session] classify error:", (e as Error).message);
    return "other";
  }
}

export default async function (req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  }

  if (!checkRateLimit(req)) {
    return new Response(JSON.stringify({ error: "rate limit exceeded" }), {
      status: 429,
      headers: { ...corsHeaders(req), "Content-Type": "application/json", "Retry-After": "60" },
    });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid json body" }), {
      status: 400,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  }

  const { user_id, site, task, step_count, step_summary, outcome, outcome_reason } = body || {};
  if (!user_id || !site || !task) {
    return new Response(
      JSON.stringify({ error: "missing required field: user_id, site, task" }),
      { status: 400, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
    );
  }

  // Input validation and sanitization
  const sTask = String(task).replace(/<[^>]*>/g, "").trim();
  const sUserId = String(user_id).trim();
  const sSite = String(site).trim();
  if (!sTask || sTask.length > 500) {
    return new Response(
      JSON.stringify({ error: "task must be 1-500 characters" }),
      { status: 400, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
    );
  }
  if (!sUserId || sUserId.length > 100) {
    return new Response(
      JSON.stringify({ error: "user_id must be 1-100 characters" }),
      { status: 400, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
    );
  }
  if (!sSite || sSite.length > 200) {
    return new Response(
      JSON.stringify({ error: "site must be 1-200 characters" }),
      { status: 400, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
    );
  }

  // Classify in parallel with nothing else — just await and proceed.
  const category = await classifyTask(sTask, sSite);

  const client = createClient({
    baseUrl: Deno.env.get("INSFORGE_BASE_URL"),
    anonKey: Deno.env.get("ANON_KEY"),
  });

  // Validate and cap step summary
  const validSummary = Array.isArray(step_summary) ? step_summary.slice(0, 15) : null;

  const row: Record<string, any> = {
    user_id: sUserId,
    site: sSite,
    task: sTask,
    step_count: Number(step_count) || 0,
    category,
    completed_at: new Date().toISOString(),
  };
  if (validSummary) {
    row.step_summary = JSON.stringify(validSummary);
  }

  // Outcome tracking
  const VALID_OUTCOMES = ["completed", "stopped", "error", "max_steps", "unknown"];
  const sOutcome = typeof outcome === "string" && VALID_OUTCOMES.includes(outcome) ? outcome : "unknown";
  row.outcome = sOutcome;
  if (typeof outcome_reason === "string" && outcome_reason.length > 0) {
    row.outcome_reason = outcome_reason.slice(0, 500);
  }

  const { data, error } = await client.database.from("sessions").insert([row]);

  if (error) {
    console.error("[log-session] insert error:", error);
    return new Response(JSON.stringify({ error: error.message || "insert failed" }), {
      status: 500,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  }

  return new Response(
    JSON.stringify({ ok: true, category, session: Array.isArray(data) ? data[0] : data }),
    { status: 200, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
  );
}
