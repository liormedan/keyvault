// The popup: the logins kv-vault has for this site — fill, copy password, copy two-factor code — plus
// "Save to kv-vault" for a sign-in just submitted on this tab, and a password generator.
// Passwords pass through here only on their way into the page (fill) or into the vault (save).
import { PENDING_MS } from "./shared.ts";
import { fillPage } from "./fill.ts";
import { type Link, connect } from "./native.ts";

// ── Strings: the browser's language, English or Hebrew ──

const EN = {
  loading: "Connecting to kv-vault…",
  notConnected: "kv-vault isn't connected to this browser. In the kv-vault app, open “Browser extension…” at the bottom of the window and turn it on.",
  disabled: "The browser extension is turned off in kv-vault. Turn it on in the app: “Browser extension…”.",
  noVault: "No vault yet. Create one in the kv-vault app.",
  locked: "Unlock kv-vault",
  password: "Master password",
  unlock: "Unlock",
  rememberHint: "Turn on “Remember me” in the app and the extension won't ask.",
  wrongPassword: "Wrong master password",
  notWeb: "kv-vault fills logins on web pages (http and https) only.",
  none: "No logins saved for this site.",
  fill: "Fill",
  copyPassword: "Copy password",
  copyCode: "Copy code",
  copied: "Copied — the clipboard clears in 20 seconds",
  filled: "Filled",
  noFields: "No login fields found on this page",
  saveNew: "Save this sign-in to kv-vault?",
  saveUpdate: "Update the password of “{title}” in kv-vault?",
  save: "Save",
  update: "Update",
  dismiss: "Not now",
  saved: "Saved to kv-vault",
  generate: "Generate & copy password",
  lock: "Lock",
  failed: "Something went wrong ({code})",
};
type Key = keyof typeof EN;
const HE: Record<Key, string> = {
  loading: "מתחבר ל-kv-vault…",
  notConnected: "kv-vault לא מחובר לדפדפן הזה. באפליקציה, בתחתית החלון: ״תוסף דפדפן…״ ← הפעלה.",
  disabled: "תוסף הדפדפן כבוי ב-kv-vault. אפשר להפעיל אותו באפליקציה: ״תוסף דפדפן…״.",
  noVault: "עוד אין כספת. צור אחת באפליקציה.",
  locked: "פתיחת kv-vault",
  password: "סיסמת אב",
  unlock: "פתיחה",
  rememberHint: "אם תפעיל ״זכור אותי״ באפליקציה, התוסף לא ישאל.",
  wrongPassword: "סיסמת אב שגויה",
  notWeb: "kv-vault ממלא התחברויות רק בדפי אינטרנט (http ו-https).",
  none: "אין התחברויות שמורות לאתר הזה.",
  fill: "מילוי",
  copyPassword: "העתק סיסמה",
  copyCode: "העתק קוד",
  copied: "הועתק — הלוח יתנקה בעוד 20 שניות",
  filled: "מולא",
  noFields: "לא נמצאו בדף שדות התחברות",
  saveNew: "לשמור את ההתחברות הזו ב-kv-vault?",
  saveUpdate: "לעדכן את הסיסמה של ״{title}״ ב-kv-vault?",
  save: "שמירה",
  update: "עדכון",
  dismiss: "לא עכשיו",
  saved: "נשמר ב-kv-vault",
  generate: "צור סיסמה והעתק",
  lock: "נעילה",
  failed: "משהו השתבש ({code})",
};
const he = chrome.i18n.getUILanguage().toLowerCase().startsWith("he");
const tr = (k: Key, p: Record<string, string> = {}) => (he ? HE : EN)[k].replace(/\{(\w+)\}/g, (m, n: string) => p[n] ?? m);
document.documentElement.lang = he ? "he" : "en";
document.documentElement.dir = he ? "rtl" : "ltr";

// ── DOM ──

const view = document.getElementById("view")!;
function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> = {}, ...kids: (Node | string | null)[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  Object.assign(e, props);
  e.append(...kids.filter((k): k is Node | string => k != null));
  return e;
}
const toastEl = el("p", { className: "toast", role: "status" });
const say = (text: string) => {
  toastEl.textContent = text;
};
const show = (...nodes: Node[]) => view.replaceChildren(...nodes);
const message = (code: string): string =>
  code === "not-connected" ? tr("notConnected") : code === "disabled" ? tr("disabled") : code === "no-vault" ? tr("noVault") : tr("failed", { code });

// ── Flow ──

interface Login {
  id: string;
  title: string;
  username: string;
  totp: boolean;
}
interface Pending {
  url: string;
  username: string;
  password: string;
  at: number;
}

let link: Link;
let tab: chrome.tabs.Tab;

