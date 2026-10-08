// The desktop window. Every action goes to the backend (src/backend.ts) through Tauri's `kv` command,
// typed against src/protocol.ts — the same contract the backend implements.
// Secret fields reach the window only on reveal or edit; copy goes from the backend straight to the clipboard.
import type { BreachReport, FieldDef, HealthReport, ItemTypeName, ListedDevKey as DevEntryRow, ListedItem, MaskedItem, TypeDef } from "../../src/model.ts";
import type { BrowserStatus } from "../../src/browser-setup.ts";
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

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Partial<HTMLElementTagNameMap[K]> & Record<string, unknown> = {},
  ...kids: Kid[]
): HTMLElementTagNameMap[K] {
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
const HEALTH = "health";
type Category = "all" | "fav" | typeof DEV | typeof HEALTH | ItemTypeName;

let TYPES = {} as Record<ItemTypeName, TypeDef>;
let items: ListedItem[] = [];
let projects: Record<string, DevEntryRow[]> = {};
let cat: Category = "all";
let health: HealthReport | null = null;
let breaches: BreachReport | null = null;

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
  health = null; // recomputed on the next visit — items may have changed
  render();
}

// ── List ──

const devCount = () => Object.values(projects).reduce((n, keys) => n + keys.length, 0);

function renderCats(): void {
  const count = (t: ItemTypeName) => items.filter((i) => i.type === t).length;
  const btn = (id: Category, label: string, n: number) =>
    el(
      "button",
      {
        type: "button",
        ariaCurrent: String(cat === id),
        onclick: () => {
          cat = id;
          render();
        },
      },
      el("span", { textContent: label }),
      el("span", { className: "count", textContent: n ? String(n) : "" }),
    );
  $("#cats").replaceChildren(
    btn("all", tr("cat.all"), items.length + devCount()),
    btn("fav", tr("cat.fav"), items.filter((i) => i.fav).length),
    btn(HEALTH, tr("cat.health"), 0),
    el("hr"),
    ...(Object.entries(TYPES) as [ItemTypeName, TypeDef][]).map(([t, d]) => btn(t, L(d.plural), count(t))),
    el("hr"),
    btn(DEV, tr("cat.dev"), devCount()),
  );
}

function render(): void {
  renderCats();
  if (cat === HEALTH) {
    renderHealth();
    return;
  }
  const q = $<HTMLInputElement>("#q").value.trim().toLowerCase();
  const hit = (...s: (string | undefined)[]) =>
    !q ||
    s.some((x) =>
      String(x || "")
        .toLowerCase()
        .includes(q),
    );
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
  return el(
    "div",
    { className: "item" },
    el("button", {
      className: "star",
      type: "button",
      textContent: "★",
      title: i.fav ? tr("fav.remove") : tr("fav.add"),
      ariaPressed: String(i.fav),
      ariaLabel: tr("fav.label"),
      onclick: safe(async () => {
        await kv("itemFav", { id: i.id, fav: !i.fav });
        await load();
      }),
    }),
    el(
      "button",
      { className: "open", type: "button", onclick: () => void openItem(i.id) },
      el("span", { className: "title" }, i.title, cat === "all" || cat === "fav" ? el("span", { className: "kind", textContent: L(def.label) }) : null),
      el("span", { className: "sub" }, ...bidiParts(i.sub)),
    ),
    el(
      "div",
      { className: "actions" },
      el("button", {
        type: "button",
        textContent: tr("copyField", { field: L(primary?.label) }),
        onclick: safe(async () => {
          await kv("itemCopy", { id: i.id, k: def.primary });
          toast(tr("copied"));
        }),
      }),
    ),
  );
}

