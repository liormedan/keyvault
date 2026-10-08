// Runs inside the page (chrome.scripting.executeScript), so it must be self-contained: no imports, no outer variables.
// Fills the first visible password field and the username field that belongs with it. On a two-step sign-in
// (username first, password on the next page) it fills just the username.

export function fillPage(username: string, password: string): { user: boolean; password: boolean } {
  const visible = (el: HTMLElement) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden";
  // React and friends track value through the native setter; setting .value alone isn't seen
  const setValue = (el: HTMLInputElement, v: string) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(el, v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  };
  const inputs = [...document.querySelectorAll("input")].filter((i) => visible(i) && !i.disabled && !i.readOnly);
  const pw = inputs.find((i) => i.type === "password");
  const texty = inputs.filter((i) => ["text", "email", "tel", ""].includes(i.type));
  let user =
    texty.find((i) => /username|email/i.test(i.autocomplete)) ??
    (pw ? texty.filter((i) => i.compareDocumentPosition(pw) & Node.DOCUMENT_POSITION_FOLLOWING).pop() : undefined) ??
    texty.find((i) => /user|email|login|mail|account/i.test(`${i.name} ${i.id}`));
  if (user && pw && user.form && pw.form && user.form !== pw.form) user = undefined;
  if (user && username) setValue(user, username);
  if (pw && password) setValue(pw, password);
  (pw ?? user)?.focus();
  return { user: !!(user && username), password: !!(pw && password) };
}
