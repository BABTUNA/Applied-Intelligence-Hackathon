import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Create a DOM element with attributes and optional text content.
 *
 * @param {string} tag - HTML tag name
 * @param {Record<string, string>} [attrs={}] - attribute map
 * @param {string} [textContent=""] - text content
 * @returns {HTMLElement}
 */
export function makeEl(tag, attrs = {}, textContent = "") {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "id") {
      el.id = v;
    } else {
      el.setAttribute(k, v);
    }
  }
  if (textContent) el.textContent = textContent;
  return el;
}

/**
 * Load an HTML fixture file and inject it into the document body.
 *
 * @param {string} name - filename (relative to tests/fixtures/)
 * @returns {string} the raw HTML
 */
export function loadFixture(name) {
  const filepath = resolve(__dirname, "..", "fixtures", name);
  const html = readFileSync(filepath, "utf8");
  document.body.innerHTML = html;
  return html;
}