function devRow(p: string, e: DevEntryRow): HTMLElement {
  const shown = el("span");
  let hideTimer: ReturnType<typeof setTimeout> | undefined;
  const hide = () => {
    clearTimeout(hideTimer);
    shown.replaceChildren();
    reveal.textContent = tr("show");
  };
  const reveal = el("button", {
    textContent: tr("show"),
    onclick: safe(async () => {
      if (shown.textContent) return hide();
      const { value } = await kv("value", { p, k: e.key });
      shown.replaceChildren(el("span", { className: "val", textContent: value }));
      reveal.textContent = tr("hide");
      hideTimer = setTimeout(hide, 15000);
    }),
  });
  const copy = el("button", {
    textContent: tr("copy"),
    onclick: safe(async () => {
      await kv("copy", { p, k: e.key });
      toast(tr("copied"));
    }),
  });
  const edit = el("button", { textContent: tr("edit"), onclick: () => openDev(p, e) });
  const del = el("button", {
    className: "danger",
    textContent: tr("delete"),
    onclick: safe(async () => {
      if (!(await ask(tr("confirmDelete", { name: `${p}/${e.key}` })))) return;
      await kv("delete", { p, k: e.key });
      toast(tr("deleted"));
      await load();
    }),
  });
  return el(
    "div",
    { className: "row" },
    el(
      "div",
      {},
      el(
        "div",
        { className: "name", textContent: e.key },
        ...(e.envs ?? []).map((n) => el("span", { className: "env-tag", textContent: n, title: tr("dev.envTag") })),
      ),
      el("div", { className: "note", textContent: e.note || "" }),
    ),
    shown,
    el("div", { className: "actions" }, reveal, copy, edit, del),
  );
}

// ── Password health ──
// The backend computes the report from the open vault; the window gets item names and reasons, never a password.

let healthLoading = false;

async function loadHealth(): Promise<void> {
  if (healthLoading) return;
  healthLoading = true;
  try {
    health = await kv("health");
  } catch (e) {
    toast(message(e));
  } finally {
    healthLoading = false;
  }
  if (cat === HEALTH) render();
}

const MAX_ROWS = 50;

function healthRows(list: ListedItem[], tag?: (i: ListedItem) => string): HTMLElement[] {
  const rows = list
    .slice(0, MAX_ROWS)
    .map((i) =>
      el(
        "div",
        { className: "hrow" },
        el(
          "button",
          { className: "open", type: "button", onclick: () => void openItem(i.id) },
          el("span", { className: "title", textContent: i.title }),
          el("span", { className: "sub" }, ...bidiParts(i.sub)),
        ),
        tag ? el("span", { className: "kind", textContent: tag(i) }) : null,
      ),
    );
  if (list.length > MAX_ROWS) rows.push(el("p", { className: "muted more", textContent: tr("health.more", { n: list.length - MAX_ROWS }) }));
  return rows;
}

function breachBox(): HTMLElement {
  const out = el("div", { className: "breach-out" });
  if (breaches) {
    const b = breaches;
    out.append(
      el("p", {
        className: b.found.length ? "bad" : "good",
        textContent: b.found.length ? tr("breach.found", { n: b.found.length }) : tr("breach.none", { n: b.checked }),
      }),
      ...b.found
        .slice(0, MAX_ROWS)
        .map((f) =>
          el(
            "div",
            { className: "group" },
            el("p", { className: "muted", textContent: tr("breach.seen", { count: f.count.toLocaleString() }) }),
            ...healthRows(f.items),
          ),
        ),
    );
  }
  const check = el("button", {
    type: "button",
    className: breaches ? "" : "primary",
    textContent: tr(breaches ? "breach.again" : "breach.check"),
    onclick: async () => {
      check.disabled = true;
      check.textContent = tr("health.loading");
      try {
        breaches = await kv("breaches");
      } catch (e) {
        toast(message(e));
      }
      render();
    },
  });
  return el(
    "section",
    { className: "breach" },
    el("h2", { textContent: tr("breach.title") }),
    el("p", { className: "muted", textContent: tr("breach.lead") }),
    out,
    el("div", { className: "actions" }, check),
  );
}

