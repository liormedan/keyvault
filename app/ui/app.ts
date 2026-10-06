// The desktop window. Every action goes to the backend (src/backend.ts) through Tauri's `kv` command,
// typed against src/protocol.ts — the same contract the backend implements.
// Secret fields reach the window only on reveal or edit; copy goes from the backend straight to the clipboard.
import type { FieldDef, ItemTypeName, ListedDevKey as DevEntryRow, ListedItem, TypeDef } from "../../src/model.ts";
import type { ImportResult, Method, Params, Result, Status } from "../../src/protocol.ts";
import { LOCKED } from "../../src/protocol.ts";

const invoke = window.__TAURI__.core.invoke;
const { tr, L } = window.I18N;

// ── DOM helpers ──

const $ = <T extends HTMLElement = HTMLElement>(selector: string): T => {
  const e = document.querySelector<T>(selector);
  if (!e) throw new Error(`missing ${selector}`);
  return e;
};

type Kid = Node | string | null | undefined | false;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Partial<HTMLElementTagNameMap[K]> & Record<string, unknown> = {}, ...kids: Kid[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  Object.assign(e, attrs);
  e.append(...kids.filter((k): k is Node | string => k != null && k !== false));
  return e;
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;
function toast(msg: string): void {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("on");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("on"), 2200);
}

