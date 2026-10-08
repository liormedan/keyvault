// Password health: reused, weak and old passwords, and logins without two-factor.
// Computed in memory from the open vault; the report carries listed items (names) only, never a value.
import { createHash } from "node:crypto";
import type { HealthReport, Item, ItemTypeName, ListedItem, VaultData, Weakness } from "./model.ts";
import { listItems } from "./store.ts";

/** The item types whose `password` field is a password someone chose */
const WITH_PASSWORD: ReadonlySet<ItemTypeName> = new Set(["login", "bank", "wifi", "server"]);

const COMMON = new Set(
  (
    "123456 1234567 12345678 123456789 1234567890 12345 1234 111111 000000 123123 654321 666666 121212 112233 " +
    "password password1 password123 passw0rd p@ssw0rd qwerty qwerty123 qwertyuiop asdfgh asdfghjkl zxcvbnm " +
    "1q2w3e4r 1q2w3e4r5t 1qaz2wsx zaq12wsx abc123 abcd1234 iloveyou admin admin123 root letmein welcome " +
    "monkey dragon football baseball sunshine princess master shadow superman trustno1 secret changeme"
  ).split(" "),
);

export function weakness(password: string): Weakness | null {
  if (COMMON.has(password.toLowerCase())) return "common";
  if (/^(.)\1+$/s.test(password)) return "repeated";
  if ([...password].length < 8) return "short";
  if (/^\d+$/.test(password)) return "digits";
  if (/^\p{L}+$/u.test(password) && [...password].length < 12) return "letters";
  return null;
}

export const passwordOf = (it: Item): string | undefined => (WITH_PASSWORD.has(it.type) ? it.fields.password || undefined : undefined);

const YEAR_MS = 365 * 86_400_000;

export function healthReport(data: VaultData, now: number = Date.now()): HealthReport {
  const listed = new Map<string, ListedItem>(listItems(data).map((l) => [l.id, l]));
  const byPassword = new Map<string, ListedItem[]>();
  const weak: HealthReport["weak"] = [];
  const old: ListedItem[] = [];
  let checked = 0;
  for (const it of Object.values(data.items)) {
    const pw = passwordOf(it);
    if (!pw) continue;
    checked++;
    const l = listed.get(it.id)!;
    // Grouped by a hash so the map's keys aren't the passwords themselves
    const h = createHash("sha256").update(pw).digest("base64");
    byPassword.set(h, [...(byPassword.get(h) ?? []), l]);
    const reason = weakness(pw);
    if (reason) weak.push({ item: l, reason });
    if (now - Date.parse(it.updated) > YEAR_MS) old.push(l);
  }
  const byTitle = (a: ListedItem, b: ListedItem) => a.title.localeCompare(b.title, "he");
  const reused = [...byPassword.values()].filter((g) => g.length > 1).map((g) => g.sort(byTitle));
  reused.sort((a, b) => b.length - a.length || byTitle(a[0]!, b[0]!));
  const no2fa = Object.values(data.items)
    .filter((it) => it.type === "login" && it.fields.password && !it.fields.totp)
    .map((it) => listed.get(it.id)!)
    .sort(byTitle);
  return { checked, reused, weak: weak.sort((a, b) => byTitle(a.item, b.item)), old: old.sort(byTitle), no2fa };
}
