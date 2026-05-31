// Zip the `out/` directory into `frontend.zip` with forward-slash entry paths.
// Required on Windows because PowerShell's Compress-Archive and Explorer's
// "Send to → Compressed folder" both emit backslash-separated entry names,
// which Cloudflare Pages cannot route — assets get served as text/html and
// the site breaks. Butterbase's docs explicitly recommend this approach.

const fs = require("node:fs");
const path = require("node:path");
const archiver = require("archiver");

const OUT_DIR = path.join(__dirname, "out");
const ZIP_PATH = path.join(__dirname, "frontend.zip");

if (!fs.existsSync(OUT_DIR)) {
  console.error(`✗ ${OUT_DIR} not found. Run \`npm run build\` first.`);
  process.exit(1);
}

const output = fs.createWriteStream(ZIP_PATH);
const archive = archiver("zip", { zlib: { level: 9 } });

output.on("close", () => {
  const kb = (archive.pointer() / 1024).toFixed(1);
  console.log(`✓ frontend.zip (${kb} KB) ready at ${ZIP_PATH}`);
});

archive.on("error", (err) => {
  console.error("✗ archive error:", err);
  process.exit(1);
});

archive.pipe(output);
// `false` = zip the contents of out/, not a top-level "out" folder.
archive.directory(OUT_DIR, false);
archive.finalize();
