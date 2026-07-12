// Hand-rolled chrome.* API mocks for testing.
// Uses Maps to simulate storage, simple stubs for tabs/alarms/scripting.

function makeStorageArea() {
  const store = new Map();
  return {
    _store: store,
    async get(keys) {
      if (typeof keys === "string") keys = [keys];
      if (!Array.isArray(keys)) keys = Object.keys(keys);
      const result = {};
      for (const k of keys) {
        if (store.has(k)) result[k] = store.get(k);
      }
      return result;
    },
    async set(obj) {
      for (const [k, v] of Object.entries(obj)) {
        store.set(k, v);
      }
    },
    async remove(keys) {
      if (typeof keys === "string") keys = [keys];
      for (const k of keys) store.delete(k);
    },
    async clear() {
      store.clear();
    },
  };
}

const _alarms = new Map();
const _sentMessages = [];

globalThis.chrome = {
  storage: {
    session: makeStorageArea(),
    local: makeStorageArea(),
  },

  tabs: {
    _sentMessages,
    async sendMessage(tabId, msg) {
      _sentMessages.push({ tabId, msg });
      // Return a default response; tests can override via vi.fn()
      return { ok: true };
    },
    async captureVisibleTab(windowId, opts) {
      return "data:image/jpeg;base64,AAAA";
    },
    async get(tabId) {
      return { id: tabId, windowId: 1, url: "https://github.com/settings/profile" };
    },
    async query(queryInfo) {
      return [{ id: 1, windowId: 1, url: "https://github.com/settings/profile" }];
    },
  },

  alarms: {
    _alarms,
    async create(name, opts) {
      _alarms.set(name, opts);
    },
    async clear(name) {
      _alarms.delete(name);
    },
    onAlarm: {
      addListener(fn) {
        // no-op for tests
      },
    },
  },

  scripting: {
    async executeScript(opts) {
      return [{ result: undefined }];
    },
    async insertCSS(opts) {
      // no-op
    },
  },

  runtime: {
    _listeners: [],
    sendMessage(msg) {
      // no-op
    },
    onMessage: {
      addListener(fn) {
        chrome.runtime._listeners.push(fn);
      },
    },
  },
};

/**
 * Reset all chrome mock state between tests.
 */
export function resetChromeMock() {
  chrome.storage.session._store.clear();
  chrome.storage.local._store.clear();
  chrome.alarms._alarms.clear();
  chrome.tabs._sentMessages.length = 0;
  chrome.runtime._listeners.length = 0;
}
