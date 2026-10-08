import assert from "node:assert/strict";
import { test } from "node:test";
import { CHROME_ID, EXTENSION_KEY, extensionId } from "../src/browser-ids.ts";
import { Decoder, encode, MAX_IN } from "../src/native-messaging.ts";
import { sameSite, siteOf } from "../src/site.ts";

test("siteOf: the registrable domain, with two-label suffixes", () => {
  assert.equal(siteOf("mail.google.com"), "google.com");
  assert.equal(siteOf("accounts.google.com."), "google.com");
  assert.equal(siteOf("www.bank.co.il"), "bank.co.il");
  assert.equal(siteOf("e-services.clalit.co.il"), "clalit.co.il");
  assert.equal(siteOf("preview-abc.vusercontent.net"), "preview-abc.vusercontent.net", "hosting platforms: each subdomain is its own site");
  assert.equal(siteOf("liormedan.github.io"), "liormedan.github.io");
  assert.equal(siteOf("localhost"), "localhost");
  assert.equal(siteOf("192.168.1.1"), "192.168.1.1");
});

test("sameSite: subdomains of one site match; look-alikes and downgrades don't", () => {
  assert.ok(sameSite("https://accounts.google.com/signin", "https://mail.google.com/"));
  assert.ok(sameSite("github.com", "https://github.com/login"), "a saved URL without a scheme counts as https");
  assert.ok(sameSite("http://192.168.1.1", "http://192.168.1.1/login.html"));
  assert.ok(sameSite("http://example.com", "https://example.com"), "an http login may fill on https");
  // phishing shapes
  assert.ok(!sameSite("https://accounts.google.com", "https://accounts.google.com.evil.example/"));
  assert.ok(!sameSite("https://google.com", "https://google.com-login.example/"));
  assert.ok(!sameSite("https://paypal.com", "https://paypa1.com/"));
  assert.ok(!sameSite("https://bank.co.il", "https://other.co.il/"), "co.il is a suffix, not a site");
  assert.ok(!sameSite("https://a.vusercontent.net", "https://b.vusercontent.net/"));
  // downgrade and non-web
  assert.ok(!sameSite("https://example.com", "http://example.com/"), "never offer an https login to an http page");
  assert.ok(!sameSite("https://example.com", "file:///C:/example.com/index.html"));
  assert.ok(!sameSite("", "https://example.com/"));
  assert.ok(!sameSite("https://example.com", "javascript:alert(1)"));
});

test("native messaging framing: length-prefixed JSON, split anywhere, oversize refused", () => {
  const a = encode({ id: 1, method: "status" });
  const b = encode({ id: 2, method: "logins", params: { url: "https://example.com/ש" } });
  assert.equal(a.readUInt32LE(0), a.length - 4);
  const d = new Decoder();
  const all = Buffer.concat([a, b]);
  const got: unknown[] = [];
  for (let i = 0; i < all.length; i += 3) got.push(...d.push(all.subarray(i, i + 3)));
  assert.deepEqual(got, [
    { id: 1, method: "status" },
    { id: 2, method: "logins", params: { url: "https://example.com/ש" } },
  ]);
  const big = Buffer.alloc(4);
  big.writeUInt32LE(MAX_IN + 1, 0);
  assert.throws(() => new Decoder().push(big), /too large/);
});

test("the extension ID follows from the manifest key (Chrome's rule)", () => {
  assert.equal(extensionId(EXTENSION_KEY), "ncgcaedgegagaicjanjfjaiiaijnmdke");
  assert.equal(CHROME_ID, "ncgcaedgegagaicjanjfjaiiaijnmdke");
});
