// Sync through a folder the user already syncs (Google Drive, Dropbox, OneDrive, iCloud, Syncthing…).
// The vault stays where it is; the folder holds a second copy, kv-vault.kv, in the same format with the same header,
// so every linked computer opens it with its own derived key. No server of ours, nothing new to trust.
//
// Every sync: take the lock, read this computer's vault (from disk — another process may have written it), the
// folder's copy and any conflicted copies the cloud client made ("kv-vault (1).kv", "kv-vault (conflicted copy).kv"),
// merge them item by item, write both, release the lock.
//
// The merge (`merge`) is per item and per dev key: the newer change wins; a deletion wins over anything older
// (tombstones in `deleted`); an item changed on two computers since this one last synced keeps both versions — the
// older one as a copy titled "(conflict <date>)", with an id derived from the original, so every computer makes the
// same copy instead of a new one each time.
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { deriveKey, open, seal, wipe } from "./crypto.ts";
import { t } from "./i18n.ts";
import type { DevEntry, Item, VaultData, VaultFile } from "./model.ts";
import * as store from "./store.ts";

export const SYNC_FILE = "kv-vault.kv";
const LOCK_FILE = "kv-vault.lock";
const STALE_LOCK_MS = 60_000;
const TOMBSTONE_DAYS = 180;
const CONFIG = path.join(store.HOME, "config.json");

/** An error the window or the CLI turns into its own message */
export class SyncError extends Error {}

// ── Which folder (config.json, next to the language) ──

