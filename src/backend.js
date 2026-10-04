// Backend for the desktop app: one JSON request per line on stdin, one JSON reply per line on stdout.
// No port, no network — only the pipe to the Tauri process. Values are never written to stderr or logs.
// Auto-lock after 15 idle minutes (the key is wiped from memory; the process stays).
import readline from "node:readline";
import { randomPassword, wipe } from "./crypto.js";
import * as dpapi from "./dpapi.js";
import { copyWithClear } from "./io.js";
import * as store from "./store.js";
import { TYPES } from "./types.js";

const IDLE_MS = 15 * 60 * 1000;
let session = null; // { key, data }
let idle;

function lock() {
  if (session) wipe(session.key);
  session = null;
  clearTimeout(idle);
}

function bump() {
  clearTimeout(idle);
  idle = setTimeout(lock, IDLE_MS);
}

function need() {
  if (!session) throw new Error("locked");
  return session;
}

const str = (v) => String(v ?? "").trim();

const methods = {
  status: () => ({
    exists: store.exists(),
    unlocked: !!session,
    remembered: dpapi.remembered(),
    rememberSupported: dpapi.supported,
    vault: store.VAULT,
  }),

  async init({ password }) {
    if (!password) throw new Error("סיסמת אב ריקה");
    session = await store.create(String(password));
    return { ok: true };
  },

  async unlock({ password, remember }) {
    if (password) {
      session = await store.unlockWithPassword(String(password));
      if (remember) dpapi.remember(session.key, store.salt());
      return { ok: true };
    }
    const cached = dpapi.recall(store.salt());
    if (!cached) throw new Error("נדרשת סיסמת אב");
    try {
      session = await store.unlockWithKey(cached);
    } catch {
      dpapi.forget();
      throw new Error("הזכירה לא תקפה יותר — נדרשת סיסמת אב");
    }
    return { ok: true };
  },

  lock: () => (lock(), { ok: true }),
  forget: () => (dpapi.forget(), { ok: true }),

  list: () => ({ projects: store.listing(need().data) }),

  value: ({ p, k }) => ({ value: store.getEntry(need().data, str(p), str(k)).value }),

  copy({ p, k }) {
    copyWithClear(store.getEntry(need().data, str(p), str(k)).value, 20);
    return { ok: true };
  },

  async set({ p, k, value, note }) {
    const { key, data } = need();
    p = str(p);
    k = str(k);
    if (!p || !k || p.includes("/") || !value) throw new Error("חסר פרויקט, שם או ערך (בלי / בשם הפרויקט)");
    store.setEntry(data, p, k, String(value), note == null ? undefined : String(note));
    await store.save(key, data);
    return { ok: true };
  },

  async delete({ p, k }) {
    const { key, data } = need();
    store.deleteEntry(data, str(p), str(k));
    await store.save(key, data);
    return { ok: true };
  },

  // ── Typed items ──
  types: () => ({ types: TYPES }),

  items: () => ({ items: store.listItems(need().data) }),

  item: ({ id }) => ({ item: store.maskedItem(need().data, id) }),

  itemValue: ({ id, k }) => ({ value: store.itemValue(need().data, id, k) }),

  itemCopy({ id, k }) {
    copyWithClear(store.itemValue(need().data, id, k), 20);
    return { ok: true };
  },

  async itemSave(params) {
    const { key, data } = need();
    const id = store.saveItem(data, params);
    await store.save(key, data);
    return { id };
  },

  async itemFav({ id, fav }) {
    const { key, data } = need();
    store.setFav(data, id, fav);
    await store.save(key, data);
    return { ok: true };
  },

  async itemDelete({ id }) {
    const { key, data } = need();
    store.deleteItem(data, id);
    await store.save(key, data);
    return { ok: true };
  },

  generate: async ({ length, symbols }) => ({ value: await randomPassword(length, { symbols: symbols !== false }) }),
};

const rl = readline.createInterface({ input: process.stdin });
const reply = (obj) => process.stdout.write(`${JSON.stringify(obj)}\n`);

// Requests are handled one at a time, in order
let queue = Promise.resolve();
rl.on("line", (line) => {
  queue = queue.then(async () => {
    let id = null;
    try {
      const req = JSON.parse(line);
      id = req.id ?? null;
      const fn = methods[req.method];
      if (!fn) throw new Error(`פעולה לא מוכרת: ${req.method}`);
      const result = await fn(req.params || {});
      if (session) bump();
      reply({ id, result });
    } catch (e) {
      reply({ id, error: e.message });
    }
  });
});
// The window closed: finish queued requests (a save may be in flight), then exit
rl.on("close", () => {
  queue.finally(() => {
    lock();
    process.exit(0);
  });
});
