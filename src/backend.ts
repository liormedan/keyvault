// Backend for the desktop app: one JSON request per line on stdin, one JSON reply per line on stdout.
// No port, no network — only the pipe to the Tauri process. Values are never written to stderr or logs.
// Auto-lock after 15 idle minutes (the key is wiped from memory; the process stays).
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { breachReport } from "./breach.ts";
import { ensureIdentity, makeShare, openShare, type SharePayload, shareKeyOf } from "./share.ts";
import * as sync from "./sync.ts";
import { browserStatus, bundledHost, disableBrowser, enableBrowser } from "./browser-setup.ts";
import { canonicalCode, randomPassword, recoveryCode, wipe } from "./crypto.ts";
import { healthReport } from "./health.ts";
import * as remember from "./remember.ts";
import { getLang, setLang, t } from "./i18n.ts";
import type { Handlers, Method, Reply } from "./protocol.ts";
import { LOCKED } from "./protocol.ts";
import { readImportFile } from "./import-file.ts";
import { copyWithClear } from "./io.ts";
import * as store from "./store.ts";
import { totp } from "./totp.ts";
import { TYPES } from "./types.ts";

const IDLE_MS = 15 * 60 * 1000;
let session: store.Session | null = null;
let idle: NodeJS.Timeout | undefined;
let lastImport: string | null = null; // path of the CSV just imported — the only file importCleanup may delete
let pendingShare: SharePayload | null = null; // a .kvshare opened by receiveOpen, waiting for receiveAccept
let revision = 0; // bumped when a sync changed the vault — the window reloads
let seen = ""; // the sync folder's and the vault's modification times at the last sync

// Every save also syncs, when a folder is configured
sync.enableAutoSync();

async function syncInBackground(): Promise<void> {
  if (!session || !sync.syncFolder()) return;
  const before = JSON.stringify(session.data.items).length + JSON.stringify(session.data.projects).length;
  try {
    await sync.syncNow(session.key, session.data);
    seen = sync.fingerprint();
    if (JSON.stringify(session.data.items).length + JSON.stringify(session.data.projects).length !== before) revision++;
  } catch {
    // kept in syncStatus().error for the window
  }
}

// While unlocked: look for changes from other computers (the folder) or other processes (the CLI, the browser) every minute
setInterval(() => {
  if (session && sync.syncFolder() && sync.fingerprint() !== seen) void syncInBackground();
}, 60_000).unref();

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

function totpField(id: string): string {
  const v = store.getItem(need().data, id).fields.totp;
  if (!v) throw new Error(t("totp.none"));
  return v;
}

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
      void syncInBackground();
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
    void syncInBackground();
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

  itemTotp: ({ id }) => totp(totpField(id)),

  itemTotpCopy({ id }) {
    copyWithClear(totp(totpField(id)).code, 20);
    return { ok: true as const };
  },

  health: () => healthReport(need().data),

  breaches: () => breachReport(need().data),

  // Import a browser or password-manager export. The window sends only the path; values never reach it.
  async importFile({ path: file }) {
    const { key, data } = need();
    file = String(file || "");
    const parsed = readImportFile(file);
    const { added, duplicates, invalid } = store.importItems(data, parsed.items);
    if (added) await store.save(key, data);
    lastImport = file;
    return { format: parsed.format, added, duplicates, skipped: parsed.skipped + invalid, file: path.basename(file) };
  },

  importCleanup() {
    if (!lastImport) throw new Error(t("import.noFile"));
    fs.rmSync(lastImport, { force: true });
    lastImport = null;
    return { ok: true as const };
  },

  // Emergency export. Without a password a recovery code is generated, used, and returned once for the user to write down.
  async exportVault({ path: file, password }) {
    const { data } = need();
    const code = password ? undefined : await recoveryCode();
    await store.exportTo(String(file || ""), data, password ? String(password) : canonicalCode(code!));
    return code ? { code } : {};
  },

  browserStatus: () => browserStatus(),

  browserEnable() {
    const hostScript = bundledHost();
    if (!hostScript) throw new Error(t("browser.noHost"));
    return enableBrowser({ hostScript });
  },

  browserDisable: () => disableBrowser(),

  // ── Sync ──
  syncStatus: () => ({ ...sync.syncStatus(session?.data), revision }),

  async syncLink({ folder, password }) {
    const s = need();
    const res = await sync.link(String(folder || ""), s.key, s.data, password ? String(password) : undefined);
    if (res.key) {
      // Joined another computer's vault: its key from now on (and remembered again, if this computer remembers)
      const wasRemembered = remember.remembered();
      await wipe(s.key);
      s.key = res.key;
      if (wasRemembered) await remember.remember(s.key, store.salt());
    }
    seen = sync.fingerprint();
    revision++;
    return { mode: res.mode };
  },

  async syncNow() {
    const s = need();
    const res = await sync.syncNow(s.key, s.data);
    seen = sync.fingerprint();
    revision++;
    return res;
  },

  syncUnlink() {
    sync.unlink();
    return { ok: true as const };
  },

  // ── Sharing ──
  async shareKey() {
    const { key, data } = need();
    if ((await ensureIdentity(data)).created) await store.save(key, data);
    return { key: await shareKeyOf(data.identity!.publicKey) };
  },

  async shareItem({ id, to, path: file }) {
    const it = store.getItem(need().data, String(id));
    const text = await makeShare(String(to || ""), [{ type: it.type, title: it.title, fields: it.fields }]);
    try {
      fs.writeFileSync(String(file || ""), text, { flag: "wx", mode: 0o600 });
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "EEXIST") throw new Error(t("export.exists", { path: String(file) }));
      throw e;
    }
    return { ok: true as const };
  },

  async receiveOpen({ path: file }) {
    const { key, data } = need();
    if ((await ensureIdentity(data)).created) await store.save(key, data);
    pendingShare = await openShare(fs.readFileSync(String(file || ""), "utf8"), data.identity);
    return {
      items: pendingShare.items.map((i) => ({ type: i.type, title: i.title })),
      dev: pendingShare.dev.map((d) => `${d.project}/${d.key}`),
      at: pendingShare.at,
    };
  },

  async receiveAccept() {
    const { key, data } = need();
    if (!pendingShare) throw new Error(t("import.noFile"));
    const { added, duplicates, invalid } = store.importItems(data, pendingShare.items);
    const dev = store.addSharedDev(data, pendingShare.dev);
    pendingShare = null;
    if (added || dev.added) await store.save(key, data);
    return { added, duplicates: duplicates + invalid, devAdded: dev.added, devSkipped: dev.skipped };
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