function renderHealth(): void {
  if (!health) {
    void loadHealth();
    $("#list").replaceChildren(el("p", { className: "empty", textContent: tr("health.loading") }));
    return;
  }
  const h = health;
  const reason = new Map(h.weak.map((w) => [w.item.id, tr(`weak.${w.reason}`)]));
  const part = (title: string, lead: string | null, body: HTMLElement[]) =>
    el("section", {}, el("h2", { textContent: title }), lead ? el("p", { className: "muted lead", textContent: lead }) : null, ...body);
  const out: HTMLElement[] = [
    el(
      "p",
      { className: "health-sum" },
      tr("health.summary", { n: h.checked }),
      ...[
        [h.reused.length, "health.reusedCount"],
        [h.weak.length, "health.weakCount"],
        [h.old.length, "health.oldCount"],
      ].map(([n, key]) => el("span", { className: `chip${n ? " warn" : ""}`, textContent: tr(key as "health.reusedCount", { n }) })),
    ),
    breachBox(),
  ];
  if (h.reused.length)
    out.push(
      part(
        tr("health.reused"),
        tr("health.reusedLead"),
        h.reused
          .slice(0, MAX_ROWS)
          .map((g) => el("div", { className: "group" }, el("p", { className: "muted", textContent: tr("health.group", { n: g.length }) }), ...healthRows(g))),
      ),
    );
  if (h.weak.length)
    out.push(
      part(
        tr("health.weak"),
        null,
        healthRows(
          h.weak.map((w) => w.item),
          (i) => reason.get(i.id) ?? "",
        ),
      ),
    );
  if (h.old.length) out.push(part(tr("health.old"), null, healthRows(h.old)));
  if (!h.reused.length && !h.weak.length && !h.old.length) out.push(el("p", { className: "empty", textContent: tr("health.clean") }));
  if (h.no2fa.length) out.push(part(`${tr("health.no2fa")} (${h.no2fa.length})`, tr("health.no2faLead"), healthRows(h.no2fa)));
  $("#list").replaceChildren(...out);
}

// ── Item: view ──

const dlg = () => $<HTMLDialogElement>("#itemDlg");

// Each subtitle part keeps its own direction — otherwise "•••• 9012 · 08/29" flips in the RTL layout
const bidiParts = (text: string): (string | HTMLElement)[] =>
  String(text || "")
    .split(" · ")
    .flatMap((part, i) => [...(i ? [" · "] : []), el("span", { dir: /[֐-׿]/.test(part) ? "rtl" : "ltr", textContent: part })]);

const cardFmt = (v: string) => v.replace(/\D/g, "").replace(/(.{4})(?=.)/g, "$1 ");

/** The live two-factor code: fetched when it changes, counted down here. Stops after 5 minutes so an open dialog doesn't keep the vault awake. */
function totpRow(id: string): HTMLElement {
  const code = el("span", { className: "v ltr totp-code", textContent: "··· ···" });
  const left = el("span", { className: "muted totp-left" });
  let remaining = 0;
  let fetches = 0;
  let timer: ReturnType<typeof setInterval> | undefined;
  const refresh = async () => {
    try {
      const r = await kv("itemTotp", { id });
      const half = Math.ceil(r.code.length / 2);
      code.textContent = `${r.code.slice(0, half)} ${r.code.slice(half)}`;
      remaining = r.remaining;
      left.textContent = tr("totp.seconds", { s: remaining });
    } catch (e) {
      clearInterval(timer);
      code.textContent = "";
      left.textContent = message(e);
    }
  };
  timer = setInterval(() => {
    if (!code.isConnected) return clearInterval(timer);
    if (--remaining > 0) {
      left.textContent = tr("totp.seconds", { s: remaining });
      return;
    }
    if (++fetches >= 10) {
      clearInterval(timer);
      code.textContent = "··· ···";
      left.textContent = tr("totp.paused");
      return;
    }
    void refresh();
  }, 1000);
  void refresh();
  const copy = el("button", {
    type: "button",
    textContent: tr("totp.copy"),
    onclick: safe(async () => {
      await kv("itemTotpCopy", { id });
      toast(tr("copied"));
    }),
  });
  return el("div", {}, el("dt", { textContent: tr("totp.label") }), el("dd", {}, code, left, copy));
}
const MASK = "••••••••";

