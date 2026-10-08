// The contract between the desktop window and the backend (src/backend.js).
// One JSON line per request on stdin, one per reply on stdout. Both sides type against this file,
// so a wrong method name or a missing parameter fails at compile time instead of at runtime.
import type { BreachReport, Fields, HealthReport, ItemTypeName, Lang, ListedDevKey, ListedItem, MaskedItem, TypeDef } from "./model.ts";
import type { BrowserStatus } from "./browser-setup.ts";
import type { TotpCode } from "./totp.ts";

/** The error string for "the vault is locked" — the window shows the unlock screen on it */
export const LOCKED = "locked";

type None = Record<string, never>;
type Ok = { ok: true };
type DevRef = { p: string; k: string };
type FieldRef = { id: string; k: string };

export interface Status {
  exists: boolean;
  unlocked: boolean;
  remembered: boolean;
  rememberSupported: boolean;
  vault: string;
}

export interface ImportResult {
  /** "CSV", "1Password", "Bitwarden" or "KeePass" */
  format: string;
  added: number;
  duplicates: number;
  /** entries with nothing to keep, or too large for the vault */
  skipped: number;
  /** the file's base name, for the "delete it now" prompt */
  file: string;
}

export interface Methods {
  setLang: { params: { lang: Lang }; result: { lang: Lang } };
  status: { params: None; result: Status };
  init: { params: { password: string }; result: Ok };
  /** without a password: unlock with the remembered (DPAPI) key */
  unlock: { params: { password?: string; remember?: boolean }; result: Ok };
  lock: { params: None; result: Ok };
  forget: { params: None; result: Ok };

  // dev keys
  list: { params: None; result: { projects: Record<string, ListedDevKey[]> } };
  value: { params: DevRef; result: { value: string } };
  copy: { params: DevRef; result: Ok };
  set: { params: DevRef & { value: string; note?: string }; result: Ok };
  delete: { params: DevRef; result: Ok };

  // typed items
  types: { params: None; result: { types: Record<ItemTypeName, TypeDef> } };
  items: { params: None; result: { items: ListedItem[] } };
  item: { params: { id: string }; result: { item: MaskedItem } };
  itemValue: { params: FieldRef; result: { value: string } };
  itemCopy: { params: FieldRef; result: Ok };
  /** without id: create. With id: replace the fields (the type never changes) */
  itemSave: { params: { id?: string; type: ItemTypeName; title: string; fields: Fields }; result: { id: string } };
  itemFav: { params: { id: string; fav: boolean }; result: Ok };
  itemDelete: { params: { id: string }; result: Ok };
  /** the current two-factor code of an item with a `totp` field */
  itemTotp: { params: { id: string }; result: TotpCode };
  itemTotpCopy: { params: { id: string }; result: Ok };

  // password health — names only
  health: { params: None; result: HealthReport };
  /** network: sends the first 5 hex characters of each password's SHA-1 to api.pwnedpasswords.com */
  breaches: { params: None; result: BreachReport };

  // import from a browser or password-manager export — only the path crosses the window
  importFile: { params: { path: string }; result: ImportResult };
  importCleanup: { params: None; result: Ok };

  /** emergency export to a new file: with a password, or without one to get a generated recovery code (shown once) */
  exportVault: { params: { path: string; password?: string }; result: { code?: string } };

  generate: { params: { length?: number; symbols?: boolean }; result: { value: string } };

  // the browser extension's link to this computer — off until the user turns it on
  browserStatus: { params: None; result: BrowserStatus };
  browserEnable: { params: None; result: BrowserStatus };
  browserDisable: { params: None; result: BrowserStatus };
}

export type Method = keyof Methods;
export type Params<M extends Method> = Methods[M]["params"];
export type Result<M extends Method> = Methods[M]["result"];

export interface Request<M extends Method = Method> {
  id: number;
  method: M;
  params: Params<M>;
}

export type Reply = { id: number | null; result: unknown } | { id: number | null; error: string };

/** The backend's implementation must match this exactly (`satisfies Handlers`) */
export type Handlers = { [M in Method]: (params: Params<M>) => Result<M> | Promise<Result<M>> };
