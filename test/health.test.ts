import assert from "node:assert/strict";
import { test } from "node:test";
import { breachReport, countIn } from "../src/breach.ts";
import { healthReport, weakness } from "../src/health.ts";
import type { VaultData } from "../src/model.ts";
import { saveItem } from "../src/store.ts";

// In-memory vault data only — no file, no network. All passwords here are made up.
function vault(): VaultData {
  const data: VaultData = { created: new Date().toISOString(), projects: {}, items: {}, deleted: {} };
  const add = (type: "login" | "wifi" | "card", title: string, fields: Record<string, string>) => saveItem(data, { type, title, fields });
  add("login", "Mail", { url: "https://mail.example", username: "dana", password: "shared-Pass-2024!" });
  add("login", "Shop", { url: "https://shop.example", username: "dana", password: "shared-Pass-2024!" });
  add("wifi", "Home Wi-Fi", { ssid: "home", password: "shared-Pass-2024!" });
  add("login", "Forum", { url: "https://forum.example", password: "qwerty" });
  add("login", "Bank", { url: "https://bank.example", password: "a-Strong-one-9!x", totp: "JBSWY3DPEHPK3PXP" });
  add("login", "Old site", { url: "https://old.example", password: "another-Strong-7?q" });
  add("card", "Visa", { number: "4111111111111111", cvv: "123" });
  const old = Object.values(data.items).find((i) => i.title === "Old site")!;
  old.updated = "2020-01-01T00:00:00.000Z";
  return data;
}

test("weakness: common, repeated, short, digits only, letters only", () => {
  assert.equal(weakness("Password1"), "common");
  assert.equal(weakness("aaaaaaaaaaaa"), "repeated");
  assert.equal(weakness("aB3$x"), "short");
  assert.equal(weakness("0547382675"), "digits");
  assert.equal(weakness("Sunflowerz"), "letters");
  assert.equal(weakness("סיסמהארוכה"), "letters", "letters in any script");
  assert.equal(weakness("correct-Horse-7"), null);
  assert.equal(weakness("onlyletterslongenough"), null, "12+ letters is a passphrase, not weak");
});

test("health report: reused groups, weak, old, no two-factor — names only", () => {
  const r = healthReport(vault());
  assert.equal(r.checked, 6, "logins and Wi-Fi with a password; the card has none");
  assert.deepEqual(
    r.reused.map((g) => g.map((i) => i.title)),
    [["Home Wi-Fi", "Mail", "Shop"]],
  );
  assert.deepEqual(
    r.weak.map((w) => [w.item.title, w.reason]),
    [["Forum", "common"]],
  );
  assert.deepEqual(
    r.old.map((i) => i.title),
    ["Old site"],
  );
  assert.deepEqual(
    r.no2fa.map((i) => i.title),
    ["Forum", "Mail", "Old site", "Shop"],
    "logins only, and Bank has a key",
  );
  const json = JSON.stringify(r);
  for (const secret of ["shared-Pass-2024!", "qwerty", "a-Strong-one-9!x", "JBSWY3DPEHPK3PXP", "4111111111111111"]) {
    assert.ok(!json.includes(secret), `no ${secret} in the report`);
  }
});

test("breach check: only 5-character prefixes go out, one request per prefix, counts matched here", async () => {
  const data = vault();
  const sha1 = (s: string) => (globalThis as { crypto: Crypto }).crypto.subtle.digest("SHA-1", new TextEncoder().encode(s));
  const hex = async (s: string) =>
    Buffer.from(await sha1(s))
      .toString("hex")
      .toUpperCase();
  const breached = await hex("qwerty");
  const asked: string[] = [];
  const fake = async (prefix: string) => {
    asked.push(prefix);
    // A real range: other suffixes, a padding line with count 0, and ours when it is the breached prefix
    const lines = ["0018A45C4D1DEF81644B54AB7F969B88D65:1", "00000000000000000000000000000000000:0"];
    if (prefix === breached.slice(0, 5)) lines.push(`${breached.slice(5)}:10434004`);
    return lines.join("\r\n");
  };
  const r = await breachReport(data, fake);
  assert.equal(r.checked, 4, "distinct passwords");
  assert.equal(asked.length, new Set(asked).size, "each prefix fetched once");
  assert.ok(
    asked.every((p) => /^[0-9A-F]{5}$/.test(p)),
    "only prefixes leave",
  );
  assert.deepEqual(
    r.found.map((f) => [f.count, f.items.map((i) => i.title)]),
    [[10434004, ["Forum"]]],
  );
  assert.equal(countIn("ABC:0\nDEF:3", "ABC"), 0, "padding entries count as not found");
});

test("breach check: a network failure is an error, not a clean result", async () => {
  await assert.rejects(
    breachReport(vault(), async () => {
      throw new Error("Could not reach api.pwnedpasswords.com (offline)");
    }),
    /Could not reach/,
  );
});
