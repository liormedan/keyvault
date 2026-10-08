// Notices a sign-in or sign-up being submitted and hands the credentials to the extension's background, which keeps
// them in memory (chrome.storage.session) for a few minutes so the popup can offer "Save to kv-vault".
// Nothing is saved without the user's click, and nothing is sent anywhere but the extension itself.

function collect(root: ParentNode): { username: string; password: string } | null {
  const pws = [...root.querySelectorAll<HTMLInputElement>("input[type=password]")].filter((i) => i.value);
  if (!pws.length) return null;
  // Change-password forms have current / new / confirm: the new one is the second
  const password = (pws.length >= 3 ? pws[1] : pws[pws.length - 1])!.value;
  const first = pws[0]!;
  const users = [...root.querySelectorAll<HTMLInputElement>("input")].filter(
    (i) => ["text", "email", "tel", ""].includes(i.type) && i.value && i.compareDocumentPosition(first) & Node.DOCUMENT_POSITION_FOLLOWING,
  );
  const user = users.find((i) => /username|email/i.test(i.autocomplete)) ?? users.pop();
  return { username: user?.value.trim() ?? "", password };
}

let last = "";
function report(root: ParentNode | null): void {
  const c = root && collect(root);
  if (!c) return;
  const sig = `${c.username}\n${c.password}`;
  if (sig === last) return; // the click and the submit of the same sign-in
  last = sig;
  void chrome.runtime.sendMessage({ type: "kv-captured", url: location.href, ...c }).catch(() => {});
}

const formOf = (el: Element | null): ParentNode | null => el?.closest("form") ?? (el ? document : null);

document.addEventListener("submit", (e) => report(e.target as HTMLFormElement), true);
// Sign-ins that never fire a submit event: the button click, or Enter in the password field
document.addEventListener(
  "click",
  (e) => {
    const b = (e.target as Element | null)?.closest("button, input[type=submit], [role=button]");
    if (b && formOf(b)?.querySelector("input[type=password]")) report(formOf(b));
  },
  true,
);
document.addEventListener(
  "keydown",
  (e) => {
    const t = e.target as HTMLInputElement | null;
    if (e.key === "Enter" && t?.type === "password") report(formOf(t));
  },
  true,
);
