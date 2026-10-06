// End-to-end test of the real desktop window (Windows only).
// Starts the built keyvault.exe against a temporary vault and drives its WebView2 over the
// DevTools protocol — the same window a user sees, never the real ~/.keyvault.
//
//   npm run app:build && npm run test:e2e
//
// KV_EXE overrides the executable. Screenshots go to test/e2e/out/ (gitignored).
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Browser, type Page } from "playwright-core";

if (process.platform !== "win32") {
  console.log("e2e: skipped — the desktop app test needs Windows (WebView2)");
  process.exit(0);
}

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const EXE = process.env.KV_EXE || path.join(ROOT, "app/src-tauri/target/release/keyvault.exe");
if (!fs.existsSync(EXE)) throw new Error(`${EXE} not found — run npm run app:build first`);
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "kv-e2e-"));
const OUT = path.join(ROOT, "test/e2e/out");
fs.mkdirSync(OUT, { recursive: true });
const PW = "app e2e test password";
const SECRET = "e2e-secret-value-42";
const PORT = 9333;
const log = (...a: unknown[]) => console.log("•", ...a);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Launched {
  proc: ChildProcess;
  browser: Browser;
  page: Page;
  errors: string[];
}

async function launch(): Promise<Launched> {
  const proc = spawn(EXE, [], {
    env: { ...process.env, KV_HOME: HOME, WEBVIEW2_USER_DATA_FOLDER: path.join(HOME, "webview"), WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${PORT}` },
    stdio: "ignore",
  });
  let browser: Browser | null = null;
  for (let i = 0; i < 40 && !browser; i++) {
    await sleep(500);
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`).catch(() => null);
  }
  if (!browser) throw new Error("no CDP");
  let page: Page | undefined;
  for (let i = 0; i < 20 && !page; i++) { page = browser.contexts()[0]?.pages()[0]; if (!page) await sleep(250); }
  if (!page) throw new Error("no page");
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.waitForLoadState("domcontentloaded");
  return { proc, browser, page, errors };
}

const shot = (page: Page, name: string) => page.screenshot({ path: path.join(OUT, `${name}.png`) });
const visible = (page: Page, sel: string) => page.locator(sel).isVisible();

let a = await launch();
let { page } = a;
await page.waitForSelector("#setup:not([hidden])");
log("setup screen shown");
const langState = () => page.evaluate(() => ({ dir: document.documentElement.dir, title: document.title, h1: document.querySelector("#setup h1")?.textContent, btn: document.querySelector("#setup button[type=submit]")?.textContent }));
let ls = await langState();
if (ls.dir !== "ltr" || ls.h1 !== "New vault" || ls.btn !== "Create vault") throw new Error("not English by default: " + JSON.stringify(ls));
await shot(page, "0-setup-en");
await page.locator("#setup .lang-toggle").click();
ls = await langState();
if (ls.dir !== "rtl" || ls.h1 !== "כספת חדשה" || ls.title !== "כספת מפתחות") throw new Error("toggle to Hebrew failed: " + JSON.stringify(ls));
log("English by default (LTR), switches to Hebrew (RTL)");
await shot(page, "1-setup");
const bg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
if ((await bg()) !== "rgb(20, 23, 29)") throw new Error("not dark by default: " + (await bg()));
await page.locator("#setup .theme-toggle").click();
if ((await bg()) !== "rgb(246, 244, 239)") throw new Error("toggle to light failed");
await shot(page, "1b-setup-light");
await page.locator("#setup .theme-toggle").click();
if ((await bg()) !== "rgb(20, 23, 29)") throw new Error("toggle back failed");
log("dark by default, light and back");

await page.fill("#setupForm [name=a]", PW);
await page.fill("#setupForm [name=b]", "mismatch password!!");
await page.click("#setupForm button[type=submit]");
await page.waitForFunction(() => document.querySelector("#setupErr")!.textContent.includes("לא תואמות"));
log("password mismatch caught");

await page.fill("#setupForm [name=b]", PW);
await page.click("#setupForm button[type=submit]");
await page.waitForSelector("#main:not([hidden])", { timeout: 15000 });
log("vault created, main screen");

const addDev = async () => { await page.click("#add"); await page.locator("#pickGrid button", { hasText: "מפתח פיתוח" }).click(); };
await addDev();
await page.fill("#form [name=p]", "demo-site");
await page.fill("#form [name=k]", "API_KEY");
await page.fill("#form [name=value]", SECRET);
await page.fill("#form [name=note]", "מפתח בדיקה");
await page.click("#form button[value=ok]");
await page.waitForSelector(".row");
log("dev key added");
await addDev();
await page.fill("#form [name=p]", "other");
await page.fill("#form [name=k]", "SMTP_PASS");
await page.fill("#form [name=value]", "x");
await page.click("#form button[value=ok]");
await page.waitForFunction(() => document.querySelectorAll(".row").length === 2);
await shot(page, "2-list");

await page.locator(".row", { hasText: "API_KEY" }).getByRole("button", { name: "הצג" }).click();
await page.waitForSelector(".val");
if ((await page.textContent(".val")) !== SECRET) throw new Error("value mismatch");
log("reveal works");
await shot(page, "3-reveal");

await page.fill("#q", "smtp");
if ((await page.locator(".row").count()) !== 1) throw new Error("search");
await page.fill("#q", "");
log("search works");

// ── פריטים לפי סוג ──
const dlg = page.locator("#itemDlg");
await page.click("#add");
await page.locator("#pickGrid button", { hasText: "התחברות לאתר" }).click();
await dlg.locator("[name=title]").fill("GitHub");
await dlg.locator("[name=url]").fill("https://github.com/login");
await dlg.locator("[name=username]").fill("dana@example.org");
await dlg.getByRole("button", { name: "צור סיסמה" }).click();
await page.waitForFunction(() => document.querySelector<HTMLInputElement>("#itemDlg [name=password]")!.value.length === 20);
const genPw = await dlg.locator("[name=password]").inputValue();
await shot(page, "6-login-edit");
await dlg.getByRole("button", { name: "שמירה" }).click();
await dlg.locator("dl.fields").waitFor();
if ((await dlg.locator(".v").allTextContents()).some((t) => t.includes(genPw))) throw new Error("password shown unmasked");
await dlg.locator("dd", { hasText: "••••" }).first().getByRole("button", { name: "הצג" }).click();
await page.waitForFunction((pw) => document.querySelector("#itemDlg")!.textContent.includes(pw), genPw);
await shot(page, "7-login-view");
log("login: created with a generated password, masked until revealed");
await dlg.getByRole("button", { name: "סגירה" }).click();

await page.click("#add");
await page.locator("#pickGrid button", { hasText: "כרטיס אשראי" }).click();
await dlg.locator("[name=title]").fill("ויזה אישית");
await dlg.locator("[name=number]").fill("4580123456789012");
await dlg.locator("[name=expiry]").fill("08/29");
await dlg.locator("[name=cvv]").fill("321");
await dlg.getByRole("button", { name: "שמירה" }).click();
await dlg.locator("dl.fields").waitFor();
await dlg.getByRole("button", { name: "עריכה" }).click();
if ((await dlg.locator("[name=cvv]").inputValue()) !== "321") throw new Error("edit did not load secret");
await dlg.locator("[name=title]").fill("ויזה");
await dlg.getByRole("button", { name: "שמירה" }).click();
await dlg.locator("dl.fields").waitFor();
await dlg.locator("dd", { hasText: "••••" }).first().getByRole("button", { name: "הצג" }).click();
await page.waitForFunction(() => document.querySelector("#itemDlg")!.textContent.includes("4580 1234 5678 9012"));
log("card: editing keeps secrets, number grouped by 4");
await dlg.getByRole("button", { name: "סגירה" }).click();

const sub = await page.locator(".item", { hasText: "ויזה" }).locator(".sub").textContent() ?? "";
const subBox = (await page.locator(".item", { hasText: "ויזה" }).locator(".sub span").first().boundingBox())!;
const expBox = (await page.locator(".item", { hasText: "ויזה" }).locator(".sub span").last().boundingBox())!;
if (!(subBox.x > expBox.x)) throw new Error("card subtitle order is not right-to-left by part");
if (sub !== "•••• 9012 · 08/29") throw new Error("card subtitle: " + sub);
if ((await page.locator("#list").textContent() ?? "").includes("321")) throw new Error("cvv in list");
await page.locator(".item", { hasText: "GitHub" }).locator(".star").click();
await page.waitForFunction(() => document.querySelector(".item .star[aria-pressed=true]"));
await page.locator("#cats button", { hasText: "מועדפים" }).click();
if ((await page.locator(".item").count()) !== 1) throw new Error("fav filter");
await page.locator("#cats button", { hasText: "כרטיסים" }).click();
if ((await page.locator(".item").count()) !== 1 || (await page.locator(".row").count()) !== 0) throw new Error("type filter");
await page.locator("#cats button", { hasText: "הכול" }).click();
await shot(page, "8-all");
log("favorites and type filter");

await page.locator(".item", { hasText: "ויזה" }).locator(".open").click();
await dlg.getByRole("button", { name: "מחיקה" }).click();
await page.locator("#confirmDlg button[value=cancel]").click();
await sleep(400);
if (!(await dlg.locator("dl.fields").isVisible())) throw new Error("cancel closed the item");
await dlg.getByRole("button", { name: "מחיקה" }).click();
await page.locator("#confirmDlg button[value=ok]").click();
await page.waitForFunction(() => document.querySelectorAll(".item").length === 1);
log("item deleted");

// ── Browser import (the file picker is replaced with a fixed path) ──
const csvPath = path.join(HOME, "Chrome Passwords.csv");
fs.writeFileSync(csvPath, ["name,url,username,password,note","example.com,https://example.com/login,dana@example.com,csv-secret-1,","\"Shop, Inc.\",https://shop.example,dana,\"csv,secret-2\",note","empty.example,https://empty.example,dana,,",""].join(String.fromCharCode(13, 10)));
const stubbed = await page.evaluate((p) => { try { window.__TAURI__.dialog.open = async () => p; return window.__TAURI__.dialog.open !== undefined; } catch (e) { return String(e); } }, csvPath);
if (stubbed !== true) throw new Error("cannot stub dialog: " + stubbed);
await page.click("#add");
await page.locator("#pickGrid button", { hasText: "ייבוא סיסמאות מדפדפן" }).click();
await shot(page, "9-import");
await dlg.getByRole("button", { name: "בחירת קובץ CSV" }).click();
await page.waitForSelector("#importResult");
const importText = await page.textContent("#importResult") ?? "";
if (!importText.includes("נוספו 2") || !importText.includes("1 שורות בלי סיסמה")) throw new Error("import result: " + importText);
await shot(page, "10-import-done");
if ((await page.locator("body").textContent() ?? "").includes("csv-secret")) throw new Error("imported password visible in the page");
await dlg.getByRole("button", { name: "מחיקת הקובץ" }).click();
await page.waitForFunction(() => !document.querySelector<HTMLDialogElement>("#itemDlg")!.open);
if (fs.existsSync(csvPath)) throw new Error("csv not deleted");
if ((await page.locator(".item").count()) !== 3) throw new Error("items after import: " + (await page.locator(".item").count()));
await page.locator("#cats button", { hasText: "הכול" }).click();
log("browser import: " + importText + " · file deleted");

await page.locator(".row", { hasText: "SMTP_PASS" }).getByRole("button", { name: "מחיקה" }).click();
await page.locator("#confirmDlg button[value=cancel]").click();
await sleep(400);
if ((await page.locator(".row").count()) !== 2) throw new Error("cancel still deleted the key");
await page.locator(".row", { hasText: "SMTP_PASS" }).getByRole("button", { name: "מחיקה" }).click();
await page.locator("#confirmDlg button[value=ok]").click();
await page.waitForFunction(() => document.querySelectorAll(".row").length === 1);
log("delete: cancel keeps, confirm deletes");

await page.click("#lock");
await page.waitForSelector("#unlock:not([hidden])");
log("lock → unlock screen");
await page.fill("#unlockForm [name=pw]", "wrong password!!");
await page.click("#unlockForm button[type=submit]");
await page.waitForFunction(() => document.querySelector("#unlockErr")!.textContent.length > 0, null, { timeout: 15000 });
log("wrong password:", await page.textContent("#unlockErr"));
await shot(page, "4-unlock-wrong");

await page.fill("#unlockForm [name=pw]", PW);
await page.check("#unlockForm [name=remember]");
await page.click("#unlockForm button[type=submit]");
await page.waitForSelector("#main:not([hidden])", { timeout: 15000 });
if (!(await visible(page, "#forget"))) throw new Error("forget button hidden");
log("unlocked with remember me");
const errors1 = a.errors;
await a.browser.close().catch(() => {});
a.proc.kill();
await sleep(1500);

a = await launch();
page = a.page;
await page.waitForSelector("#main:not([hidden])", { timeout: 15000 });
log("restart → unlocked by itself (remembered)");
if ((await page.evaluate(() => document.documentElement.dir)) !== "rtl") throw new Error("language not remembered after restart");
await page.locator("header .lang-toggle").click();
await page.waitForFunction(() => document.querySelector("#add")!.textContent === "Add" && document.documentElement.dir === "ltr");
await shot(page, "11-main-en");
const catsEn = await page.locator("#cats").textContent() ?? "";
if (!catsEn.includes("Logins") || !catsEn.includes("Dev keys")) throw new Error("categories not in English: " + catsEn);
await page.locator(".item .open").first().click();
const dlg2 = page.locator("#itemDlg");
await dlg2.locator("dl.fields").waitFor();
const dlgEn = await dlg2.textContent() ?? "";
if (!dlgEn.includes("Password") || !dlgEn.includes("Close")) throw new Error("item dialog not in English: " + dlgEn.slice(0, 120));
await shot(page, "12-item-en");
await dlg2.getByRole("button", { name: "Close" }).click();
await page.locator("header .lang-toggle").click();
await page.waitForFunction(() => document.documentElement.dir === "rtl");
log("language kept after restart; main screen and item in English, then back to Hebrew");
await page.locator("header .theme-toggle").click();
await shot(page, "5b-light");
await page.locator("header .theme-toggle").click();
await shot(page, "5-remembered");
await page.click("#forget");
await page.click("#lock");
await page.waitForSelector("#unlock:not([hidden])");
log("forget + lock");
await a.browser.close().catch(() => {});
a.proc.kill();
await sleep(1000);

const raw = fs.readFileSync(path.join(HOME, "vault.kv"), "utf8");
if (raw.includes(SECRET) || raw.includes("API_KEY") || raw.includes(genPw) || raw.includes("GitHub") || raw.includes("csv-secret")) throw new Error("plaintext in vault");
if (fs.existsSync(path.join(HOME, "key.dpapi"))) throw new Error("dpapi not forgotten");
log("vault file encrypted, remembered key removed");
const consoleErrors = [...errors1, ...a.errors];
if (consoleErrors.length) throw new Error("console errors: " + consoleErrors.join(" | "));
log("no console errors");
await sleep(1500); fs.rmSync(HOME, { recursive: true, force: true, maxRetries: 5 });
log("OK");
