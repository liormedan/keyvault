// Share items or dev keys with another person — no server, no account. The recipient gives you their sharing key
// (a public key, safe to send in any chat); kv-vault seals the items to it (libsodium sealed box) into a .kvshare file;
// you send the file however you like; only their vault can open it.
//
// Sharing key text:  kvpk1.<base64url of the 32-byte public key>.<4-char checksum>
// The checksum catches a mistyped or truncated key before anything is sealed to it.
// .kvshare file:     { kind: "kv-vault-share", v: 1, to: <fingerprint of the recipient key>, sealed: <base64> }
// Sealed payload:    { v: 1, at, items: [{ type, title, fields }], dev: [{ project, key, value, note }] }
import { newIdentity, openSealed, sealTo, shortHash } from "./crypto.ts";
import { t } from "./i18n.ts";
import type { ImportedItem, VaultData } from "./model.ts";
import { TYPES } from "./types.ts";

const PREFIX = "kvpk1";
const b64url = (u: Uint8Array) => Buffer.from(u).toString("base64url");

/** This vault's identity; made on first use — the caller saves the vault if `created` */
export async function ensureIdentity(data: VaultData): Promise<{ created: boolean }> {
  if (data.identity) return { created: false };
  data.identity = await newIdentity();
  return { created: true };
}

export async function shareKeyOf(publicKeyBase64: string): Promise<string> {
  const pk = new Uint8Array(Buffer.from(publicKeyBase64, "base64"));
  return `${PREFIX}.${b64url(pk)}.${b64url(await shortHash(pk, 3))}`;
}

export async function parseShareKey(text: string): Promise<Uint8Array> {
  const m = /^kvpk1\.([A-Za-z0-9_-]{43})\.([A-Za-z0-9_-]{4})$/.exec(text.trim().replace(/\s+/g, ""));
  if (!m) throw new Error(t("share.badKey"));
  const pk = new Uint8Array(Buffer.from(m[1]!, "base64url"));
  if (pk.length !== 32 || b64url(await shortHash(pk, 3)) !== m[2]) throw new Error(t("share.badKey"));
  return pk;
}

const fingerprint = async (pk: Uint8Array) => b64url(await shortHash(pk, 9));

export interface ShareDev {
  project: string;
  key: string;
  value: string;
  note: string;
}

export interface SharePayload {
  v: 1;
  at: string;
  items: ImportedItem[];
  dev: ShareDev[];
}

export async function makeShare(to: string, items: ImportedItem[], dev: ShareDev[] = []): Promise<string> {
  const pk = await parseShareKey(to);
  const payload: SharePayload = { v: 1, at: new Date().toISOString(), items, dev };
  const sealed = await sealTo(pk, new TextEncoder().encode(JSON.stringify(payload)));
  return `${JSON.stringify({ kind: "kv-vault-share", v: 1, to: await fingerprint(pk), sealed: Buffer.from(sealed).toString("base64") }, null, 1)}\n`;
}

/** Open a .kvshare file with this vault's identity. Throws a readable error if it isn't for this vault. */
export async function openShare(fileText: string, identity: VaultData["identity"]): Promise<SharePayload> {
  let file: { kind?: string; v?: number; to?: string; sealed?: string };
  try {
    file = JSON.parse(fileText);
  } catch {
    throw new Error(t("share.notShare"));
  }
  if (file.kind !== "kv-vault-share" || file.v !== 1 || typeof file.sealed !== "string") throw new Error(t("share.notShare"));
  if (!identity || file.to !== (await fingerprint(new Uint8Array(Buffer.from(identity.publicKey, "base64"))))) throw new Error(t("share.notForYou"));
  let payload: SharePayload;
  try {
    payload = JSON.parse(new TextDecoder().decode(await openSealed(identity, new Uint8Array(Buffer.from(file.sealed, "base64")))));
  } catch {
    throw new Error(t("share.notForYou"));
  }
  // The sender is anonymous: accept only what this vault can hold
  const items = (Array.isArray(payload.items) ? payload.items : []).filter(
    (i) => i && Object.hasOwn(TYPES, i.type) && typeof i.title === "string" && i.fields && typeof i.fields === "object",
  );
  const dev = (Array.isArray(payload.dev) ? payload.dev : []).filter(
    (d) => d && typeof d.project === "string" && typeof d.key === "string" && typeof d.value === "string" && d.project && d.key && !d.project.includes("/"),
  );
  return { v: 1, at: String(payload.at ?? ""), items, dev: dev.map((d) => ({ ...d, note: String(d.note ?? "") })) };
}