async function openItem(id: string): Promise<void> {
  let item: MaskedItem;
  try {
    ({ item } = await kv("item", { id }));
  } catch (e) {
    toast(message(e));
    return;
  }
  const def = TYPES[item.type];
  const rows = def.fields
    .filter((f) => item.fields[f.k] != null)
    .map((f) => {
      const v = item.fields[f.k];
      const val = el("span", { className: `v${f.ltr ? " ltr" : ""}` });
      const copy = el("button", {
        type: "button",
        textContent: tr("copy"),
        onclick: safe(async () => {
          await kv("itemCopy", { id, k: f.k });
          toast(tr("copied"));
        }),
      });
      if (typeof v === "string") {
        val.textContent = v;
        return el("div", {}, el("dt", { textContent: L(f.label) }), el("dd", {}, val, copy));
      }
      val.textContent = MASK;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const conceal = () => {
        delete reveal.dataset.on;
        val.textContent = MASK;
        reveal.textContent = tr("show");
      };
      const reveal = el("button", {
        type: "button",
        textContent: tr("show"),
        onclick: safe(async () => {
          if (reveal.dataset.on) {
            clearTimeout(timer);
            return conceal();
          }
          const { value } = await kv("itemValue", { id, k: f.k });
          val.textContent = f.kind === "card" ? cardFmt(value) : value;
          reveal.textContent = tr("hide");
          reveal.dataset.on = "1";
          timer = setTimeout(conceal, 30000);
        }),
      });
      const row = el("div", {}, el("dt", { textContent: L(f.label) }), el("dd", {}, val, reveal, copy));
      return f.k === "totp" ? el("div", { className: "pair" }, totpRow(id), row) : row;
    });

  dlg().replaceChildren(
    el(
      "div",
      { className: "fields-wrap" },
      el("h2", { textContent: item.title }),
      el("p", { className: "muted", textContent: L(def.label) }),
      rows.length ? el("dl", { className: "fields" }, ...rows) : el("p", { className: "muted", textContent: tr("item.noFields") }),
      el(
        "div",
        { className: "actions" },
        el("button", {
          type: "button",
          className: "danger",
          textContent: tr("delete"),
          onclick: safe(async () => {
            if (!(await ask(tr("confirmDelete", { name: `"${item.title}"` })))) return;
            await kv("itemDelete", { id });
            dlg().close();
            toast(tr("deleted"));
            await load();
          }),
        }),
        el("button", { type: "button", textContent: tr("edit"), onclick: () => void editItem(item.type, id) }),
        el("button", { type: "button", className: "primary", textContent: tr("close"), onclick: () => dlg().close() }),
      ),
    ),
  );
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
    const base = {
      name: f.k,
      value: current.fields[f.k] || "",
      placeholder: f.placeholder || "",
      autocomplete: "off" as AutoFill,
      spellcheck: false,
      ...(f.ltr ? { dir: "ltr" } : {}),
    };
    const multi = f.kind === "multiline";
    const input = multi ? el("textarea", { ...base, rows: 4 }) : el("input", { ...base, type: f.secret ? "password" : "text" });
    inputs[f.k] = input;
    const extra: HTMLElement[] = [];
    if (f.secret && input instanceof HTMLInputElement) {
      const eye = el("button", {
        type: "button",
        textContent: tr("show"),
        onclick: () => {
          const hidden = input.type === "password";
          input.type = hidden ? "text" : "password";
          eye.textContent = hidden ? tr("hide") : tr("show");
        },
      });
      extra.push(eye);
      if (f.generate) {
        extra.push(
          el("button", {
            type: "button",
            textContent: tr("generate"),
            onclick: safe(async () => {
              input.value = (await kv("generate", { length: 20 })).value;
              input.type = "text";
              eye.textContent = tr("hide");
            }),
          }),
        );
      }
    }
    return el("label", {}, L(f.label), extra.length ? el("div", { className: "field-row" }, input, ...extra) : input);
  });

  const errEl = el("p", { className: "err", role: "alert" });
  const form = el(
    "form",
    { method: "dialog" },
    el("h2", { textContent: tr(id ? "item.editTitle" : "item.addTitle", { type: L(def.label) }) }),
    el("label", {}, tr("item.title"), title),
    ...rows,
    errEl,
    el(
      "div",
      { className: "actions" },
      el("button", { type: "button", textContent: tr("cancel"), onclick: () => (id ? void openItem(id) : dlg().close()) }),
      el("button", { type: "submit", className: "primary", textContent: tr("save") }),
    ),
  );

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
      el("button", {
        type: "button",
        textContent: L(d.label),
        onclick: () => {
          pick.close();
          void editItem(t);
        },
      }),
    ),
    el("button", {
      type: "button",
      textContent: tr("pick.devKey"),
      onclick: () => {
        pick.close();
        openDev();
      },
    }),
    el("button", {
      type: "button",
      className: "wide-btn",
      textContent: tr("pick.import"),
      onclick: () => {
        pick.close();
        openImport();
      },
    }),
  );
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
  const choose = el("button", {
    type: "button",
    className: "primary",
    textContent: tr("import.choose"),
    onclick: async () => {
      errEl.textContent = "";
      const file = await window.__TAURI__.dialog.open({
        multiple: false,
        directory: false,
        filters: [{ name: tr("import.filter"), extensions: ["csv", "1pux", "json", "xml"] }],
      });
      if (typeof file !== "string") return;
      choose.disabled = true;
      try {
        const res = await kv("importFile", { path: file });
        await load();
        importDone(res);
      } catch (err) {
        errEl.textContent = message(err);
        choose.disabled = false;
      }
    },
  });
  dlg().replaceChildren(
    el(
      "div",
      { className: "fields-wrap" },
      el("h2", { textContent: tr("import.title") }),
      el("p", { className: "muted", textContent: tr("import.lead") }),
      el(
        "ol",
        { className: "steps" },
        ...EXPORT_STEPS.map(([name, url, viaMenu]) =>
          el(
            "li",
            {},
            el("strong", { textContent: name }),
            " — ",
            el("code", { dir: "ltr", textContent: url }),
            ` → ${viaMenu ? "⋯ → " : ""}${tr("import.export")}`,
          ),
        ),
      ),
      el("p", { className: "muted", textContent: tr("import.also") }),
      errEl,
      el("div", { className: "actions" }, el("button", { type: "button", textContent: tr("cancel"), onclick: () => dlg().close() }), choose),
    ),
  );
  if (!dlg().open) dlg().showModal();
}

