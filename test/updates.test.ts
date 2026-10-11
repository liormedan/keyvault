import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

// Temporary KV_HOME — never the real config.json
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "kv-updates-"));
process.env.KV_HOME = HOME;
delete process.env.KV_NO_UPDATE_CHECK;
const { setUpdates, updatesEnabled } = await import("../src/updates.ts");
const { manifest } = await import("../scripts/updater-manifest.mjs");

test("update check: on by default, KV_NO_UPDATE_CHECK makes the default off, the saved choice wins over both", () => {
  assert.equal(updatesEnabled(), true);
  process.env.KV_NO_UPDATE_CHECK = "1";
  assert.equal(updatesEnabled(), false);
  setUpdates(true);
  assert.equal(updatesEnabled(), true);
  delete process.env.KV_NO_UPDATE_CHECK;
  setUpdates(false);
  assert.equal(updatesEnabled(), false);
  fs.writeFileSync(path.join(HOME, "config.json"), JSON.stringify({ lang: "he" }));
  setUpdates(true);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(HOME, "config.json"), "utf8")), { lang: "he", updates: true }, "keeps the other settings");
});

test("latest.json: one entry per signed installer, URLs on this tag's release", () => {
  const files = [
    "kv-vault_0.11.0_x64-setup.exe",
    "kv-vault_0.11.0_x64-setup.exe.sig",
    "kv-vault_0.11.0_amd64.AppImage",
    "kv-vault_0.11.0_amd64.AppImage.sig",
    "kv-vault_0.11.0_amd64.deb",
    "kv-vault.tgz",
  ];
  const m = manifest(files, (f: string) => `sig of ${f}\n`, "v0.11.0", "notes", new Date("2026-10-11T00:00:00Z"));
  assert.equal(m.version, "0.11.0");
  assert.equal(m.pub_date, "2026-10-11T00:00:00.000Z");
  assert.deepEqual(Object.keys(m.platforms).sort(), ["linux-x86_64", "windows-x86_64"]);
  assert.equal(m.platforms["windows-x86_64"].signature, "sig of kv-vault_0.11.0_x64-setup.exe.sig");
  assert.equal(m.platforms["linux-x86_64"].url, "https://github.com/liormedan/kv-vault/releases/download/v0.11.0/kv-vault_0.11.0_amd64.AppImage");
});

test("latest.json: an installer without its signature, or no installer at all, fails the release", () => {
  assert.throws(() => manifest(["kv-vault_0.11.0_x64-setup.exe"], () => "", "v0.11.0"), /no kv-vault_0\.11\.0_x64-setup\.exe\.sig/);
  assert.throws(() => manifest(["kv-vault.tgz"], () => "", "v0.11.0"), /no updatable installer/);
});
