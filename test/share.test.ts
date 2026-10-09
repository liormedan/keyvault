import assert from "node:assert/strict";
import { test } from "node:test";
import type { VaultData } from "../src/model.ts";
import { ensureIdentity, makeShare, openShare, parseShareKey, shareKeyOf } from "../src/share.ts";

const empty = (): VaultData => ({ created: "", projects: {}, items: {}, deleted: {} });

test("sharing key: made once, printable, checksummed", async () => {
  const v = empty();
  assert.deepEqual(await ensureIdentity(v), { created: true });
  assert.deepEqual(await ensureIdentity(v), { created: false });
  const key = await shareKeyOf(v.identity!.publicKey);
  assert.match(key, /^kvpk1\.[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{4}$/);
  assert.equal((await parseShareKey(` ${key.slice(0, 20)}\n${key.slice(20)} `)).length, 32, "line breaks from a chat app are fine");
  const typo = key.slice(0, 10) + (key[10] === "A" ? "B" : "A") + key.slice(11);
  await assert.rejects(parseShareKey(typo), /isn't a kv-vault sharing key/);
  await assert.rejects(parseShareKey(key.slice(0, -2)), /isn't a kv-vault sharing key/);
});

test("share: only the recipient's vault opens it; the file carries no plaintext", async () => {
  const dana = empty();
  const noa = empty();
  await ensureIdentity(dana);
  await ensureIdentity(noa);
  const toNoa = await shareKeyOf(noa.identity!.publicKey);
  const file = await makeShare(
    toNoa,
    [{ type: "login", title: "Router", fields: { url: "http://192.168.1.1", username: "admin", password: "share-secret-1" } }],
    [{ project: "app", key: "API_KEY", value: "share-secret-2", note: "staging" }],
  );
  assert.ok(!file.includes("share-secret") && !file.includes("Router"));
  const got = await openShare(file, noa.identity);
  assert.equal(got.items[0]!.fields.password, "share-secret-1");
  assert.deepEqual(got.dev, [{ project: "app", key: "API_KEY", value: "share-secret-2", note: "staging" }]);
  await assert.rejects(openShare(file, dana.identity), /made for someone else/);
  await assert.rejects(openShare(file, undefined), /made for someone else/);
  await assert.rejects(openShare("{}", noa.identity), /Not a kv-vault share file/);
});

test("share: what a vault can't hold is dropped (the sender is anonymous)", async () => {
  const noa = empty();
  await ensureIdentity(noa);
  const file = await makeShare(
    await shareKeyOf(noa.identity!.publicKey),
    [
      // a hostile sender can put anything here
      { type: "rocket" as unknown as "note", title: "x", fields: {} },
      { type: "note", title: "ok", fields: { body: "hi" } },
    ],
    [{ project: "a/b", key: "K", value: "v", note: "" }],
  );
  const got = await openShare(file, noa.identity);
  assert.deepEqual(
    got.items.map((i) => i.title),
    ["ok"],
  );
  assert.deepEqual(got.dev, []);
});
