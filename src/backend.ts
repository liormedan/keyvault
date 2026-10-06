// Backend for the desktop app: one JSON request per line on stdin, one JSON reply per line on stdout.
// No port, no network — only the pipe to the Tauri process. Values are never written to stderr or logs.
// Auto-lock after 15 idle minutes (the key is wiped from memory; the process stays).
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { randomPassword, wipe } from "./crypto.ts";
import * as remember from "./remember.ts";
import { getLang, setLang, t } from "./i18n.ts";
import type { Handlers, Method, Reply } from "./protocol.ts";
import { LOCKED } from "./protocol.ts";
import { readLoginsFile } from "./import-csv.ts";
import { copyWithClear } from "./io.ts";
import * as store from "./store.ts";
import { TYPES } from "./types.ts";

const IDLE_MS = 15 * 60 * 1000;
let session: store.Session | null = null;
let idle: NodeJS.Timeout | undefined;
let lastImport: string | null = null; // path of the CSV just imported — the only file importCleanup may delete

function lock(): void {
  if (session) wipe(session.key);
  session = null;
  clearTimeout(idle);
}

function bump(): void {
  clearTimeout(idle);
  idle = setTimeout(lock, IDLE_MS);
}

function need(): store.Session {
  if (!session) throw new Error(LOCKED);
  return session;
}

const str = (v: unknown) => String(v ?? "").trim();

// Params arrive as JSON from the window, so values are still coerced with str() / String() at runtime.
const methods = {
  // The window decides the language and tells the backend, so errors come back in the same language
  setLang: ({ lang }) => {
    setLang(String(lang));
    return { lang: getLang() };
  },

  status: () => ({
    exists: store.exists(),
    unlocked: !!session,
    remembered: remember.remembered(),
    rememberSupported: remember.supported,
    vault: store.VAULT,
  }),

  async init({ password }) {
    if (!password) throw new Error(t("pw.empty"));
    session = await store.create(String(password));
    return { ok: true as const };
  },

  async unlock({ password, remember: rememberMe }) {
    if (password) {
      session = await store.unlockWithPassword(String(password));
      if (rememberMe) await remember.remember(session.key, store.salt());
      return { ok: true as const };
    }
    const cached = await remember.recall(store.salt());
    if (!cached) throw new Error(t("pw.required"));
    try {
      session = await store.unlockWithKey(cached);
    } catch {
      await remember.forget();
      throw new Error(t("remember.stale"));
    }
    return { ok: true as const };
  },

  lock: () => {
    lock();
    return { ok: true as const };
  },
  forget: async () => {
    await remember.forget();
    return { ok: true as const };
  },

  list: () => ({ projects: store.listing(need().data) }),

  value: ({ p, k }) => ({ value: store.getEntry(need().data, str(p), str(k)).value }),

  copy({ p, k }) {
    copyWithClear(store.getEntry(need().data, str(p), str(k)).value, 20);
    return { ok: true as const };
  },

  async set({ p, k, value, note }) {
    const { key, data } = need();
    p = str(p);
    k = str(k);
    if (!p || !k || p.includes("/") || !value) throw new Error(t("entry.missing"));
    store.setEntry(data, p, k, String(value), note == null ? undefined : String(note));
    await store.save(key, data);
    return { ok: true as const };
  },

  async delete({ p, k }) {
    const { key, data } = need();
    store.deleteEntry(data, str(p), str(k));
    await store.save(key, data);
    return { ok: true as const };
  },

  // ── Typed items ──
  types: () => ({ types: TYPES }),

  items: () => ({ items: store.listItems(need().data) }),

  item: ({ id }) => ({ item: store.maskedItem(need().data, id) }),

  itemValue: ({ id, k }) => ({ value: store.itemValue(need().data, id, k) }),

  itemCopy({ id, k }) {
    copyWithClear(store.itemValue(need().data, id, k), 20);
    return { ok: true as const };
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
    return { ok: true as const };
  },

  async itemDelete({ id }) {
    const { key, data } = need();
    store.deleteItem(data, id);
    await store.save(key, data);
    return { ok: true as const };
  },

  // Import a browser password export. The window sends only the path; values never reach it.
  async importCsv({ path: file }) {
    const { key, data } = need();
    file = String(file || "");
    const { logins, skipped } = readLoginsFile(file);
    const { added, duplicates } = store.importLogins(data, logins);
    if (added) await store.save(key, data);
    lastImport = file;
    return { added, duplicates, skipped, file: path.basename(file) };
  },

  importCleanup() {
    if (!lastImport) throw new Error(t("import.noFile"));
    fs.rmSync(lastImport, { force: true });
    lastImport = null;
    return { ok: true as const };
  },

  generate: async ({ length, symbols }) => ({ value: await randomPassword(length, { symbols: symbols !== false }) }),
} satisfies Handlers;

const rl = readline.createInterface({ input: process.stdin });
const reply = (obj: Reply) => process.stdout.write(`${JSON.stringify(obj)}\n`);

// Requests are handled one at a time, in order
let queue = Promise.resolve();
rl.on("line", (line) => {
  queue = queue.then(async () => {
    let id: number | null = null;
    try {
      const req = JSON.parse(line) as { id?: number; method?: string; params?: unknown };
      id = req.id ?? null;
      // hasOwn: "toString" or "constructor" are not methods
      if (typeof req.method !== "string" || !Object.hasOwn(methods, req.method)) throw new Error(t("op.unknown", { name: String(req.method) }));
      const fn = methods[req.method as Method] as (p: unknown) => unknown;
      const result = await fn(req.params || {});
      if (session) bump();
      reply({ id, result });
    } catch (e) {
      reply({ id, error: (e as Error).message });
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
