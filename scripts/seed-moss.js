#!/usr/bin/env node
//
// Seed the Moss "betternav-hints" index with navigation hints from markdown files.
// Uses the official Moss SDK (@inferedge/moss) for index creation and querying.
// Optionally parses PDFs/images via Unsiloed before chunking.
//
// Usage:
//   MOSS_PROJECT_ID=... MOSS_PROJECT_KEY=... node scripts/seed-moss.js
//
// Optional env:
//   UNSILOED_API_KEY   if set and PDF/image files exist in fixtures/hint-docs/,
//                      parse them via Unsiloed before chunking

const fs = require("node:fs");
const path = require("node:path");
// MossClient is ESM-only — loaded via dynamic import() in main().

const MOSS_PROJECT_ID = process.env.MOSS_PROJECT_ID;
const MOSS_PROJECT_KEY = process.env.MOSS_PROJECT_KEY;
const UNSILOED_API_KEY = process.env.UNSILOED_API_KEY;

const INDEX_NAME = "betternav-hints";
const HINT_DOCS_DIR = path.resolve(__dirname, "../fixtures/hint-docs");

function die(msg, code = 1) {
  console.error(`✗ ${msg}`);
  process.exit(code);
}

if (!MOSS_PROJECT_ID) die("MOSS_PROJECT_ID env var is required.");
if (!MOSS_PROJECT_KEY) die("MOSS_PROJECT_KEY env var is required.");

// ─── helpers ────────────────────────────────────────────────────────────────

// Extract site domain from filename (e.g., "aws-console.md" → "console.aws.amazon.com")
const FILENAME_TO_SITE = {
  "github.md": "github.com",
  "claude-ai.md": "claude.ai",
  "aws-console.md": "console.aws.amazon.com",
  "amazon.md": "amazon.com",
};

// Extract task family from a chunk header line
function extractTaskFamily(chunk) {
  const match = chunk.match(/TASK(?:\s+FAMILY)?:\s*(.+)/i);
  return match ? match[1].trim().replace(/\s*=+\s*$/, "") : "general";
}

// ─── Unsiloed parsing (optional) ────────────────────────────────────────────

async function parseWithUnsiloed(filePath) {
  const fileBuffer = fs.readFileSync(filePath);
  const fileName = path.basename(filePath);

  // Step 1: Submit parse job via multipart/form-data
  const form = new FormData();
  const blob = new Blob([fileBuffer]);
  form.append("file", blob, fileName);

  const resp = await fetch("https://prod.visionapi.unsiloed.ai/parse", {
    method: "POST",
    headers: { "api-key": UNSILOED_API_KEY },
    body: form,
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    throw new Error(`Unsiloed submit ${resp.status}: ${errText.slice(0, 200)}`);
  }

  const { job_id } = await resp.json();
  if (!job_id) throw new Error("Unsiloed returned no job_id");

  // Step 2: Poll for results (up to 60s)
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const poll = await fetch(`https://prod.visionapi.unsiloed.ai/parse/${job_id}`, {
      headers: { "api-key": UNSILOED_API_KEY },
    });
    if (!poll.ok) continue;

    const data = await poll.json();
    if (data.status === "completed" || data.status === "Completed" || data.status === "Succeeded") {
      const chunks = data.chunks || data.pages || [];
      if (chunks.length > 0) {
        return chunks
          .map((c) => {
            const segments = c.segments || [];
            return segments.map((s) => s.markdown || s.content || s.text || "").join("\n");
          })
          .join("\n\n");
      }
      // Fallback: try top-level text fields
      const fallback = data.text || data.content || data.markdown || data.result?.text || data.result?.markdown || "";
      if (fallback) return fallback;
      // Last resort: dump keys for debugging
      console.log(`    Unsiloed full response (truncated): ${JSON.stringify(data).slice(0, 500)}`);
      return "";
    }
    if (data.status === "failed" || data.status === "Failed") {
      throw new Error(`Unsiloed job failed: ${data.error || "unknown"}`);
    }
  }
  throw new Error("Unsiloed polling timed out after 60s");
}

// ─── main ───────────────────────────────────────────────────────────────────