function readConfig(): Record<string, unknown> {
  try {
    return JSON.parse(fs.readFileSync(CONFIG, "utf8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function syncFolder(): string | null {
  const s = readConfig().sync as { folder?: unknown } | undefined;
  return typeof s?.folder === "string" && s.folder ? s.folder : null;
}

function setSyncFolder(folder: string | null): void {
  fs.mkdirSync(store.HOME, { recursive: true });
  const c = readConfig();
  if (folder) c.sync = { folder };
  else delete c.sync;
  fs.writeFileSync(CONFIG, JSON.stringify(c, null, 1));
}

// ── Merge ──

const time = (iso: string | undefined): number => (iso ? Date.parse(iso) || 0 : 0);
const stamp = (it: Item): number => Math.max(time(it.updated), time(it.favAt));
const content = (it: Item) => JSON.stringify([it.type, it.title, Object.entries(it.fields).sort(([a], [b]) => a.localeCompare(b))]);

/** The id of the conflict copy of `id` at version `updated` — the same on every computer */
export function conflictId(id: string, updated: string): string {
  const h = createHash("sha256").update(`${id}\n${updated}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

export interface MergeResult {
  data: VaultData;
  conflicts: number;
}

/** Merge `remote` into `local`. `lastSync` is when this computer last synced (no conflicts are possible before it). */
export function merge(local: VaultData, remote: VaultData, lastSync?: string): MergeResult {
  const base = time(lastSync);
  const deleted: Record<string, string> = { ...remote.deleted };
  for (const [ref, at] of Object.entries(local.deleted)) if (time(at) > time(deleted[ref])) deleted[ref] = at;
  const gone = (ref: string, version: number) => time(deleted[ref]) >= version;
  let conflicts = 0;

  const items: Record<string, Item> = {};
  for (const id of new Set([...Object.keys(local.items), ...Object.keys(remote.items)])) {
    const l = local.items[id];
    const r = remote.items[id];
    let pick = (l && r ? (stamp(l) >= stamp(r) ? l : r) : (l ?? r))!;
    if (l && r && content(l) !== content(r)) {
      const [newer, older] = time(l.updated) >= time(r.updated) ? [l, r] : [r, l];
      if (time(l.updated) > base && time(r.updated) > base) {
        const copyId = conflictId(id, older.updated);
        if (!gone(`item:${copyId}`, Number.POSITIVE_INFINITY)) {
          items[copyId] ??= {
            ...older,
            id: copyId,
            fav: false,
            favAt: undefined,
            title: t("sync.conflictTitle", { title: older.title, date: older.updated.slice(0, 10) }),
          };
          conflicts++;
        }
      }
      // The newer content, with whichever star was toggled last
      const star = time(l.favAt) >= time(r.favAt) ? l : r;
      pick = { ...newer, fav: star.fav, ...(star.favAt ? { favAt: star.favAt } : {}) };
    }
    if (!gone(`item:${id}`, stamp(pick))) items[id] = pick;
  }
  // Copies made on another computer arrive as ordinary items through the loop above

  const projects: Record<string, Record<string, DevEntry>> = {};
  const refs = new Set<string>();
  for (const side of [local, remote]) for (const [p, keys] of Object.entries(side.projects)) for (const k of Object.keys(keys)) refs.add(`${p}\n${k}`);
  for (const ref of refs) {
    const [p, k] = ref.split("\n") as [string, string];
    const l = local.projects[p]?.[k];
    const r = remote.projects[p]?.[k];
    const pick = (l && r ? (time(l.updated) >= time(r.updated) ? l : r) : (l ?? r))!;
    if (gone(`dev:${p}/${k}`, time(pick.updated))) continue;
    projects[p] ??= {};
    projects[p][k] = pick;
  }

  // Forget old deletions; anything that old is gone everywhere that has synced since
  const cutoff = Date.now() - TOMBSTONE_DAYS * 86_400_000;
  for (const [ref, at] of Object.entries(deleted)) if (time(at) < cutoff) delete deleted[ref];

  // Both computers keep the same sharing key: the one already in the folder wins, else this one
  const identity = remote.identity ?? local.identity;
  const created = [local.created, remote.created].filter(Boolean).sort()[0] ?? new Date().toISOString();
  const data: VaultData = { created, projects, items, deleted, ...(identity ? { identity } : {}), ...(local.sync ? { sync: local.sync } : {}) };
  return { data, conflicts };
}

// ── Files in the folder ──

const syncPath = (folder: string) => path.join(folder, SYNC_FILE);

/** Conflicted copies cloud clients make next to the file: "kv-vault (1).kv", "kv-vault (conflicted copy …).kv", "kv-vault-PC.kv" */
export function conflictCopies(folder: string): string[] {
  let names: string[];
  try {
    names = fs.readdirSync(folder);
  } catch {
    return [];
  }
  return names.filter((n) => /^kv-vault.*\.kv$/i.test(n) && n.toLowerCase() !== SYNC_FILE).map((n) => path.join(folder, n));
}

function readSealed(file: string): VaultFile {
  let sealed: VaultFile;
  try {
    sealed = JSON.parse(fs.readFileSync(file, "utf8")) as VaultFile;
  } catch {
    throw new SyncError(t("sync.unreadable", { file: path.basename(file) }));
  }
  if (!sealed?.kdf?.salt || !sealed.ct) throw new SyncError(t("sync.unreadable", { file: path.basename(file) }));
  return sealed;
}

/** What goes to the folder: everything but this computer's own sync state */
const shared = (data: VaultData): VaultData => {
  const { sync: _local, ...rest } = data;
  return rest;
};

async function writeSynced(folder: string, key: Uint8Array, data: VaultData): Promise<void> {
  const file = syncPath(folder);
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(await seal(key, shared(data), store.header()), null, 1), { mode: 0o600 });
  if (fs.existsSync(file)) fs.copyFileSync(file, `${file}.bak`);
  fs.renameSync(tmp, file);
}

// ── The lock ──
// Keeps two processes on this computer (the app and the CLI, or the browser host) from syncing at once.
// Across computers the cloud client is the only coordinator; the merge makes a late write harmless.

async function withLock<T>(folder: string, fn: () => Promise<T>): Promise<T> {
  const lock = path.join(folder, LOCK_FILE);
  const deadline = Date.now() + 10_000;
  for (;;) {
    try {
      fs.writeFileSync(lock, JSON.stringify({ host: os.hostname(), pid: process.pid, at: new Date().toISOString() }), { flag: "wx" });
      break;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw new SyncError(t("sync.folderGone", { folder }));
      try {
        if (Date.now() - fs.statSync(lock).mtimeMs > STALE_LOCK_MS) fs.rmSync(lock, { force: true });
      } catch {}
      if (Date.now() > deadline) throw new SyncError(t("sync.busy"));
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  try {
    return await fn();
  } finally {
    fs.rmSync(lock, { force: true });
  }
}

// ── Sync ──

export interface SyncResult {
  at: string;
  conflicts: number;
  /** conflicted copies merged and removed */
  copies: number;
}

let lastError: string | null = null;
let lastResult: SyncResult | null = null;

/**
 * Sync now. `data` is the caller's in-memory vault: it is replaced, in place, by the merged result,
 * so the desktop backend and the CLI keep working with the same object.
 */
export async function syncNow(key: Uint8Array, data: VaultData): Promise<SyncResult> {
  const folder = syncFolder();
  if (!folder) throw new SyncError(t("sync.off"));
  if (!fs.existsSync(folder)) throw new SyncError(t("sync.folderGone", { folder }));
  try {
    const result = await withLock(folder, async () => {
      const salt = store.header().kdf.salt;
      // This computer's vault as it is on disk now
      let merged = (await store.unlockWithKey(key)).data;
      const lastSync = merged.sync?.lastSync;
      let conflicts = 0;
      const sources = [syncPath(folder), ...conflictCopies(folder)].filter((f) => fs.existsSync(f));
      const merged_copies: string[] = [];
      for (const file of sources) {
        const sealed = readSealed(file);
        if (sealed.kdf.salt !== salt) {
          if (file === syncPath(folder)) throw new SyncError(t("sync.otherVault"));
          continue; // a stray file from another vault: leave it alone
        }
        const remote = store.normalize(await open<Partial<VaultData>>(key, sealed));
        const m = merge(merged, remote, lastSync);
        merged = m.data;
        conflicts += m.conflicts;
        if (file !== syncPath(folder)) merged_copies.push(file);
      }
      const at = new Date().toISOString();
      merged.sync = { ...merged.sync, lastSync: at };
      await store.saveQuiet(key, merged);
      await writeSynced(folder, key, merged);
      for (const f of merged_copies) fs.rmSync(f, { force: true });
      for (const k of Object.keys(data)) delete (data as unknown as Record<string, unknown>)[k];
      Object.assign(data, merged);
      return { at, conflicts, copies: merged_copies.length };
    });
    lastError = null;
    lastResult = result;
    return result;
  } catch (e) {
    lastError = (e as Error).message;
    throw e;
  }
}

/** After every save, if a folder is configured. Failures are kept for the status, never thrown into the save. */
export function enableAutoSync(): void {
  store.setAfterSave(async (key, data) => {
    if (!syncFolder()) return;
    await syncNow(key, data).catch(() => {});
  });
}

export interface SyncStatus {
  folder: string | null;
  lastSync: string | null;
  error: string | null;
  conflicts: number;
}

export function syncStatus(data?: VaultData): SyncStatus {
  return { folder: syncFolder(), lastSync: data?.sync?.lastSync ?? lastResult?.at ?? null, error: lastError, conflicts: lastResult?.conflicts ?? 0 };
}

/** Modification times of the folder's file and this computer's vault — the backend polls these to sync on change */
export function fingerprint(): string {
  const folder = syncFolder();
  const m = (f: string) => {
    try {
      return String(fs.statSync(f).mtimeMs);
    } catch {
      return "-";
    }
  };
  return folder ? [m(syncPath(folder)), m(store.VAULT), ...conflictCopies(folder).map(m)].join("|") : "";
}

export interface LinkResult {
  /** "created": the folder had no vault, this one went there · "merged": same vault, synced · "joined": another vault, now shared */
  mode: "created" | "merged" | "joined";
  /** joined: this computer's new key — the caller replaces its session key (and re-remembers it) */
  key?: Uint8Array;
  result: SyncResult;
}

/**
 * Start syncing with a folder. If the folder already holds another vault (another computer's), `password` is that
 * vault's master password: this computer's items are merged into it, and from then on this computer uses that vault's
 * master password too — the synced vault has one password everywhere.
 */
export async function link(folder: string, key: Uint8Array, data: VaultData, password?: string): Promise<LinkResult> {
  let st: fs.Stats;
  try {
    st = fs.statSync(folder);
  } catch {
    throw new SyncError(t("sync.folderGone", { folder }));
  }
  if (!st.isDirectory()) throw new SyncError(t("sync.notFolder", { folder }));
  const file = syncPath(folder);
  if (!fs.existsSync(file)) {
    setSyncFolder(folder);
    return { mode: "created", result: await syncNow(key, data) };
  }
  const sealed = readSealed(file);
  if (sealed.kdf.salt === store.header().kdf.salt) {
    setSyncFolder(folder);
    return { mode: "merged", result: await syncNow(key, data) };
  }
  if (!password) throw new SyncError("sync.needPassword");
  const theirKey = await deriveKey(password, sealed.kdf);
  let theirs: VaultData;
  try {
    theirs = store.normalize(await open<Partial<VaultData>>(theirKey, sealed));
  } catch (e) {
    await wipe(theirKey);
    throw e;
  }
  // Everything from this computer goes into the shared vault; nothing here is lost (vault.kv.bak keeps the old file)
  const mine = (await store.unlockWithKey(key)).data;
  const { data: merged } = merge(theirs, mine);
  await store.saveAs({ v: sealed.v, kdf: sealed.kdf }, theirKey, merged);
  setSyncFolder(folder);
  const result = await syncNow(theirKey, data);
  return { mode: "joined", key: theirKey, result };
}

export function unlink(): void {
  setSyncFolder(null);
  lastError = null;
  lastResult = null;
}
