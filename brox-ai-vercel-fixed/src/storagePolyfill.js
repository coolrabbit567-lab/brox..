// Polyfills `window.storage` (normally provided by the Claude.ai artifact
// sandbox) using the browser's localStorage instead, so App.jsx doesn't
// need any changes to its storage.get/set/delete/list calls.
//
// IMPORTANT LIMITATION: localStorage is per-browser, not shared across
// devices or users. Every visitor gets their own independent set of users,
// tokens, and abuse log — there's no real "shared" admin view across
// different people's browsers. If you want genuinely shared, multi-user
// data (e.g. one admin managing everyone's tokens from anywhere), swap
// this out for a real database — Vercel KV, Upstash Redis, Supabase, or
// similar — and reimplement these four methods against it. The rest of
// the app doesn't care how storage is implemented.

const PREFIX = "brox-ai:";

function fullKey(key) {
  return PREFIX + key;
}

export function installStoragePolyfill() {
  if (typeof window === "undefined") return;
  if (window.storage) return; // already provided (e.g. running inside Claude.ai)

  window.storage = {
    async get(key) {
      const raw = localStorage.getItem(fullKey(key));
      if (raw === null) {
        throw new Error(`Key not found: ${key}`);
      }
      return { key, value: raw, shared: false };
    },

    async set(key, value) {
      localStorage.setItem(fullKey(key), value);
      return { key, value, shared: false };
    },

    async delete(key) {
      localStorage.removeItem(fullKey(key));
      return { key, deleted: true, shared: false };
    },

    async list(prefix = "") {
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(PREFIX + prefix)) {
          keys.push(k.slice(PREFIX.length));
        }
      }
      return { keys, prefix, shared: false };
    },
  };
}
