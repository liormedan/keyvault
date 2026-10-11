// End-to-end test of the real desktop window (Windows only).
// Starts the built kv-vault.exe against a temporary vault and drives its WebView2 over the
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
const EXE = process.env.KV_EXE || path.join(ROOT, "app/src-tauri/target/release/kv-vault.exe");
if (!fs.existsSync(EXE)) throw new Error(`${EXE} not found — run npm run app:build first`);
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "kv-e2e-"));
const OUT = path.join(ROOT, "test/e2e/out");
fs.mkdirSync(OUT, { recursive: true });
const PW = "app e2e test password";
const SECRET = "e2e-secret-value-42";
const PORT = 9333;
const BACKEND_LOG = path.join(HOME, "backend.log");
const backendLog = () => (fs.existsSync(BACKEND_LOG) ? fs.readFileSync(BACKEND_LOG, "utf8").slice(-1500) : "(none)");
const log = (...a: unknown[]) => console.log("•", ...a);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Launched {
  proc: ChildProcess;
  browser: Browser;
  page: Page;
  errors: string[];
}

async function launch(extraEnv: Record<string, string> = {}): Promise<Launched> {
  const proc = spawn(EXE, [], {
    env: {
      ...process.env,
      KV_HOME: HOME,
      WEBVIEW2_USER_DATA_FOLDER: path.join(HOME, "webview"),
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${PORT}`,
      KV_BACKEND_LOG: BACKEND_LOG,
      KV_NO_UPDATE_CHECK: "1", // no request to GitHub; the update step below stubs the updater
      // No Node.js on PATH: the app must start its backend with the node.exe it ships
      PATH: (process.env.PATH ?? "")
        .split(path.delimiter)
        .filter((d) => d && !fs.existsSync(path.join(d, "node.exe")))
        .join(path.delimiter),
      ...extraEnv,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  proc.stdout?.on("data", (d: Buffer) => (output += d));
  proc.stderr?.on("data", (d: Buffer) => (output += d));
  let exited: number | null | undefined;
  proc.on("exit", (code) => (exited = code));
  // The first start on a fresh machine (CI) can take a while: WebView2 creates its profile
  let browser: Browser | null = null;
  let lastError = "";
  for (let i = 0; i < 120 && !browser && exited === undefined; i++) {
    await sleep(500);
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`).catch((e: Error) => {
      lastError = e.message.split(String.fromCharCode(10))[0] ?? "";
      return null;
    });
  }
  if (!browser) {
    proc.kill();
    throw new Error(
      `no DevTools connection to the app (${exited !== undefined ? `exited with ${exited}` : "still running after 60s"}). Last error: ${lastError}. App output: ${output.slice(-2000) || "(none)"}`,
    );
  }
  let page: Page | undefined;
  for (let i = 0; i < 20 && !page; i++) {
    page = browser.contexts()[0]?.pages()[0];
    if (!page) await sleep(250);
  }
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
await page.waitForSelector("#setup:not([hidden])").catch(async (e: Error) => {
  // the window is up but the first screen isn't: say why (backend status, console, page text)
  await shot(page, "failure-start").catch(() => {});
  const status = await page
    .evaluate(async () => {
      try {
        return await (window as unknown as { __TAURI__: { core: { invoke(c: string, a: unknown): Promise<unknown> } } }).__TAURI__.core.invoke("kv", {
          method: "status",
        });
      } catch (err) {
        return `invoke failed: ${String(err)}`;
      }
    })
    .catch((err: Error) => `evaluate failed: ${err.message}`);
  const body = ((await page.textContent("body").catch(() => "")) ?? "").replace(/\s+/g, " ").slice(0, 300);
  throw new Error(
    `setup screen never showed (${e.message.split(String.fromCharCode(10))[0]}). status: ${JSON.stringify(status)} · console: ${a.errors.join(" | ") || "(none)"} · body: ${body} · backend stderr: ${backendLog()}`,
  );
});
log("setup screen shown");
const langState = () =>
  page.evaluate(() => ({
    dir: document.documentElement.dir,
    title: document.title,
    h1: document.querySelector("#setup h1")?.textContent,
    btn: document.querySelector("#setup button[type=submit]")?.textContent,
  }));
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

const addDev = async () => {
  await page.click("#add");
  await page.locator("#pickGrid button", { hasText: "מפתח פיתוח" }).click();
};
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

const sub = (await page.locator(".item", { hasText: "ויזה" }).locator(".sub").textContent()) ?? "";
const subBox = (await page.locator(".item", { hasText: "ויזה" }).locator(".sub span").first().boundingBox())!;
const expBox = (await page.locator(".item", { hasText: "ויזה" }).locator(".sub span").last().boundingBox())!;
if (!(subBox.x > expBox.x)) throw new Error("card subtitle order is not right-to-left by part");
if (sub !== "•••• 9012 · 08/29") throw new Error("card subtitle: " + sub);
if (((await page.locator("#list").textContent()) ?? "").includes("321")) throw new Error("cvv in list");
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
fs.writeFileSync(
  csvPath,
  [
    "name,url,username,password,note",
    "example.com,https://example.com/login,dana@example.com,csv-secret-1,",
    '"Shop, Inc.",https://shop.example,dana,"csv,secret-2",note',
    "empty.example,https://empty.example,dana,,",
    "",
  ].join(String.fromCharCode(13, 10)),
);
const stubbed = await page.evaluate((p) => {
  try {
    window.__TAURI__.dialog.open = async () => p;
    return window.__TAURI__.dialog.open !== undefined;
  } catch (e) {
    return String(e);
  }
}, csvPath);
if (stubbed !== true) throw new Error("cannot stub dialog: " + stubbed);
await page.click("#add");
await page.locator("#pickGrid button", { hasText: "ייבוא מדפדפן או ממנהל סיסמאות" }).click();
await shot(page, "9-import");
await dlg.getByRole("button", { name: "בחירת קובץ" }).click();
await page.waitForSelector("#importResult");
const importText = (await page.textContent("#importResult")) ?? "";
if (!importText.includes("CSV") || !importText.includes("נוספו 2") || !importText.includes("1 דולגו")) throw new Error("import result: " + importText);
await shot(page, "10-import-done");
if (((await page.locator("body").textContent()) ?? "").includes("csv-secret")) throw new Error("imported password visible in the page");
await dlg.getByRole("button", { name: "מחיקת הקובץ" }).click();
await page.waitForFunction(() => !document.querySelector<HTMLDialogElement>("#itemDlg")!.open);
if (fs.existsSync(csvPath)) throw new Error("csv not deleted");
if ((await page.locator(".item").count()) !== 3) throw new Error("items after import: " + (await page.locator(".item").count()));
await page.locator("#cats button", { hasText: "הכול" }).click();
log("browser import: " + importText + " · file deleted");

// ── Two-factor code ──
await page.locator(".item", { hasText: "GitHub" }).locator(".open").click();
await dlg.getByRole("button", { name: "עריכה" }).click();
await dlg.locator("[name=totp]").fill("JBSWY3DPEHPK3PXP");
await dlg.getByRole("button", { name: "שמירה" }).click();
await page.waitForFunction(() => /^\d{3} \d{3}$/.test(document.querySelector("#itemDlg .totp-code")?.textContent ?? ""), null, { timeout: 10000 });
const left = (await dlg.locator(".totp-left").textContent()) ?? "";
if (!/^\d+ שנ׳$/.test(left)) throw new Error("totp countdown: " + left);
if (((await dlg.textContent()) ?? "").includes("JBSWY3DPEHPK3PXP")) throw new Error("two-factor key shown unmasked");
await shot(page, "11-totp");
log("two-factor code shown, key stays masked");
await dlg.getByRole("button", { name: "סגירה" }).click();

// ── Password health ──
await page.locator("#cats button", { hasText: "בריאות סיסמאות" }).click();
await page.waitForSelector(".health-sum");
const sum = (await page.textContent(".health-sum")) ?? "";
if (!sum.includes("נבדקו 3 סיסמאות")) throw new Error("health summary: " + sum);
const no2fa = await page.locator("section", { hasText: "התחברויות בלי אימות דו-שלבי" }).locator(".hrow").count();
if (no2fa !== 2) throw new Error("logins without two-factor: " + no2fa);
const healthText = (await page.textContent("#list")) ?? "";
if (healthText.includes("csv-secret") || healthText.includes(genPw)) throw new Error("a password in the health view");
await shot(page, "12-health");
log("password health: " + sum);
await page.locator("#cats button", { hasText: "הכול" }).click();

// ── Emergency export (the save picker is replaced with a fixed path) ──
const exportPath = path.join(HOME, "rescue.kv");
await page.evaluate((p) => {
  window.__TAURI__.dialog.save = async () => p;
}, exportPath);
await page.click("#exportBtn");
await dlg.getByRole("button", { name: "בחירת מקום לשמירה" }).click();
await page.waitForSelector("#recoveryCode");
const code = (await page.textContent("#recoveryCode")) ?? "";
if (!/^([A-Z2-9]{4}-){7}[A-Z2-9]{4}$/.test(code)) throw new Error("recovery code: " + code);
const exported = JSON.parse(fs.readFileSync(exportPath, "utf8"));
if (!exported.ct || !exported.kdf || JSON.stringify(exported).includes("csv-secret")) throw new Error("export is not an encrypted vault file");
await shot(page, "13-export");
log("emergency export with a recovery code");
await dlg.getByRole("button", { name: "סגירה" }).click();

// ── Browser extension dialog (not turned on: that would register the host for this user) ──
await page.click("#browserBtn");
await page.waitForSelector("#browserState");
if ((await page.textContent("#browserState")) !== "כבוי") throw new Error("browser extension should start off: " + (await page.textContent("#browserState")));
await shot(page, "14-browser");
log("browser extension: off by default");
await dlg.getByRole("button", { name: "סגירה" }).click();

// ── Sync through a folder (the folder picker is replaced with a temporary folder) ──
const cloud = fs.mkdtempSync(path.join(os.tmpdir(), "kv-e2e-cloud-"));
const sharePath = path.join(HOME, "github.kvshare");
await page.evaluate(
  ({ folder, file }) => {
    window.__TAURI__.dialog.open = async (o: { directory?: boolean }) => (o.directory ? folder : file);
    window.__TAURI__.dialog.save = async () => file;
  },
  { folder: cloud, file: sharePath },
);
await page.click("#syncBtn");
await page.waitForSelector("#syncState");
if ((await page.textContent("#syncState")) !== "כבוי") throw new Error("sync should start off");
await dlg.getByRole("button", { name: "בחירת תיקייה…" }).click();
await page.waitForFunction(() => document.querySelector("#syncState")?.textContent?.startsWith("פעיל"), null, { timeout: 20000 });
const syncedFile = path.join(cloud, "kv-vault.kv");
if (!fs.existsSync(syncedFile) || fs.readFileSync(syncedFile, "utf8").includes(genPw)) throw new Error("the folder should hold an encrypted copy");
await shot(page, "15-sync");
log("sync: folder linked, encrypted copy written");
await dlg.getByRole("button", { name: "הפסקת סנכרון" }).click();
await page.waitForFunction(() => document.querySelector("#syncState")?.textContent === "כבוי");
await dlg.getByRole("button", { name: "סגירה" }).click();

// ── Share an item, then open the share file (sealed to this vault's own key) ──
await page.click("#add");
await page.locator("#pickGrid button", { hasText: "פתיחת קובץ משותף" }).click();
await page.waitForSelector("#myShareKey");
const myKey = ((await page.textContent("#myShareKey")) ?? "").trim();
if (!/^kvpk1\.[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{4}$/.test(myKey)) throw new Error("sharing key: " + myKey);
await dlg.getByRole("button", { name: "ביטול" }).click();
await page.locator(".item", { hasText: "GitHub" }).locator(".open").click();
await dlg.getByRole("button", { name: "שיתוף…" }).click();
await dlg.locator("textarea").fill(myKey);
await dlg.getByRole("button", { name: "שמירת קובץ שיתוף…" }).click();
await page.waitForSelector("#shareDone");
if (fs.readFileSync(sharePath, "utf8").includes(genPw)) throw new Error("the share file holds plaintext");
await dlg.getByRole("button", { name: "סגירה" }).click();
await page.click("#add");
await page.locator("#pickGrid button", { hasText: "פתיחת קובץ משותף" }).click();
await dlg.getByRole("button", { name: "בחירת קובץ" }).click();
await page.waitForSelector("#receivePreview");
if (!((await page.textContent("#receivePreview")) ?? "").includes("GitHub")) throw new Error("share preview");
await shot(page, "16-receive");
await dlg.getByRole("button", { name: "הוספה לכספת" }).click();
await page.waitForFunction(() => !document.querySelector<HTMLDialogElement>("#itemDlg")!.open);
log("share: sealed to a sharing key, opened, previewed by name");

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

// Updates: off by default here (KV_NO_UPDATE_CHECK). A stubbed updater finds 9.9.9 once the user turns the check on;
// its download fails, so nothing is installed — the banner stays and says why
if ((await page.textContent("#updatesBtn")) !== "Update check: off") throw new Error("update check not off: " + (await page.textContent("#updatesBtn")));
await page.evaluate(() => {
  window.__TAURI__.updater.check = async () => ({
    version: "9.9.9",
    download: async () => {
      throw new Error("stub download");
    },
    install: async () => {},
  });
});
await page.click("#updatesBtn");
await page.waitForSelector("#updateBar:not([hidden])");
if ((await page.textContent("#updateText")) !== "kv-vault 9.9.9 is available.") throw new Error("update text: " + (await page.textContent("#updateText")));
if ((await page.textContent("#updatesBtn")) !== "Update check: on") throw new Error("update check not on");
await shot(page, "11b-update");
await page.click("#updateInstall");
await page.waitForFunction(() => document.querySelector("#toast")!.textContent!.includes("stub download"));
if (await page.locator("#updateInstall").isDisabled()) throw new Error("install button stuck after a failed download");
await page.click("#updateLater");
if (await visible(page, "#updateBar")) throw new Error("Later did not hide the update bar");
await page.click("#updatesBtn");
await page.waitForFunction(() => document.querySelector("#updatesBtn")!.textContent === "Update check: off");
log("updates: turned on → stubbed 9.9.9 shown, failed download reported, Later hides, turned off");
const catsEn = (await page.locator("#cats").textContent()) ?? "";
if (!catsEn.includes("Logins") || !catsEn.includes("Dev keys")) throw new Error("categories not in English: " + catsEn);
await page.locator(".item .open").first().click();
const dlg2 = page.locator("#itemDlg");
await dlg2.locator("dl.fields").waitFor();
const dlgEn = (await dlg2.textContent()) ?? "";
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
await sleep(1500);

// ── Locking Windows locks the vault (simulated: the shell runs the same path after 9s) ──
a = await launch({ KV_SIMULATE_LOCK_AFTER_MS: "9000" });
page = a.page;
await page.waitForSelector("#unlock:not([hidden])");
await page.fill("#unlockForm [name=pw]", PW);
await page.click("#unlockForm button[type=submit]");
await page.waitForSelector("#main:not([hidden])", { timeout: 15000 });
await page.waitForSelector("#unlock:not([hidden])", { timeout: 20000 });
if ((await page.locator("#list > *").count()) !== 0) throw new Error("list still rendered after the session lock");
const afterLock = await page.evaluate(() =>
  (window as unknown as { __TAURI__: { core: { invoke(c: string, a: unknown): Promise<{ unlocked: boolean }> } } }).__TAURI__.core.invoke("kv", {
    method: "status",
  }),
);
if (afterLock.unlocked) throw new Error("backend still unlocked after the session lock");
log("workstation lock → vault locked, list cleared");
await a.browser.close().catch(() => {});
a.proc.kill();
await sleep(1000);

const raw = fs.readFileSync(path.join(HOME, "vault.kv"), "utf8");
if (raw.includes(SECRET) || raw.includes("API_KEY") || raw.includes(genPw) || raw.includes("GitHub") || raw.includes("csv-secret"))
  throw new Error("plaintext in vault");
if (fs.existsSync(path.join(HOME, "key.dpapi"))) throw new Error("dpapi not forgotten");
log("vault file encrypted, remembered key removed");
const consoleErrors = [...errors1, ...a.errors];
if (consoleErrors.length) throw new Error("console errors: " + consoleErrors.join(" | "));
log("no console errors");
await sleep(1500);
fs.rmSync(HOME, { recursive: true, force: true, maxRetries: 5 });
log("OK");