/** In-page confirmation (window.confirm is not reliable inside the webview) */
function ask(text: string): Promise<boolean> {
  return new Promise((resolve) => {
    const d = $<HTMLDialogElement>("#confirmDlg");
    $("#confirmText").textContent = text;
    d.returnValue = "";
    d.addEventListener("close", () => resolve(d.returnValue === "ok"), { once: true });
    d.showModal();
  });
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

// ── State ──

const DEV = "dev";
type Category = "all" | "fav" | typeof DEV | ItemTypeName;

let TYPES = {} as Record<ItemTypeName, TypeDef>;
let items: ListedItem[] = [];
let projects: Record<string, DevEntryRow[]> = {};
let cat: Category = "all";

const isType = (c: string): c is ItemTypeName => Object.hasOwn(TYPES, c);

// ── Backend ──

async function kv<M extends Method>(method: M, ...[params]: Params<M> extends Record<string, never> ? [] : [Params<M>]): Promise<Result<M>> {
  try {
    return await invoke<Result<M>>("kv", { method, params });
  } catch (e) {
    const msg = String(e);
    if (msg === LOCKED) {
      await show();
      throw new Error(tr("locked"));
    }
    throw new Error(msg);
  }
}

/** Run an action; show its error as a toast */
const safe = (fn: () => Promise<unknown>) => async () => {
  try {
    await fn();
  } catch (err) {
    toast(message(err));
  }
};

// ── Screens ──

async function show(): Promise<Status | undefined> {
  const st = await invoke<Status>("kv", { method: "status" });
  for (const id of ["setup", "unlock", "main"]) $(`#${id}`).hidden = true;
  if (!st.exists) {
    $("#setup").hidden = false;
    $<HTMLFormElement>("#setupForm").a.focus();
    return;
  }
  if (!st.unlocked) {
    for (const d of document.querySelectorAll<HTMLDialogElement>("dialog[open]")) d.close();
    $("#rememberRow").hidden = !st.rememberSupported;
    $("#unlock").hidden = false;
    $<HTMLFormElement>("#unlockForm").pw.focus();
    return st;
  }
  $("#main").hidden = false;
  $("#path").textContent = st.vault;
  $("#forget").hidden = !st.remembered;
  if (!Object.keys(TYPES).length) TYPES = (await kv("types")).types;
  await load();
  return st;
}

async function load(): Promise<void> {
  const [a, b] = await Promise.all([kv("items"), kv("list")]);
  items = a.items;
  projects = b.projects;
  render();
}

// ── List ──

const devCount = () => Object.values(projects).reduce((n, keys) => n + keys.length, 0);

function renderCats(): void {
  const count = (t: ItemTypeName) => items.filter((i) => i.type === t).length;
  const btn = (id: Category, label: string, n: number) =>
    el("button", { type: "button", ariaCurrent: String(cat === id), onclick: () => { cat = id; render(); } },
      el("span", { textContent: label }),
      el("span", { className: "count", textContent: n ? String(n) : "" }));
  $("#cats").replaceChildren(
    btn("all", tr("cat.all"), items.length + devCount()),
    btn("fav", tr("cat.fav"), items.filter((i) => i.fav).length),
    el("hr"),
    ...(Object.entries(TYPES) as [ItemTypeName, TypeDef][]).map(([t, d]) => btn(t, L(d.plural), count(t))),
    el("hr"),
    btn(DEV, tr("cat.dev"), devCount()),
  );
}

function render(): void {
  renderCats();
  const q = $<HTMLInputElement>("#q").value.trim().toLowerCase();
  const hit = (...s: (string | undefined)[]) => !q || s.some((x) => String(x || "").toLowerCase().includes(q));
  const out: HTMLElement[] = [];

  if (cat !== DEV) {
    const list = items.filter((i) => (cat === "all" || (cat === "fav" ? i.fav : i.type === cat)) && hit(i.title, i.sub, L(TYPES[i.type]?.label)));
    if (list.length) out.push(el("div", { className: "items" }, ...list.map(itemRow)));
  }
  if (cat === DEV || cat === "all") {
    const secs: HTMLElement[] = [];
    for (const p of Object.keys(projects).sort()) {
      const rows = projects[p]!.filter((e) => hit(p, e.key, e.note));
      if (rows.length) secs.push(el("section", {}, el("h2", { textContent: p }), ...rows.map((e) => devRow(p, e))));
    }
    if (secs.length && cat === "all" && out.length) out.push(el("h3", { className: "group", textContent: tr("cat.dev") }));
    out.push(...secs);
  }

  const empty = q ? tr("empty.search") : cat === "fav" ? tr("empty.fav") : tr("empty.all");
  $("#list").replaceChildren(...(out.length ? out : [el("p", { className: "empty", textContent: empty })]));
}

function itemRow(i: ListedItem): HTMLElement {
  const def = TYPES[i.type];
  const primary = def.fields.find((f) => f.k === def.primary);
  return el("div", { className: "item" },
    el("button", {
      className: "star", type: "button", textContent: "★", title: i.fav ? tr("fav.remove") : tr("fav.add"),
      ariaPressed: String(i.fav), ariaLabel: tr("fav.label"),
      onclick: safe(async () => { await kv("itemFav", { id: i.id, fav: !i.fav }); await load(); }),
    }),
    el("button", { className: "open", type: "button", onclick: () => void openItem(i.id) },
      el("span", { className: "title" }, i.title, cat === "all" || cat === "fav" ? el("span", { className: "kind", textContent: L(def.label) }) : null),
      el("span", { className: "sub" }, ...bidiParts(i.sub))),
    el("div", { className: "actions" },
      el("button", {
        type: "button", textContent: tr("copyField", { field: L(primary?.label) }),
        onclick: safe(async () => { await kv("itemCopy", { id: i.id, k: def.primary }); toast(tr("copied")); }),
      })));
}

function devRow(p: string, e: DevEntryRow): HTMLElement {
  const shown = el("span");
  let hideTimer: ReturnType<typeof setTimeout> | undefined;
  const hide = () => { clearTimeout(hideTimer); shown.replaceChildren(); reveal.textContent = tr("show"); };
  const reveal = el("button", { textContent: tr("show"), onclick: safe(async () => {
    if (shown.textContent) return hide();
    const { value } = await kv("value", { p, k: e.key });
    shown.replaceChildren(el("span", { className: "val", textContent: value }));
    reveal.textContent = tr("hide");
    hideTimer = setTimeout(hide, 15000);
  }) });
  const copy = el("button", { textContent: tr("copy"), onclick: safe(async () => { await kv("copy", { p, k: e.key }); toast(tr("copied")); }) });
  const edit = el("button", { textContent: tr("edit"), onclick: () => openDev(p, e) });
  const del = el("button", { className: "danger", textContent: tr("delete"), onclick: safe(async () => {
    if (!(await ask(tr("confirmDelete", { name: `${p}/${e.key}` })))) return;
    await kv("delete", { p, k: e.key });
    toast(tr("deleted"));
    await load();
  }) });
  return el("div", { className: "row" },
    el("div", {}, el("div", { className: "name", textContent: e.key }), el("div", { className: "note", textContent: e.note || "" })),
    shown,
    el("div", { className: "actions" }, reveal, copy, edit, del));
}

// ── Item: view ──

const dlg = () => $<HTMLDialogElement>("#itemDlg");

// Each subtitle part keeps its own direction — otherwise "•••• 9012 · 08/29" flips in the RTL layout
const bidiParts = (text: string): (string | HTMLElement)[] =>
  String(text || "").split(" · ").flatMap((part, i) => [
    ...(i ? [" · "] : []),
    el("span", { dir: /[֐-׿]/.test(part) ? "rtl" : "ltr", textContent: part }),
  ]);

const cardFmt = (v: string) => v.replace(/\D/g, "").replace(/(.{4})(?=.)/g, "$1 ");
const MASK = "••••••••";

async function openItem(id: string): Promise<void> {
  let item;
  try {
    ({ item } = await kv("item", { id }));
  } catch (e) {
    toast(message(e));
    return;
  }
  const def = TYPES[item.type];
  const rows = def.fields.filter((f) => item.fields[f.k] != null).map((f) => {
    const v = item.fields[f.k];
    const val = el("span", { className: `v${f.ltr ? " ltr" : ""}` });
    const copy = el("button", { type: "button", textContent: tr("copy"), onclick: safe(async () => { await kv("itemCopy", { id, k: f.k }); toast(tr("copied")); }) });
    if (typeof v === "string") {
      val.textContent = v;
      return el("div", {}, el("dt", { textContent: L(f.label) }), el("dd", {}, val, copy));
    }
    val.textContent = MASK;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const conceal = () => { delete reveal.dataset.on; val.textContent = MASK; reveal.textContent = tr("show"); };
    const reveal = el("button", { type: "button", textContent: tr("show"), onclick: safe(async () => {
      if (reveal.dataset.on) { clearTimeout(timer); return conceal(); }
      const { value } = await kv("itemValue", { id, k: f.k });
      val.textContent = f.kind === "card" ? cardFmt(value) : value;
      reveal.textContent = tr("hide");
      reveal.dataset.on = "1";
      timer = setTimeout(conceal, 30000);
    }) });
    return el("div", {}, el("dt", { textContent: L(f.label) }), el("dd", {}, val, reveal, copy));
  });

  dlg().replaceChildren(el("div", { className: "fields-wrap" },
    el("h2", { textContent: item.title }),
    el("p", { className: "muted", textContent: L(def.label) }),
    rows.length ? el("dl", { className: "fields" }, ...rows) : el("p", { className: "muted", textContent: tr("item.noFields") }),
    el("div", { className: "actions" },
      el("button", { type: "button", className: "danger", textContent: tr("delete"), onclick: safe(async () => {
        if (!(await ask(tr("confirmDelete", { name: `"${item.title}"` })))) return;
        await kv("itemDelete", { id });
        dlg().close();
        toast(tr("deleted"));
        await load();
      }) }),
      el("button", { type: "button", textContent: tr("edit"), onclick: () => void editItem(item.type, id) }),
      el("button", { type: "button", className: "primary", textContent: tr("close"), onclick: () => dlg().close() }))));
  if (!dlg().open) dlg().showModal();
}

// ── Item: add and edit ──

async function editItem(type: ItemTypeName, id?: string): Promise<void> {
  const def = TYPES[type];
  const current = { title: "", fields: {} as Record<string, string> };
  if (id) {
    // Editing loads the secret fields too, so saving doesn't drop them
    const { item } = await kv("item", { id });
    current.title = item.title;
    for (const f of def.fields) {
      const v = item.fields[f.k];
      if (v == null) continue;
      current.fields[f.k] = typeof v === "string" ? v : (await kv("itemValue", { id, k: f.k })).value;
    }
  }

  const inputs: Record<string, HTMLInputElement | HTMLTextAreaElement> = {};
  const title = el("input", { name: "title", required: true, value: current.title, placeholder: L(def.label) });
  const rows = def.fields.map((f: FieldDef) => {
    const base = { name: f.k, value: current.fields[f.k] || "", placeholder: f.placeholder || "", autocomplete: "off" as AutoFill, spellcheck: false, ...(f.ltr ? { dir: "ltr" } : {}) };
    const multi = f.kind === "multiline";
    const input = multi ? el("textarea", { ...base, rows: 4 }) : el("input", { ...base, type: f.secret ? "password" : "text" });
    inputs[f.k] = input;
    const extra: HTMLElement[] = [];
    if (f.secret && input instanceof HTMLInputElement) {
      const eye = el("button", { type: "button", textContent: tr("show"), onclick: () => {
        const hidden = input.type === "password";
        input.type = hidden ? "text" : "password";
        eye.textContent = hidden ? tr("hide") : tr("show");
      } });
      extra.push(eye);
      if (f.generate) {
        extra.push(el("button", { type: "button", textContent: tr("generate"), onclick: safe(async () => {
          input.value = (await kv("generate", { length: 20 })).value;
          input.type = "text";
          eye.textContent = tr("hide");
        }) }));
      }
    }
    return el("label", {}, L(f.label), extra.length ? el("div", { className: "field-row" }, input, ...extra) : input);
  });

  const errEl = el("p", { className: "err", role: "alert" });
  const form = el("form", { method: "dialog" },
    el("h2", { textContent: tr(id ? "item.editTitle" : "item.addTitle", { type: L(def.label) }) }),
    el("label", {}, tr("item.title"), title),
    ...rows,
    errEl,
    el("div", { className: "actions" },
      el("button", { type: "button", textContent: tr("cancel"), onclick: () => (id ? void openItem(id) : dlg().close()) }),
      el("button", { type: "submit", className: "primary", textContent: tr("save") })));

  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const fields = Object.fromEntries(Object.entries(inputs).map(([k, i]) => [k, i.value]));
    try {
      const res = await kv("itemSave", { id, type, title: title.value, fields });
      toast(tr("saved"));
      await load();
      await openItem(res.id);
    } catch (err) {
      errEl.textContent = message(err);
    }
  });

  dlg().replaceChildren(form);
  if (!dlg().open) dlg().showModal();
  title.focus();
}

