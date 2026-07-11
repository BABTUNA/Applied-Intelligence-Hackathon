// vision-pick: server-side wrapper around the InsForge AI Gateway for the
// EverNav guidance loop. The Chrome extension POSTs a screenshot + the
// in-viewport interactive-element list + the user's task; we relay to
// OpenRouter (anthropic/claude-sonnet-4.6 with vision) and return clean JSON.
//
// Why this exists: keeps the Anthropic API key out of the browser entirely.
// The extension only ever holds the InsForge anon JWT.

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

const VISION_MODEL = "anthropic/claude-sonnet-4.6";

const VISION_SYSTEM_BASE = `You guide users through web UIs.

You will receive a screenshot of the user's current browser tab and a JSON
list of interactive elements visible in the viewport. Each element has an
\`idx\`, \`tag\`, \`text\`, \`aria\`, \`testid\`, \`role\`, \`fid\` (fingerprint), and \`bbox\`.

The \`fid\` field is a stable element fingerprint that survives DOM reshuffles.
It uses one of these formats:
- \`tid:<data-testid>\` — from the element's data-testid attribute
- \`id:<stable-id>\` — from a stable HTML id
- \`fp:<tag>:<aria-or-text-and-role>\` — computed from tag + attributes

Pick the single next element the user should click to make progress on
their stated task. Prefer elements whose \`text\` or \`aria\` matches the
task intent. The screenshot is only the visible viewport — if the task
requires off-screen content, pick an element that will scroll there.

RESPONSE FORMAT — you MUST return ONLY a JSON object, no prose, no markdown:
{"idx": <number>, "fid": "<fingerprint string or null>", "instruction": "<one short imperative sentence>", "done": <boolean>}

If the task already appears complete, OR no element on the page is a
useful next step, return:
{"idx": -1, "fid": null, "instruction": "Task complete.", "done": true}

Never reply in English. Never explain. Always return JSON.`;

interface VisionPick {
  idx: number;
  fid: string | null;
  instruction: string;
  done: boolean;
}

function parseVisionJson(text: string): VisionPick {
  const stripped = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  const match = stripped.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      const parsed: any = JSON.parse(match[0]);
      if (typeof parsed.idx === "number") {
        return {
          idx: parsed.idx,
          fid: typeof parsed.fid === "string" ? parsed.fid : null,
          instruction: typeof parsed.instruction === "string" ? parsed.instruction : "Click this.",
          done: typeof parsed.done === "boolean" ? parsed.done : false,
        };
      }
    } catch { /* fall through to prose recovery */ }
  }

  // Claude returned prose — recover a "done" signal from natural language.
  const lower = text.toLowerCase();
  const doneSignals = [
    "task is complete", "task complete", "appears complete", "already done",
    "no further action", "no more steps", "successfully completed",
    "no actionable", "cannot determine", "unable to identify",
    "this page does not", "this page doesn't",
  ];
  if (doneSignals.some((s) => lower.includes(s))) {
    return { idx: -1, fid: null, done: true, instruction: "Task complete." };
  }

  throw new Error(`vision returned non-JSON: ${text.slice(0, 160)}`);
}

export default async function (req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  }

  const apiKey = Deno.env.get("OPENROUTER_API_KEY");
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "OPENROUTER_API_KEY not configured" }), {
      status: 500,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
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

  const { screenshot_b64, elements, task, site_hints, step_history } = body || {};
  if (!screenshot_b64 || !Array.isArray(elements) || !task) {
    return new Response(
      JSON.stringify({ error: "missing required: screenshot_b64, elements[], task" }),
      { status: 400, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
    );
  }

  // Validate and cap step history
  const history: any[] = Array.isArray(step_history) ? step_history.slice(0, 10) : [];

  const systemPrompt = site_hints
    ? `${VISION_SYSTEM_BASE}\n\n---\n\n${site_hints}`
    : VISION_SYSTEM_BASE;

  try {
    const client = new OpenAI({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey,
      defaultHeaders: {
        "HTTP-Referer": "https://uqi28a23.insforge.site",
        "X-Title": "EverNav",
      },
    });

    // Build messages array — include step history as prior context if available.
    const messages: any[] = [{ role: "system", content: systemPrompt }];

    if (history.length > 0) {
      const stepLines = history.map((s: any, i: number) => {
        const fid = s.fid ? ` [fid: ${s.fid}]` : "";
        const el = s.elementText ? ` on "${s.elementText}"` : "";
        return `Step ${i + 1}: ${s.instruction || "click"}${el}${fid}`;
      });
      messages.push({
        role: "user",
        content: `Previous steps completed for this task:\n${stepLines.join("\n")}\n\nDo NOT repeat any step above. Pick the NEXT action.`,
      });
      messages.push({
        role: "assistant",
        content: `Understood. I will pick the next action that has not been done yet.`,
      });
    }

    messages.push({
      role: "user",
      content: [
        {
          type: "image_url",
          image_url: { url: `data:image/jpeg;base64,${screenshot_b64}` },
        } as any,
        {
          type: "text",
          text: `Task: ${task}\n\nElements (JSON):\n${JSON.stringify(elements)}`,
        },
      ],
    });

    const completion = await client.chat.completions.create({
      model: VISION_MODEL,
      max_tokens: 300,
      messages,
    });

    const text = completion.choices?.[0]?.message?.content || "";
    const pick = parseVisionJson(text);

    return new Response(JSON.stringify(pick), {
      status: 200,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  } catch (e) {
    const err = e as Error;
    console.error("[vision-pick] error:", err.message);
    return new Response(JSON.stringify({ error: err.message || "vision failed" }), {
      status: 500,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  }
}