async function start(): Promise<void> {
  document.getElementById("loading")!.textContent = tr("loading");
  // ?tab=<id>: the popup opened as a page for a given tab (the extension test does this); normally the active tab
  const wanted = Number(new URLSearchParams(location.search).get("tab"));
  [tab] = (wanted ? [await chrome.tabs.get(wanted)] : await chrome.tabs.query({ active: true, currentWindow: true })) as [chrome.tabs.Tab];
  const url = tab?.url ?? "";
  if (!/^https?:/.test(url)) return show(el("p", { className: "muted", textContent: tr("notWeb") }));
  document.getElementById("host")!.textContent = new URL(url).hostname;
  link = connect();
  const st = await link.call<{ exists: boolean; enabled: boolean; unlocked: boolean; remembered: boolean }>("status");
  if (st.error !== undefined) return show(el("p", { className: "muted", textContent: message(st.error) }));
  if (!st.result.enabled) return show(el("p", { className: "muted", textContent: tr("disabled") }));
  if (!st.result.exists) return show(el("p", { className: "muted", textContent: tr("noVault") }));
  if (!st.result.unlocked && !(st.result.remembered && !(await link.call("unlock")).error)) return showUnlock();
  await showLogins();
}

function showUnlock(): void {
  const pw = el("input", { type: "password", autocomplete: "current-password", dir: "ltr", ariaLabel: tr("password"), placeholder: tr("password") });
  const err = el("p", { className: "err", role: "alert" });
  const form = el("form", {}, el("strong", { textContent: tr("locked") }), pw, err, el("button", { className: "primary", type: "submit", textContent: tr("unlock") }));
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const r = await link.call("unlock", { password: pw.value });
    pw.value = "";
    if (r.error) {
      err.textContent = r.error === "wrong-password" ? tr("wrongPassword") : message(r.error);
      return;
    }
    await showLogins();
  });
  show(form, el("p", { className: "muted", textContent: tr("rememberHint") }));
  pw.focus();
}

async function pendingSave(): Promise<HTMLElement | null> {
  const key = `pending:${tab.id}`;
  const p = (await chrome.storage.session.get(key))[key] as Pending | undefined;
  if (!p) return null;
  const clear = async () => {
    await chrome.storage.session.remove(key);
    await chrome.action.setBadgeText({ tabId: tab.id, text: "" });
  };
  if (Date.now() - p.at > PENDING_MS) {
    await clear();
    return null;
  }
  const check = await link.call<{ status: "new" | "update" | "same"; title?: string }>("check", { url: p.url, username: p.username, password: p.password });
  if (check.error !== undefined || check.result.status === "same") {
    await clear();
    return null;
  }
  const update = check.result.status === "update";
  const box = el(
    "div",
    { className: "save" },
    el("span", { textContent: update ? tr("saveUpdate", { title: check.result.title ?? "" }) : tr("saveNew") }),
    p.username ? el("span", { className: "user", textContent: p.username }) : null,
  );
  box.append(
    el(
      "div",
      { className: "row" },
      el("button", {
        className: "primary",
        textContent: update ? tr("update") : tr("save"),
        onclick: async () => {
          const r = await link.call("save", { url: p.url, username: p.username, password: p.password, title: tab.title ?? "" });
          await clear();
          if (r.error) return say(message(r.error));
          say(tr("saved"));
          await showLogins();
        },
      }),
      el("button", {
        textContent: tr("dismiss"),
        onclick: async () => {
          await clear();
          box.remove();
        },
      }),
    ),
  );
  return box;
}

async function showLogins(): Promise<void> {
  const r = await link.call<{ logins: Login[] }>("logins", { url: tab.url });
  if (r.error !== undefined) return show(el("p", { className: "muted", textContent: message(r.error) }));
  const rows = r.result.logins.map((l) => {
    const copy = (field: "password" | "totp") => async () => {
      const c = await link.call("copy", { id: l.id, url: tab.url, field });
      say(c.error ? message(c.error) : tr("copied"));
    };
    return el(
      "div",
      { className: "login" },
      el("div", { className: "who" }, el("span", { className: "title", textContent: l.title }), el("span", { className: "user", textContent: l.username })),
      el(
        "div",
        { className: "row" },
        el("button", {
          className: "primary",
          textContent: tr("fill"),
          onclick: async () => {
            const c = await link.call<{ username: string; password: string }>("fill", { id: l.id, url: tab.url });
            if (c.error !== undefined) return say(message(c.error));
            const [res] = await chrome.scripting.executeScript({ target: { tabId: tab.id! }, func: fillPage, args: [c.result.username, c.result.password] });
            if (!res?.result?.password && !res?.result?.user) return say(tr("noFields"));
            window.close();
          },
        }),
        el("button", { textContent: tr("copyPassword"), onclick: copy("password") }),
        l.totp ? el("button", { textContent: tr("copyCode"), onclick: copy("totp") }) : null,
      ),
    );
  });
  const save = await pendingSave();
  const footer = el(
    "footer",
    {},
    el("button", {
      textContent: tr("generate"),
      onclick: async () => {
        // Generated and copied by kv-vault itself, so the clipboard is cleared after 20 seconds
        const g = await link.call("copyGenerated");
        say(g.error ? message(g.error) : tr("copied"));
      },
    }),
    el("button", {
      textContent: tr("lock"),
      onclick: async () => {
        await link.call("lock");
        showUnlock();
      },
    }),
  );
  show(...[save, rows.length ? el("div", { className: "list" }, ...rows) : el("p", { className: "muted", textContent: tr("none") }), toastEl, footer].filter((n): n is HTMLElement => !!n));
}

void start();
