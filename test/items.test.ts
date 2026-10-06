import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

// Temporary vault — never the real one
process.env.KV_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "kv-items-"));
const store = await import("../src/store.ts");
const { randomPassword } = await import("../src/crypto.ts");
const { TYPES } = await import("../src/types.ts");
const PW = "items test";

test("a vault without items opens and gets an empty items map", async () => {
  const { key, data } = await store.create(PW);
  delete (data as Partial<typeof data>).items; // like a vault from before typed items
  store.setEntry(data, "proj", "API", "v");
  await store.save(key, data);
  const opened = await store.unlockWithPassword(PW);
  assert.deepEqual(opened.data.items, {});
  assert.equal(store.getEntry(opened.data, "proj", "API").value, "v", "dev keys kept");
});

test("items: save, secrets masked in list and item, update, favorite, delete", async () => {
  const { key, data } = await store.unlockWithPassword(PW);
  const id = store.saveItem(data, {
    type: "card",
    title: "ויזה",
    fields: { cardholder: "Lior", number: "4580 1234 5678 9012", cvv: "123", expiry: "08/29", bogus: "x" },
  });
  await store.save(key, data);

  const raw = fs.readFileSync(store.VAULT, "utf8");
  assert.ok(!raw.includes("9012") && !raw.includes("ויזה"), "שום דבר לא בטקסט גלוי בקובץ");

  const { data: d2, key: k2 } = await store.unlockWithPassword(PW);
  const [row] = store.listItems(d2);
  assert.equal(row.sub, "•••• 9012 · 08/29", "subtitle: last 4 digits and expiry only");
  assert.deepEqual(Object.keys(row).sort(), ["fav", "id", "sub", "title", "type", "updated"], "the listing carries no fields");

  const masked = store.maskedItem(d2, id);
  assert.deepEqual(masked.fields.number, { secret: true });
  assert.deepEqual(masked.fields.cvv, { secret: true });
  assert.equal(masked.fields.cardholder, "Lior");
  assert.equal(masked.fields.bogus, undefined, "unknown fields are dropped");
  assert.equal(store.itemValue(d2, id, "cvv"), "123");

  store.saveItem(d2, { id, type: "login", title: "ויזה זהב", fields: { number: "4580 1234 5678 9999" } });
  assert.equal(store.getItem(d2, id).type, "card", "type does not change on update");
  assert.equal(store.getItem(d2, id).fields.cvv, undefined, "update replaces all fields");
  store.setFav(d2, id, true);
  assert.equal(store.listItems(d2)[0].fav, true);

  assert.throws(() => store.saveItem(d2, { type: "nope", title: "x" }), /Unknown type/);
  assert.throws(() => store.saveItem(d2, { type: "note", title: "  " }), /Title is required/);
  store.deleteItem(d2, id);
  await store.save(k2, d2);
  assert.deepEqual((await store.unlockWithPassword(PW)).data.items, {});
});

test("every type has an existing primary field and marked secrets", () => {
  for (const [name, t] of Object.entries(TYPES)) {
    assert.ok(
      t.fields.some((f) => f.k === t.primary),
      `${name}: primary`,
    );
    assert.ok(
      t.fields.some((f) => f.secret),
      `${name}: has a secret field`,
    );
  }
});

test("password generator: length, character sets, no symbols", async () => {
  const a = await randomPassword(24);
  assert.equal(a.length, 24);
  assert.match(a, /[a-z]/);
  assert.match(a, /[A-Z]/);
  assert.match(a, /[0-9]/);
  assert.match(a, /[!@#$%^&*\-_=+?]/);
  assert.match(await randomPassword(16, { symbols: false }), /^[A-Za-z0-9]{16}$/);
  assert.equal((await randomPassword(2)).length, 8, "minimum 8");
  assert.notEqual(await randomPassword(20), await randomPassword(20));
});
