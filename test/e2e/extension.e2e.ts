// The browser extension end to end, in a real Chromium: the native host is registered (HKCU registry on Windows),
// the extension lists the vault's login for a local sign-in page, fills it, notices a new password being submitted,
// and saves it back to the vault.
//
// CI only (KV_TEST_BROWSER=1): it writes the native messaging registration for the current user, which a local
// test must never do. Needs `npm run build` (dist/host.js, dist/extension/chrome) and Playwright's Chromium
// (`npx playwright-core install chromium`) — branded Chrome and Edge ignore --load-extension.
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

if (process.env.KV_TEST_BROWSER !== "1") {
  console.log("skipped: set KV_TEST_BROWSER=1 (CI only — it registers the native host for this user)");
  process.exit(0);
}

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "kv-ext-e2e-"));
process.env.KV_HOME = HOME;
const store = await import("../../src/store.ts");
const remember = await import("../../src/remember.ts");
const setup = await import("../../src/browser-setup.ts");
const { CHROME_ID } = await import("../../src/browser-ids.ts");
const log = (...a: unknown[]) => console.log("•", ...a);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const EXT = path.join(ROOT, "dist/extension/chrome");
const HOST = path.join(ROOT, "dist/host.js");
for (const f of [EXT, HOST]) if (!fs.existsSync(f)) throw new Error(`${f} missing — run npm run build`);

// A sign-in page on 127.0.0.1 that keeps the last submitted credentials
let submitted: Record<string, string> = {};
const page = `<!doctype html><title>Sign in</title>
<form method="post" action="/login"><input name="user" type="email" autocomplete="username"><input name="pass" type="password"><button>Sign in</button></form>`;
const server = http.createServer((req, res) => {
  if (req.method === "POST") {
    let body = "";
    req.on("data", (c: Buffer) => (body += c));
    req.on("end", () => {
      submitted = Object.fromEntries(new URLSearchParams(body));
      res.end("<title>Welcome</title>welcome");
    });
    return;
  }
  res.setHeader("content-type", "text/html");
  res.end(page);
});
await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
const ORIGIN = `http://127.0.0.1:${(server.address() as { port: number }).port}`;

// Vault with one login for that origin, remembered (DPAPI in the temp folder) so the host opens without a password
const { key, data } = await store.create("extension e2e password");
store.saveItem(data, { type: "login", title: "Local test", fields: { url: ORIGIN, username: "dana@example.com", password: "ext-secret-1" } });
await store.save(key, data);
await remember.remember(key, store.salt());
const st = setup.enableBrowser({ hostScript: HOST });
log("native host registered:", st.registered.join(", "));

const profile = fs.mkdtempSync(path.join(os.tmpdir(), "kv-ext-profile-"));
const ctx = await chromium.launchPersistentContext(profile, {
  channel: "chromium",
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
});
try {
  const sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent("serviceworker"));
  if (!sw.url().startsWith(`chrome-extension://${CHROME_ID}/`)) throw new Error(`unexpected extension id: ${sw.url()}`);
  log("extension loaded with the fixed id");

  const site = await ctx.newPage();
  await site.goto(`${ORIGIN}/`);
  const tabOf = (prefix: string) => sw.evaluate(async (p) => (await chrome.tabs.query({})).find((t) => t.url?.startsWith(p))?.id, prefix);
  const tabId = await tabOf(`${ORIGIN}/`);
  if (!tabId) throw new Error("no tab id for the sign-in page");

  // ── Fill ──
  const popup = await ctx.newPage();
  await popup.goto(`chrome-extension://${CHROME_ID}/popup.html?tab=${tabId}`);
  await popup.waitForSelector(".login", { timeout: 20000 }).catch(async (e: Error) => {
    throw new Error(`${e.message.split("\n")[0]} · popup: ${await popup.textContent("body")}`);
  });
  const listed = (await popup.textContent(".login")) ?? "";
  if (!listed.includes("Local test") || !listed.includes("dana@example.com") || listed.includes("ext-secret-1")) throw new Error(`popup list: ${listed}`);
  await popup.locator(".login button.primary").click();
  await site.waitForFunction(() => document.querySelector<HTMLInputElement>("[name=pass]")!.value === "ext-secret-1", null, { timeout: 10000 });
  if ((await site.inputValue("[name=user]")) !== "dana@example.com") throw new Error("username not filled");
  log("popup lists the login (no password in the list) and fills both fields");

  // ── Save a changed password ──
  await site.fill("[name=pass]", "ext-new-2");
  await Promise.all([site.waitForURL(/\/login$/), site.click("button")]);
  if (submitted.pass !== "ext-new-2") throw new Error("the form didn't submit");
  await sleep(500);
  const popup2 = await ctx.newPage();
  await popup2.goto(`chrome-extension://${CHROME_ID}/popup.html?tab=${tabId}`);
  await popup2.waitForSelector(".save", { timeout: 20000 });
  await popup2.locator(".save button.primary").click();
  await popup2.waitForFunction(() => document.querySelector(".toast")?.textContent?.length, null, { timeout: 10000 });
  const saved = Object.values((await store.unlockWithKey(key)).data.items);
  if (saved.length !== 1 || saved[0]!.fields.password !== "ext-new-2") throw new Error(`vault after save: ${saved.map((i) => i.title).join(", ")}`);
  log("a changed password is noticed on submit and updated in the vault after one click");

  // ── A look-alike site gets nothing ──
  const other = await ctx.newPage();
  await other.goto(`http://localhost:${(server.address() as { port: number }).port}/`);
  const otherId = await tabOf("http://localhost:");
  const popup3 = await ctx.newPage();
  await popup3.goto(`chrome-extension://${CHROME_ID}/popup.html?tab=${otherId}`);
  await popup3.waitForFunction(() => document.querySelector("main")?.textContent?.includes("No logins"), null, { timeout: 20000 });
  log("another host gets no logins");
  console.log("• OK");
} finally {
  await ctx.close();
  server.close();
  setup.disableBrowser();
  await remember.forget();
}