function pickType(): void {
  const pick = $<HTMLDialogElement>("#pick");
  $("#pickGrid").replaceChildren(
    ...(Object.entries(TYPES) as [ItemTypeName, TypeDef][]).map(([t, d]) =>
      el("button", { type: "button", textContent: L(d.label), onclick: () => { pick.close(); void editItem(t); } })),
    el("button", { type: "button", textContent: tr("pick.devKey"), onclick: () => { pick.close(); openDev(); } }),
    el("button", { type: "button", className: "wide-btn", textContent: tr("pick.import"), onclick: () => { pick.close(); openImport(); } }));
  pick.showModal();
}

// ── Import from a browser export ──
// The window only picks the file; the backend reads it, so the passwords never enter the page.

const EXPORT_STEPS: [name: string, url: string, viaMenu: boolean][] = [
  ["Chrome", "chrome://password-manager/settings", false],
  ["Edge", "edge://wallet/passwords", true],
  ["Firefox", "about:logins", true],
];

function openImport(): void {
  const errEl = el("p", { className: "err", role: "alert" });
  const choose = el("button", { type: "button", className: "primary", textContent: tr("import.choose"), onclick: async () => {
    errEl.textContent = "";
    const file = await window.__TAURI__.dialog.open({ multiple: false, directory: false, filters: [{ name: "CSV", extensions: ["csv"] }] });
    if (typeof file !== "string") return;
    choose.disabled = true;
    try {
      const res = await kv("importCsv", { path: file });
      await load();
      importDone(res);
    } catch (err) {
      errEl.textContent = message(err);
      choose.disabled = false;
    }
  } });
  dlg().replaceChildren(el("div", { className: "fields-wrap" },
    el("h2", { textContent: tr("import.title") }),
    el("p", { className: "muted", textContent: tr("import.lead") }),
    el("ol", { className: "steps" }, ...EXPORT_STEPS.map(([name, url, viaMenu]) =>
      el("li", {}, el("strong", { textContent: name }), " — ", el("code", { dir: "ltr", textContent: url }), ` → ${viaMenu ? "⋯ → " : ""}${tr("import.export")}`))),
    el("p", { className: "muted", textContent: tr("import.also") }),
    errEl,
    el("div", { className: "actions" },
      el("button", { type: "button", textContent: tr("cancel"), onclick: () => dlg().close() }),
      choose)));
  if (!dlg().open) dlg().showModal();
}

