const KEYS = ["anthropic", "evermind", "butterbase", "bbAppId"];
const $ = (id) => document.getElementById(id);

async function load() {
  const stored = await chrome.storage.local.get(KEYS);
  for (const k of KEYS) {
    if (stored[k]) $(k).value = stored[k];
  }
}

async function save() {
  const payload = {};
  for (const k of KEYS) payload[k] = $(k).value.trim();
  await chrome.storage.local.set(payload);

  const status = $("status");
  status.textContent = "Saved.";
  status.className = "status ok";
  setTimeout(() => {
    status.textContent = "";
    status.className = "status";
  }, 2000);
}

$("save").addEventListener("click", save);
load();
