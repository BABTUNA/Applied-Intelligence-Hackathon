import { MossClient } from "@inferedge/moss";
import express from "express";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

const { MOSS_PROJECT_ID, MOSS_PROJECT_KEY } = process.env;
if (!MOSS_PROJECT_ID || !MOSS_PROJECT_KEY) {
  console.error("MOSS_PROJECT_ID and MOSS_PROJECT_KEY env vars are required.");
  process.exit(1);
}

const client = new MossClient(MOSS_PROJECT_ID, MOSS_PROJECT_KEY);
let indexLoaded = false;

async function warmup() {
  try {
    await client.loadIndex("betternav-hints");
    indexLoaded = true;
    console.log("Index loaded, ready for queries");
  } catch (err) {
    console.error("Failed to load index:", err.message);
    console.error("Service will start but queries will fail until index is available.");
  }
}

app.get("/health", (_req, res) => res.json({ ok: true, indexLoaded }));

app.post("/query", async (req, res) => {
  if (!indexLoaded) {
    return res.status(503).json({ error: "index not loaded" });
  }

  const { query, topK = 3, site } = req.body;
  if (!query) return res.status(400).json({ error: "query required" });

  try {
    const results = await client.query("betternav-hints", `${query} on ${site}`, { topK });
    const docs = results?.docs || results?.results || [];

    // Filter by site metadata in post-processing
    const filtered = site
      ? docs.filter((d) => {
          const s = d.metadata?.site || "";
          return s === site || site.endsWith("." + s);
        })
      : docs;

    const hints = filtered
      .map((d) => d.text)
      .filter(Boolean)
      .join("\n\n---\n\n");

    res.json({
      hints,
      source: "moss",
      count: filtered.length,
      scores: filtered.map((d) => d.score),
    });
  } catch (err) {
    console.error("Query error:", err.message);
    res.status(500).json({ error: "query failed", message: err.message });
  }
});

const PORT = process.env.PORT || 3033;
warmup().then(() =>
  app.listen(PORT, () => console.log(`moss-query on :${PORT}`))
);