function importDone(res: ImportResult): void {
  const parts = [tr("import.added", { n: res.added })];
  if (res.duplicates) parts.push(tr("import.duplicates", { n: res.duplicates }));
  if (res.skipped) parts.push(tr("import.skipped", { n: res.skipped }));
  const del = el("button", { type: "button", className: "primary", textContent: tr("import.deleteFile"), onclick: safe(async () => {
    await kv("importCleanup");
    dlg().close();
    toast(tr("import.fileDeleted"));
  }) });
  dlg().replaceChildren(el("div", { className: "fields-wrap" },
    el("h2", { textContent: tr("import.done") }),
    el("p", { id: "importResult", textContent: parts.join(" · ") }),
    el("p", { className: "muted" }, tr("import.plainBefore"), el("code", { dir: "ltr", textContent: res.file }), tr("import.plainAfter")),
    el("div", { className: "actions" },
      el("button", { type: "button", textContent: tr("import.keep"), onclick: () => dlg().close() }),
      del)));
  cat = "login";
  render();
}

// ── Dev key ──

function openDev(p?: string, e?: DevEntryRow): void {
  const f = $<HTMLFormElement>("#form");
  f.reset();
  $("#dlgTitle").textContent = e ? tr("dev.edit") : tr("dev.add");
  f.p.value = p || "";
  f.k.value = e?.key || "";
  f.note.value = e?.note || "";
  f.p.readOnly = f.k.readOnly = !!e;
  f.value.placeholder = e ? tr("dev.newValue") : "";
  $<HTMLDialogElement>("#dlg").showModal();
}