function importDone(res: ImportResult): void {
  const parts = [`${res.format}: ${tr("import.added", { n: res.added })}`];
  if (res.duplicates) parts.push(tr("import.duplicates", { n: res.duplicates }));
  if (res.skipped) parts.push(tr("import.skipped", { n: res.skipped }));
  const del = el("button", {
    type: "button",
    className: "primary",
    textContent: tr("import.deleteFile"),
    onclick: safe(async () => {
      await kv("importCleanup");
      dlg().close();
      toast(tr("import.fileDeleted"));
    }),
  });
  dlg().replaceChildren(
    el(
      "div",
      { className: "fields-wrap" },
      el("h2", { textContent: tr("import.done") }),
      el("p", { id: "importResult", textContent: parts.join(" · ") }),
      el("p", { className: "muted" }, tr("import.plainBefore"), el("code", { dir: "ltr", textContent: res.file }), tr("import.plainAfter")),
      el("div", { className: "actions" }, el("button", { type: "button", textContent: tr("import.keep"), onclick: () => dlg().close() }), del),
    ),
  );
  cat = "all";
  render();
}

// ── Browser extension ──
// Off until the user turns it on here; turning it on registers kv-vault's native messaging host with the browsers.

function pathBox(dir: string): HTMLElement {
  const copy = el("button", {
    type: "button",
    textContent: tr("browser.copyPath"),
    onclick: async () => {
      await navigator.clipboard.writeText(dir).then(
        () => toast(tr("browser.copied")),
        () => window.getSelection()?.selectAllChildren(code),
      );
    },
  });
  const code = el("code", { dir: "ltr", className: "path-box", textContent: dir });
  return el("div", { className: "field-row" }, code, copy);
}

async function openBrowser(): Promise<void> {
  let st: BrowserStatus;
  try {
    st = await kv("browserStatus");
  } catch (e) {
    toast(message(e));
    return;
  }
  const render = (s: BrowserStatus) => {
    const toggle = el("button", {
      type: "button",
      className: s.enabled ? "" : "primary",
      textContent: tr(s.enabled ? "browser.turnOff" : "browser.turnOn"),
      onclick: safe(async () => {
        toggle.disabled = true;
        render(await kv(s.enabled ? "browserDisable" : "browserEnable"));
      }),
    });
    const state = s.enabled ? (s.registered.length ? tr("browser.on", { browsers: s.registered.join(", ") }) : tr("browser.onNone")) : tr("browser.off");
    const steps: HTMLElement[] =
      s.enabled && s.chromeExtension
        ? [
            el("p", { textContent: tr("browser.how") }),
            el(
              "ol",
              { className: "steps" },
              el(
                "li",
                {},
                tr("browser.step1"),
                " ",
                el("code", { dir: "ltr", textContent: "chrome://extensions" }),
                " · ",
                el("code", { dir: "ltr", textContent: "edge://extensions" }),
              ),
              el("li", {}, tr("browser.step2"), pathBox(s.chromeExtension)),
              el("li", { textContent: tr("browser.step3") }),
            ),
            ...(s.firefoxExtension ? [el("p", { className: "muted", textContent: tr("browser.firefox") }), pathBox(s.firefoxExtension)] : []),
          ]
        : [];
    dlg().replaceChildren(
      el(
        "div",
        { className: "fields-wrap" },
        el("h2", { textContent: tr("browser.title") }),
        el("p", { className: "muted", textContent: tr("browser.lead") }),
        el("p", { className: "browser-state" }, el("span", { className: `chip${s.enabled ? " on" : ""}`, id: "browserState", textContent: state })),
        ...steps,
        el("p", { className: "muted", textContent: tr("browser.what") }),
        el(
          "div",
          { className: "actions" },
          toggle,
          el("button", { type: "button", className: s.enabled ? "primary" : "", textContent: tr("close"), onclick: () => dlg().close() }),
        ),
      ),
    );
  };
  render(st);
  if (!dlg().open) dlg().showModal();
}

