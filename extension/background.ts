// Background worker: keeps a just-submitted sign-in for the popup's "Save to kv-vault" offer, and runs the
// fill shortcut. Pending credentials live in chrome.storage.session — memory only, readable only by the extension's
// own pages (not by content scripts), gone after 3 minutes or when the tab closes.
import { fillPage } from "./fill.ts";
import { connect } from "./native.ts";
const pendingKey = (tabId: number) => `pending:${tabId}`;

chrome.runtime.onMessage.addListener((message, sender) => {
  const m = message as { type?: string; url?: string; username?: string; password?: string };
  const tabId = sender.tab?.id;
  // Only from our content script, in the top frame of a tab
  if (m.type !== "kv-captured" || sender.id !== chrome.runtime.id || tabId == null || sender.frameId !== 0 || !m.password) return undefined;
  void chrome.storage.session.set({ [pendingKey(tabId)]: { url: String(m.url), username: String(m.username ?? ""), password: String(m.password), at: Date.now() } });
  void chrome.action.setBadgeBackgroundColor({ color: "#2f5d50" });
  void chrome.action.setBadgeText({ tabId, text: "1" });
  return undefined;
});

chrome.tabs.onRemoved.addListener((tabId) => void chrome.storage.session.remove(pendingKey(tabId)));

// Ctrl+Shift+L: fill when exactly one login fits the page; otherwise open the popup to choose
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "fill-login") return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url || !/^https?:/.test(tab.url)) return;
  const link = connect();
  try {
    const st = await link.call<{ unlocked: boolean; enabled: boolean }>("status");
    if (st.result?.enabled && !st.result.unlocked) await link.call("unlock");
    const list = await link.call<{ logins: { id: string }[] }>("logins", { url: tab.url });
    if (list.result?.logins.length === 1) {
      const creds = await link.call<{ username: string; password: string }>("fill", { id: list.result.logins[0]!.id, url: tab.url });
      if (creds.result) {
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: fillPage, args: [creds.result.username, creds.result.password] });
        return;
      }
    }
    await chrome.action.openPopup().catch(() => {});
  } finally {
    link.close();
  }
});
