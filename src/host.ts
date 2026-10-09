// The native messaging host: the browser starts this process for the kv-vault extension and talks to it over
// stdin/stdout (src/native-messaging.ts). No port, no network.
//
// What it will do is narrow on purpose:
//   - only for the kv-vault extension (the caller's origin is checked against src/browser-ids.ts)
//   - only while the user has turned the extension on (config.json `browser: true`)
//   - only logins for the page's own site (src/site.ts) — there is no "list everything" call
//   - it keeps the derived key, never the data: each request re-reads the vault, so a save never overwrites
//     a change the desktop app or the CLI made meanwhile
//   - it exits after 5 idle minutes, which also forgets the key
// Errors are short codes; the extension shows them in the user's language.
import { browserEnabled } from "./browser-setup.ts";
import { ALLOWED_CALLERS } from "./browser-ids.ts";
import { randomPassword, wipe } from "./crypto.ts";
import { getLang } from "./i18n.ts";
import type { Item, VaultData } from "./model.ts";
import { Decoder, encode } from "./native-messaging.ts";
import { copyWithClear } from "./io.ts";
import * as remember from "./remember.ts";
import { hostOf, sameSite } from "./site.ts";
import * as store from "./store.ts";
import { totp } from "./totp.ts";
import { enableAutoSync } from "./sync.ts";

const IDLE_MS = 5 * 60 * 1000;

export class HostError extends Error {}
function fail(code: string): never {
  throw new HostError(code);
}

let key: Uint8Array | null = null;

async function data(): Promise<VaultData> {
  if (!key) fail("locked");
  return (await store.unlockWithKey(key)).data;
}

const str = (v: unknown, max = 4096): string => {
  const s = String(v ?? "");
  if (s.length > max) fail("too-long");
  return s;
};

/** The login, if it exists and belongs to this page's site — otherwise "not-found", whichever the reason */
function loginFor(d: VaultData, id: unknown, url: string): Item {
  const it = d.items[str(id, 64)];
  if (it?.type !== "login" || !it.fields.password || !sameSite(it.fields.url || "", url)) fail("not-found");
  return it;
}

const sameUser = (a: string | undefined, b: string) => (a || "").trim().toLowerCase() === b.trim().toLowerCase();

type Params = Record<string, unknown>;

const methods: Record<string, (p: Params) => unknown> = {
  status: () => ({ exists: store.exists(), enabled: browserEnabled(), unlocked: !!key, remembered: remember.remembered(), lang: getLang() }),

  async unlock({ password }) {
    if (!store.exists()) fail("no-vault");
    if (password) {
      try {
        key = (await store.unlockWithPassword(str(password))).key;
      } catch {
        fail("wrong-password");
      }
      return { ok: true };
    }
    const cached = await remember.recall(store.salt());
    if (!cached) fail("locked");
    try {
      await store.unlockWithKey(cached);
    } catch {
      fail("locked");
    }
    key = cached;
    return { ok: true };
  },

  lock() {
    if (key) void wipe(key);
    key = null;
    return { ok: true };
  },

  async logins({ url }) {
    const page = str(url);
    const d = await data();
    const logins = Object.values(d.items)
      .filter((it) => it.type === "login" && it.fields.password && sameSite(it.fields.url || "", page))
      .map((it) => ({ id: it.id, title: it.title, username: it.fields.username || "", totp: !!it.fields.totp, fav: !!it.fav }))
      .sort((a, b) => Number(b.fav) - Number(a.fav) || a.title.localeCompare(b.title));
    return { logins, host: hostOf(page) };
  },

  async fill({ id, url }) {
    const it = loginFor(await data(), id, str(url));
    return { username: it.fields.username || "", password: it.fields.password! };
  },

  async copy({ id, url, field }) {
    const it = loginFor(await data(), id, str(url));
    const f = str(field, 16);
    const value = f === "totp" ? (it.fields.totp ? totp(it.fields.totp).code : fail("not-found")) : f === "username" ? it.fields.username : it.fields.password;
    if (!value) fail("not-found");
    copyWithClear(value!, 20);
    return { ok: true };
  },

  /** What saving these credentials would do: nothing ("same"), change a password ("update"), or add a login ("new") */
  async check({ url, username, password }) {
    const page = str(url);
    const user = str(username);
    const pw = str(password);
    const d = await data();
    const mine = Object.values(d.items).filter((it) => it.type === "login" && sameSite(it.fields.url || "", page) && sameUser(it.fields.username, user));
    if (mine.some((it) => it.fields.password === pw)) return { status: "same" };
    return mine.length ? { status: "update", id: mine[0]!.id, title: mine[0]!.title } : { status: "new" };
  },

  async save({ url, username, password, title }) {
    const page = str(url);
    const pw = str(password);
    if (!pw || !/^https?:/i.test(page)) fail("invalid");
    const user = str(username);
    const s = await store.unlockWithKey(key ?? fail("locked"));
    const existing = Object.values(s.data.items).find((it) => it.type === "login" && sameSite(it.fields.url || "", page) && sameUser(it.fields.username, user));
    const origin = new URL(page).origin;
    const id = existing
      ? store.saveItem(s.data, { id: existing.id, title: existing.title, fields: { ...existing.fields, password: pw } })
      : store.saveItem(s.data, { type: "login", title: str(title, 200).trim() || hostOf(page), fields: { url: origin, username: user, password: pw } });
    await store.save(key!, s.data);
    return { id, updated: !!existing };
  },

  /** A new password straight to the clipboard (cleared after 20 s) — it never passes through the browser */
  async copyGenerated({ length }) {
    copyWithClear(await randomPassword(Number(length) || 20), 20);
    return { ok: true };
  },
};

// ── The process ──

export function allowedCaller(args: readonly string[]): boolean {
  return args.some((a) => ALLOWED_CALLERS.includes(a));
}

/** One request → one reply. Exported for tests. */
export async function handle(req: { id?: unknown; method?: unknown; params?: unknown }): Promise<Record<string, unknown>> {
  const id = req.id ?? null;
  try {
    const name = String(req.method);
    if (!Object.hasOwn(methods, name)) fail("unknown");
    if (name !== "status" && !browserEnabled()) fail("disabled");
    const result = await methods[name]!((req.params ?? {}) as Params);
    return { id, result };
  } catch (e) {
    return { id, error: e instanceof HostError ? e.message : "failed" };
  }
}

function main(): void {
  if (!allowedCaller(process.argv.slice(2))) process.exit(1);
  const decoder = new Decoder();
  let idle: NodeJS.Timeout | undefined;
  const bump = () => {
    clearTimeout(idle);
    idle = setTimeout(() => process.exit(0), IDLE_MS);
  };
  bump();
  let queue = Promise.resolve();
  process.stdin.on("data", (chunk: Buffer) => {
    let messages: unknown[];
    try {
      messages = decoder.push(chunk);
    } catch {
      process.exit(1); // a malformed or oversized frame: not our extension
    }
    for (const m of messages) {
      queue = queue.then(async () => {
        bump();
        process.stdout.write(encode(await handle(m as Record<string, unknown>)));
      });
    }
  });
  // The browser closed the port: finish a save in flight, forget the key, exit
  process.stdin.on("end", () => {
    queue.finally(() => {
      if (key) void wipe(key);
      process.exit(0);
    });
  });
}

enableAutoSync();
if (process.env.KV_HOST_NO_MAIN !== "1") main();