// ── Emergency export ──
// An encrypted copy under its own password, or under a generated recovery code shown once.

function openExport(): void {
  const errEl = el("p", { className: "err", role: "alert" });
  const mode = { code: true };
  const radio = (code: boolean, label: string) =>
    el(
      "label",
      { className: "check" },
      el("input", {
        type: "radio",
        name: "exportMode",
        checked: mode.code === code,
        onchange: () => {
          mode.code = code;
          pwBox.hidden = code;
        },
      }),
      label,
    );
  const a = el("input", { type: "password", autocomplete: "new-password", dir: "ltr" });
  const b = el("input", { type: "password", autocomplete: "new-password", dir: "ltr" });
  const pwBox = el("div", { className: "fields-wrap", hidden: true }, el("label", {}, tr("export.password"), a), el("label", {}, tr("export.again"), b));
  const save = el("button", {
    type: "button",
    className: "primary",
    textContent: tr("export.save"),
    onclick: async () => {
      errEl.textContent = "";
      if (!mode.code && (!a.value || a.value !== b.value)) {
        errEl.textContent = tr(a.value ? "pw.mismatch" : "export.noPassword");
        return;
      }
      const stamp = new Date().toISOString().slice(0, 10);
      const file = await window.__TAURI__.dialog.save({ defaultPath: `kv-vault-export-${stamp}.kv`, filters: [{ name: "kv-vault", extensions: ["kv"] }] });
      if (typeof file !== "string") return;
      save.disabled = true;
      try {
        const res = await kv("exportVault", mode.code ? { path: file } : { path: file, password: a.value });
        a.value = b.value = "";
        exportDone(file, res.code);
      } catch (err) {
        errEl.textContent = message(err);
        save.disabled = false;
      }
    },
  });
  dlg().replaceChildren(
    el(
      "div",
      { className: "fields-wrap" },
      el("h2", { textContent: tr("export.title") }),
      el("p", { className: "muted", textContent: tr("export.lead") }),
      radio(true, tr("export.withCode")),
      radio(false, tr("export.withPassword")),
      pwBox,
      el("p", { className: "muted", textContent: tr("export.snapshot") }),
      errEl,
      el("div", { className: "actions" }, el("button", { type: "button", textContent: tr("cancel"), onclick: () => dlg().close() }), save),
    ),
  );
  if (!dlg().open) dlg().showModal();
}

function exportDone(file: string, code?: string): void {
  dlg().replaceChildren(
    el(
      "div",
      { className: "fields-wrap" },
      el("h2", { textContent: tr("export.done") }),
      el("p", {}, tr("export.savedTo"), " ", el("code", { dir: "ltr", textContent: file })),
      code ? el("p", { textContent: tr("export.codeLead") }) : el("p", { className: "muted", textContent: tr("export.passwordDone") }),
      code ? el("p", { className: "recovery-code", id: "recoveryCode", dir: "ltr", textContent: code }) : null,
      el("p", { className: "muted" }, tr("export.restore"), " ", el("code", { dir: "ltr", textContent: "kv restore <file>" })),
      el("div", { className: "actions" }, el("button", { type: "button", className: "primary", textContent: tr("close"), onclick: () => dlg().close() })),
    ),
  );
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
/** Forget everything the window was showing, then go to the unlock screen */
async function lockedView(): Promise<void> {
  items = [];
  projects = {};
  $("#list").replaceChildren();
  $<HTMLInputElement>("#q").value = "";
  await show();
}

$("#lock").onclick = async () => {
  await kv("lock").catch(() => {});
  await lockedView();
};

// Windows was locked (or the machine slept): the shell already locked the backend
void window.__TAURI__.event.listen("kv-locked", () => void lockedView());
$("#exportBtn").onclick = () => openExport();
$("#browserBtn").onclick = () => void openBrowser();
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
