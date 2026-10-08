// Known-breach check against Have I Been Pwned's Pwned Passwords (k-anonymity range API).
// Only the first 5 hex characters of each password's SHA-1 leave the machine; the match happens here.
// Runs only when the user asks (a button in the window, `kv audit --breaches`) — never in the background.
// SHA-1 comes from node:crypto because that is the API's format; it is a lookup key, not vault crypto.
import { createHash } from "node:crypto";
import { t } from "./i18n.ts";
import type { BreachReport, ListedItem, VaultData } from "./model.ts";
import { passwordOf } from "./health.ts";
import { listItems } from "./store.ts";

/** Fetches one range: the response body for a 5-character SHA-1 prefix */
export type RangeFetcher = (prefix: string) => Promise<string>;

export const pwnedRange: RangeFetcher = async (prefix) => {
  let res: Response;
  try {
    res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      // Padding makes every response about the same size, so its length says nothing about the prefix
      headers: { "Add-Padding": "true", "User-Agent": "kv-vault" },
      signal: AbortSignal.timeout(15_000),
    });
  } catch (e) {
    throw new Error(t("breach.failed", { reason: (e as Error).message }));
  }
  if (!res.ok) throw new Error(t("breach.failed", { reason: `HTTP ${res.status}` }));
  return res.text();
};

/** How many times the range says this suffix was seen (0 = not found; padding lines have count 0) */
export function countIn(range: string, suffix: string): number {
  for (const line of range.split(/\r?\n/)) {
    const [s, n] = line.split(":");
    if (s?.trim().toUpperCase() === suffix) return Number(n) || 0;
  }
  return 0;
}

export async function breachReport(data: VaultData, fetchRange: RangeFetcher = pwnedRange): Promise<BreachReport> {
  const listed = new Map<string, ListedItem>(listItems(data).map((l) => [l.id, l]));
  const byHash = new Map<string, ListedItem[]>();
  for (const it of Object.values(data.items)) {
    const pw = passwordOf(it);
    if (!pw) continue;
    const h = createHash("sha1").update(pw).digest("hex").toUpperCase();
    byHash.set(h, [...(byHash.get(h) ?? []), listed.get(it.id)!]);
  }
  const ranges = new Map<string, Promise<string>>();
  const found: BreachReport["found"] = [];
  for (const [h, items] of byHash) {
    const prefix = h.slice(0, 5);
    if (!ranges.has(prefix)) ranges.set(prefix, fetchRange(prefix));
    const count = countIn(await ranges.get(prefix)!, h.slice(5));
    if (count > 0) found.push({ count, items });
  }
  found.sort((a, b) => b.count - a.count);
  return { checked: byHash.size, found };
}
