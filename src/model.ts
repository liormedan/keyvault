// The data model, shared by the backend, the CLI and the window. Types only — nothing here runs.

export type Lang = "en" | "he";
export type Label = Record<Lang, string>;

// ── Vault file ──

export interface KdfParams {
  alg: "argon2id13";
  ops: number;
  mem: number;
  /** base64 (original variant) */
  salt: string;
}

/** The plain part of the file. Bound to the ciphertext as additional data. */
export interface VaultHeader {
  v: number;
  kdf: KdfParams;
}

export interface VaultFile extends VaultHeader {
  nonce: string;
  ct: string;
}

// ── Decrypted contents ──

export interface DevEntry {
  /** the default value — "" when the key only has per-environment values */
  value: string;
  note: string;
  updated: string;
  /** per-environment overrides (dev, staging, prod, …) — added in 0.4, absent in older vaults */
  envs?: Record<string, { value: string; updated: string }>;
}

export type ItemTypeName = "login" | "card" | "bank" | "identity" | "wifi" | "server" | "license" | "note";
export type Fields = Record<string, string>;

export interface Item {
  id: string;
  type: ItemTypeName;
  title: string;
  fields: Fields;
  fav: boolean;
  created: string;
  updated: string;
}

export interface VaultData {
  created: string;
  /** project → key name → entry */
  projects: Record<string, Record<string, DevEntry>>;
  /** id → item */
  items: Record<string, Item>;
}

// ── Item types (src/types.js) ──

export type FieldKind = "url" | "card" | "multiline";

export interface FieldDef {
  k: string;
  label: Label;
  /** never in listings; reaches the window only on reveal or edit */
  secret?: boolean;
  /** offer the password generator */
  generate?: boolean;
  kind?: FieldKind;
  /** left-to-right content (URLs, numbers, keys) */
  ltr?: boolean;
  placeholder?: string;
}

export interface TypeDef {
  label: Label;
  plural: Label;
  /** the field quick-copy copies */
  primary: string;
  fields: FieldDef[];
}

// ── What leaves the backend ──

/** A listed dev key — never the value */
export interface ListedDevKey {
  key: string;
  note: string;
  updated: string;
  /** names of the environments with their own value */
  envs?: string[];
}

/** A listed item — never any field */
export interface ListedItem {
  id: string;
  type: ItemTypeName;
  title: string;
  sub: string;
  fav: boolean;
  updated: string;
}

/** Secret fields are replaced by a marker */
export type MaskedField = string | { secret: true };

export interface MaskedItem extends Omit<Item, "fields"> {
  fields: Record<string, MaskedField>;
}

/** A login parsed from a browser export, before it becomes an item */
export interface ImportedLogin {
  title: string;
  fields: Fields;
}
