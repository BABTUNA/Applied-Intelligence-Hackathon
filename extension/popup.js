const $ = (id) => document.getElementById(id);
const USERS = ["demo_user_1", "demo_user_2"];

async function getActiveUser() {
  const { activeUser } = await chrome.storage.session.get("activeUser");
  return activeUser || USERS[0];
}

async function setActiveUser(u) {
  await chrome.storage.session.set({ activeUser: u });
  $("userBadge").textContent = u;
}

async function init() {
  const u = await getActiveUser();
  $("userBadge").textContent = u;

  $("switchUser").addEventListener("click", async () => {
    const cur = await getActiveUser();
    const next = USERS[(USERS.indexOf(cur) + 1) % USERS.length];
    await setActiveUser(next);
    setStatus(`Switched to ${next}.`);
  });

  $("go").addEventListener("click", startGuidance);
  $("task").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) startGuidance();
  });
  $("stop").addEventListener("click", stopGuidance);
  $("openOptions").addEventListener("click", (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });
}

function setStatus(msg, cls = "") {
  const el = $("status");
  el.textContent = msg;
  el.className = "status " + cls;
}

async function startGuidance() {
  const task = $("task").value.trim();
  if (!task) {
    setStatus("Type what you want to do first.", "err");
    return;
  }
  const user = await getActiveUser();
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url || !/^https?:\/\//i.test(tab.url)) {
    setStatus("Open an https:// page first (chrome:// and similar can't be guided).", "err");
    return;
  }

  $("go").disabled = true;
  setStatus("Asking the agent…");

  try {
    const resp = await chrome.runtime.sendMessage({
      type: "START_GUIDANCE",
      task,
      user,
      tabId: tab.id,
      url: tab.url,
    });
    if (resp?.ok) {
      setStatus("Agent is reading the page — watch for the green glow.", "hit");
    } else {
      setStatus(resp?.error || "Failed to start.", "err");
    }
  } catch (e) {
    setStatus(String(e.message || e), "err");
  } finally {
    $("go").disabled = false;
  }
}

async function stopGuidance() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  await chrome.runtime.sendMessage({ type: "STOP_GUIDANCE", tabId: tab.id });
  setStatus("Stopped.");
}

init();
