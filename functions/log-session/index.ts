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

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
};

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
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method not allowed" }), {
      status: 405,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid json body" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const { user_id, site, task, step_count } = body || {};
  if (!user_id || !site || !task) {
    return new Response(
      JSON.stringify({ error: "missing required field: user_id, site, task" }),
      { status: 400, headers: { ...cors, "Content-Type": "application/json" } }
    );
  }

  // Classify in parallel with nothing else — just await and proceed.
  const category = await classifyTask(String(task), String(site));

  const client = createClient({
    baseUrl: Deno.env.get("INSFORGE_BASE_URL"),
    anonKey: Deno.env.get("ANON_KEY"),
  });

  const row = {
    user_id: String(user_id),
    site: String(site),
    task: String(task),
    step_count: Number(step_count) || 0,
    category,
    completed_at: new Date().toISOString(),
  };

  const { data, error } = await client.database.from("sessions").insert([row]);

  if (error) {
    console.error("[log-session] insert error:", error);
    return new Response(JSON.stringify({ error: error.message || "insert failed" }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  return new Response(
    JSON.stringify({ ok: true, category, session: Array.isArray(data) ? data[0] : data }),
    { status: 200, headers: { ...cors, "Content-Type": "application/json" } }
  );
}
