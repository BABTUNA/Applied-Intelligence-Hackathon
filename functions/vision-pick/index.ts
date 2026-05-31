// vision-pick: server-side wrapper around the InsForge AI Gateway for the
// EverNav guidance loop. The Chrome extension POSTs a screenshot + the
// in-viewport interactive-element list + the user's task; we relay to
// OpenRouter (anthropic/claude-sonnet-4.6 with vision) and return clean JSON.
//
// Why this exists: keeps the Anthropic API key out of the browser entirely.
// The extension only ever holds the InsForge anon JWT.

import OpenAI from "npm:openai";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
};

const VISION_MODEL = "anthropic/claude-sonnet-4.6";

const VISION_SYSTEM_BASE = `You guide users through web UIs.

You will receive a screenshot of the user's current browser tab and a JSON
list of interactive elements visible in the viewport. Each element has an
\`idx\`, \`tag\`, \`text\`, \`aria\`, \`testid\`, \`role\`, and \`bbox\`.

Pick the single next element the user should click to make progress on
their stated task. Prefer elements whose \`text\` or \`aria\` matches the
task intent. The screenshot is only the visible viewport — if the task
requires off-screen content, pick an element that will scroll there.

RESPONSE FORMAT — you MUST return ONLY a JSON object, no prose, no markdown:
{"idx": <number>, "instruction": "<one short imperative sentence>", "done": <boolean>}

If the task already appears complete, OR no element on the page is a
useful next step, return:
{"idx": -1, "instruction": "Task complete.", "done": true}

Never reply in English. Never explain. Always return JSON.`;

interface VisionPick {
  idx: number;
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
    return { idx: -1, done: true, instruction: "Task complete." };
  }

  throw new Error(`vision returned non-JSON: ${text.slice(0, 160)}`);
}

export default async function (req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method not allowed" }), {
      status: 405,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const apiKey = Deno.env.get("OPENROUTER_API_KEY");
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "OPENROUTER_API_KEY not configured" }), {
      status: 500,
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

  const { screenshot_b64, elements, task, site_hints } = body || {};
  if (!screenshot_b64 || !Array.isArray(elements) || !task) {
    return new Response(
      JSON.stringify({ error: "missing required: screenshot_b64, elements[], task" }),
      { status: 400, headers: { ...cors, "Content-Type": "application/json" } }
    );
  }

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

    const completion = await client.chat.completions.create({
      model: VISION_MODEL,
      max_tokens: 256,
      messages: [
        { role: "system", content: systemPrompt },
        {
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
        },
      ],
    });

    const text = completion.choices?.[0]?.message?.content || "";
    const pick = parseVisionJson(text);

    return new Response(JSON.stringify(pick), {
      status: 200,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    const err = e as Error;
    console.error("[vision-pick] error:", err.message);
    return new Response(JSON.stringify({ error: err.message || "vision failed" }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
}