(async () => {
  const { MossClient } = await import("@inferedge/moss");
  const client = new MossClient(MOSS_PROJECT_ID, MOSS_PROJECT_KEY);
  console.log("→ Moss client initialized.");

  // Step 1: Read and chunk markdown files
  const mdFiles = fs.readdirSync(HINT_DOCS_DIR).filter((f) => f.endsWith(".md"));
  if (mdFiles.length === 0) die(`No .md files found in ${HINT_DOCS_DIR}`);

  const allDocuments = [];

  for (const file of mdFiles) {
    const filePath = path.join(HINT_DOCS_DIR, file);
    const text = fs.readFileSync(filePath, "utf8");
    const site = FILENAME_TO_SITE[file] || file.replace(/\.md$/, "");

    // Split by ============ separator lines
    const chunks = text
      .split(/^=+$/m)
      .map((c) => c.trim())
      .filter((c) => c.length > 20);

    console.log(`  ${file}: ${chunks.length} chunk(s) for site=${site}`);

    for (let i = 0; i < chunks.length; i++) {
      const taskFamily = extractTaskFamily(chunks[i]);
      allDocuments.push({
        id: `${site}--${i}`,
        text: chunks[i],
        metadata: {
          site,
          task_family: taskFamily,
          source: "hint-docs",
          file,
          chunk_index: i,
        },
      });
    }
  }

  // Step 1b (optional): Parse PDFs/images via Unsiloed
  if (UNSILOED_API_KEY) {
    const binaryExts = [".pdf", ".png", ".jpg", ".jpeg", ".webp"];
    const binaryFiles = fs.readdirSync(HINT_DOCS_DIR).filter((f) =>
      binaryExts.includes(path.extname(f).toLowerCase())
    );

    if (binaryFiles.length > 0) {
      console.log(`\n→ Parsing ${binaryFiles.length} binary file(s) via Unsiloed…`);
      for (const file of binaryFiles) {
        const filePath = path.join(HINT_DOCS_DIR, file);
        try {
          const parsedText = await parseWithUnsiloed(filePath);
          if (!parsedText) {
            console.warn(`  ⚠ ${file}: Unsiloed returned empty text, skipping.`);
            continue;
          }

          const chunks = parsedText
            .split(/^=+$/m)
            .map((c) => c.trim())
            .filter((c) => c.length > 20);

          const site = file.replace(/\.[^.]+$/, "").replace(/-/g, ".");
          console.log(`  ${file}: ${chunks.length} chunk(s) via Unsiloed for site=${site}`);

          for (let i = 0; i < chunks.length; i++) {
            const taskFamily = extractTaskFamily(chunks[i]);
            allDocuments.push({
              id: `unsiloed-${site}--${i}`,
              text: chunks[i],
              metadata: {
                site,
                task_family: taskFamily,
                source: "unsiloed",
                file,
                chunk_index: i,
              },
            });
          }
        } catch (e) {
          console.warn(`  ⚠ ${file}: Unsiloed parse failed: ${e.message}`);
        }
      }
    }
  } else {
    console.log("\n  (UNSILOED_API_KEY not set — skipping binary file parsing)");
  }

  // Step 2: Create/update the Moss index with all documents
  console.log(`\n→ Creating index "${INDEX_NAME}" with ${allDocuments.length} document(s)…`);
  console.log("  (This uploads docs, builds embeddings, and creates the search index)");

  try {
    await client.createIndex(INDEX_NAME, allDocuments);
    console.log(`✓ Index "${INDEX_NAME}" created successfully.`);
  } catch (e) {
    if (e.message && e.message.includes("409")) {
      console.log(`  Index already exists — deleting and recreating…`);
      try {
        await client.deleteIndex(INDEX_NAME);
      } catch (_) {
        // deleteIndex may not exist on all SDK versions; try alternative
      }
      await client.createIndex(INDEX_NAME, allDocuments);
      console.log(`✓ Index "${INDEX_NAME}" recreated successfully.`);
    } else {
      console.error(`✗ Index creation failed: ${e.message}`);
      die(e.message);
    }
  }

  // Step 3: Load the index and run a test query
  console.log("\n→ Loading index for querying…");
  try {
    await client.loadIndex(INDEX_NAME);
    console.log(`✓ Index "${INDEX_NAME}" loaded.`);
  } catch (e) {
    console.warn(`⚠ loadIndex failed: ${e.message}`);
    console.log("  The index may still be building. Try again in a few seconds.");
  }

  console.log("\n→ Running test query…");
  try {
    const results = await client.query(INDEX_NAME, "rotate my personal access token on github.com", { topK: 3 });
    const docs = results?.docs || results?.results || [];
    if (docs.length > 0) {
      console.log(`✓ Test query returned ${docs.length} hit(s):`);
      for (const d of docs) {
        const text = (d.text || "").slice(0, 80);
        const score = typeof d.score === "number" ? d.score.toFixed(3) : "n/a";
        console.log(`  · [${score}] ${text}…`);
      }
    } else {
      console.warn("⚠ Test query returned zero hits.");
      console.log("  Raw response:", JSON.stringify(results).slice(0, 300));
    }
  } catch (e) {
    console.warn(`⚠ Test query failed: ${e.message}`);
  }

  console.log("\n✓ Seed complete.");
})().catch((e) => die(e.message || String(e)));