// ── Create and unlock ──

async function busy(form: HTMLFormElement, errEl: HTMLElement, fn: () => Promise<void>): Promise<void> {
  const btn = form.querySelector<HTMLButtonElement>("button[type=submit]")!;
  btn.disabled = true;
  errEl.textContent = "";
  try {
    await fn();
  } catch (err) {
    errEl.textContent = message(err);
  } finally {
    btn.disabled = false;
  }
}

// ── Wiring ──

// On close, clear the dialog (no passwords left in the DOM)
dlg().addEventListener("close", () => dlg().replaceChildren());

$<HTMLDialogElement>("#dlg").addEventListener("close", async () => {
  const f = $<HTMLFormElement>("#form");
  if ($<HTMLDialogElement>("#dlg").returnValue !== "ok") {
    f.value.value = "";
    return;
  }
  try {
    await kv("set", { p: f.p.value, k: f.k.value, value: f.value.value, note: f.note.value });
    toast(tr("saved"));
    await load();
  } catch (err) {
    toast(message(err));
  } finally {
    f.value.value = "";
  }
});

$<HTMLFormElement>("#setupForm").addEventListener("submit", (ev) => {
  ev.preventDefault();
  const f = ev.currentTarget as HTMLFormElement;
  void busy(f, $("#setupErr"), async () => {
    if (f.a.value !== f.b.value) throw new Error(tr("pw.mismatch"));
    await kv("init", { password: f.a.value });
    f.reset();
    await show();
  });
});

$<HTMLFormElement>("#unlockForm").addEventListener("submit", (ev) => {
  ev.preventDefault();
  const f = ev.currentTarget as HTMLFormElement;
  void busy(f, $("#unlockErr"), async () => {
    await kv("unlock", { password: f.pw.value, remember: f.remember.checked });
    f.reset();
    await show();
  });
});

$("#add").onclick = () => (cat === DEV ? openDev() : isType(cat) ? void editItem(cat) : pickType());
$("#q").oninput = render;
$("#lock").onclick = async () => {
  await kv("lock").catch(() => {});
  items = [];
  projects = {};
  $("#list").replaceChildren();
  $<HTMLInputElement>("#q").value = "";
  await show();
};
$("#forget").onclick = safe(async () => {
  await kv("forget");
  $("#forget").hidden = true;
  toast(tr("forgotten"));
});

// Language switch: the backend follows (so its errors match), the open view re-renders
document.addEventListener("kv-lang", async (ev) => {
  await kv("setLang", { lang: ev.detail }).catch(() => {});
  if (dlg().open) dlg().close();
  if (!$("#main").hidden) render();
});

// On start: if remembered, unlock without a password
void (async () => {
  await kv("setLang", { lang: window.I18N.lang() }).catch(() => {});
  const st = await show();
  if (st?.exists && !st.unlocked && st.remembered) {
    await kv("unlock", {}).then(show, () => {});
  }
})();
