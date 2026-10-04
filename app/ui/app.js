// The desktop window. Every action goes to src/backend.js through Tauri's `kv` command.
// Secret fields reach the window only on reveal or edit; copy goes from the backend straight to the clipboard.
const invoke = window.__TAURI__.core.invoke;
const $ = (s) => document.querySelector(s);
const el = (tag, attrs = {}, ...kids) => { const e = document.createElement(tag); Object.assign(e, attrs); e.append(...kids.filter((k) => k != null)); return e; };
const toast = (msg) => { const t = $("#toast"); t.textContent = msg; t.classList.add("on"); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("on"), 2200); };
const COPIED = "הועתק — הלוח יתנקה בעוד 20 שניות";
const DEV = "dev";

let TYPES = {};
let items = [];
let projects = {};
let cat = "all";

async function kv(method, params) {
  try {
    return await invoke("kv", { method, params });
  } catch (e) {
    const msg = String(e);
    if (msg === "locked") { await show(); throw new Error("הכספת ננעלה"); }
    throw new Error(msg);
  }
}
const safe = (fn) => async (...a) => { try { await fn(...a); } catch (err) { toast(err.message); } };

// ── Screens ──

async function show() {
  const st = await invoke("kv", { method: "status" });
  for (const id of ["setup", "unlock", "main"]) $(`#${id}`).hidden = true;
  if (!st.exists) { $("#setup").hidden = false; $("#setupForm").a.focus(); return; }
  if (!st.unlocked) {
    for (const d of document.querySelectorAll("dialog[open]")) d.close();
    $("#rememberRow").hidden = !st.rememberSupported;
    $("#unlock").hidden = false;
    $("#unlockForm").pw.focus();
    return st;
  }
  $("#main").hidden = false;
  $("#path").textContent = st.vault;
  $("#forget").hidden = !st.remembered;
  if (!Object.keys(TYPES).length) TYPES = (await kv("types")).types;
  await load();
  return st;
}

async function load() {
  const [a, b] = await Promise.all([kv("items"), kv("list")]);
  items = a.items;
  projects = b.projects;
  render();
}

// ── List ──

const devCount = () => Object.values(projects).reduce((n, keys) => n + keys.length, 0);

function renderCats() {
  const count = (t) => items.filter((i) => i.type === t).length;
  const btn = (id, label, n) => el("button", {
    type: "button", ariaCurrent: String(cat === id), onclick: () => { cat = id; render(); },
  }, el("span", { textContent: label }), el("span", { className: "count", textContent: n || "" }));
  $("#cats").replaceChildren(
    btn("all", "הכול", items.length + devCount()),
    btn("fav", "מועדפים", items.filter((i) => i.fav).length),
    el("hr"),
    ...Object.entries(TYPES).map(([t, d]) => btn(t, d.plural, count(t))),
    el("hr"),
    btn(DEV, "מפתחות פיתוח", devCount()),
  );
}

function render() {
  renderCats();
  const q = $("#q").value.trim().toLowerCase();
  const hit = (...s) => !q || s.some((x) => String(x || "").toLowerCase().includes(q));
  const out = [];

  if (cat !== DEV) {
    const list = items.filter((i) =>
      (cat === "all" || (cat === "fav" ? i.fav : i.type === cat)) && hit(i.title, i.sub, TYPES[i.type]?.label));
    if (list.length) out.push(el("div", { className: "items" }, ...list.map(itemRow)));
  }
  if (cat === DEV || cat === "all") {
    const secs = [];
    for (const p of Object.keys(projects).sort()) {
      const rows = projects[p].filter((e) => hit(p, e.key, e.note));
      if (rows.length) secs.push(el("section", {}, el("h2", { textContent: p }), ...rows.map((e) => devRow(p, e))));
    }
    if (secs.length && cat === "all" && out.length) out.push(el("h3", { className: "group", textContent: "מפתחות פיתוח" }));
    out.push(...secs);
  }

  const empty = q ? "אין תוצאות" : cat === "fav" ? "אין מועדפים — סמן כוכב ליד פריט" : "אין כאן עדיין כלום — לחץ \"הוספה\"";
  $("#list").replaceChildren(...(out.length ? out : [el("p", { className: "empty", textContent: empty })]));
}

function itemRow(i) {
  const def = TYPES[i.type];
  const primary = def.fields.find((f) => f.k === def.primary);
  return el("div", { className: "item" },
    el("button", {
      className: "star", type: "button", textContent: "★", title: i.fav ? "הסר ממועדפים" : "הוסף למועדפים",
      ariaPressed: String(i.fav), ariaLabel: "מועדף",
      onclick: safe(async () => { await kv("itemFav", { id: i.id, fav: !i.fav }); await load(); }),
    }),
    el("button", { className: "open", type: "button", onclick: () => openItem(i.id) },
      el("span", { className: "title" }, i.title, cat === "all" || cat === "fav" ? el("span", { className: "kind", textContent: def.label }) : null),
      el("span", { className: "sub" }, ...bidiParts(i.sub))),
    el("div", { className: "actions" },
      el("button", { type: "button", textContent: `העתק ${primary.label}`, onclick: safe(async () => { await kv("itemCopy", { id: i.id, k: def.primary }); toast(COPIED); }) })));
}

function devRow(p, e) {
  const shown = el("span");
  let hideTimer;
  const hide = () => { clearTimeout(hideTimer); shown.replaceChildren(); reveal.textContent = "הצג"; };
  const reveal = el("button", { textContent: "הצג", onclick: safe(async () => {
    if (shown.textContent) return hide();
    const { value } = await kv("value", { p, k: e.key });
    shown.replaceChildren(el("span", { className: "val", textContent: value })); reveal.textContent = "הסתר";
    hideTimer = setTimeout(hide, 15000);
  }) });
  const copy = el("button", { textContent: "העתק", onclick: safe(async () => { await kv("copy", { p, k: e.key }); toast(COPIED); }) });
  const edit = el("button", { textContent: "עריכה", onclick: () => openDev(p, e) });
  const del = el("button", { className: "danger", textContent: "מחיקה", onclick: safe(async () => {
    if (!confirm(`למחוק את ${p}/${e.key}?`)) return;
    await kv("delete", { p, k: e.key }); toast("נמחק"); await load();
  }) });
  return el("div", { className: "row" },
    el("div", {}, el("div", { className: "name", textContent: e.key }), el("div", { className: "note", textContent: e.note || "" })),
    shown,
    el("div", { className: "actions" }, reveal, copy, edit, del));
}

// ── Item: view ──

const dlg = () => $("#itemDlg");
// Each subtitle part keeps its own direction — otherwise "•••• 9012 · 08/29" flips in the RTL layout
const bidiParts = (text) => String(text || "").split(" · ").flatMap((part, i) => [
  i ? " · " : null,
  el("span", { dir: /[֐-׿]/.test(part) ? "rtl" : "ltr", textContent: part }),
]).filter(Boolean);
const cardFmt = (v) => String(v).replace(/\D/g, "").replace(/(.{4})(?=.)/g, "$1 ");

async function openItem(id) {
  const { item } = await kv("item", { id }).catch((e) => (toast(e.message), {}));
  if (!item) return;
  const def = TYPES[item.type];
  const rows = def.fields.filter((f) => item.fields[f.k] != null).map((f) => {
    const v = item.fields[f.k];
    const val = el("span", { className: `v${f.ltr ? " ltr" : ""}` });
    const copy = el("button", { type: "button", textContent: "העתק", onclick: safe(async () => { await kv("itemCopy", { id, k: f.k }); toast(COPIED); }) });
    if (!f.secret) {
      val.textContent = v;
      return el("div", {}, el("dt", { textContent: f.label }), el("dd", {}, val, copy));
    }
    val.textContent = "••••••••";
    let timer;
    const reveal = el("button", { type: "button", textContent: "הצג", onclick: safe(async () => {
      if (reveal.textContent === "הסתר") { clearTimeout(timer); val.textContent = "••••••••"; reveal.textContent = "הצג"; return; }
      const { value } = await kv("itemValue", { id, k: f.k });
      val.textContent = f.kind === "card" ? cardFmt(value) : value;
      reveal.textContent = "הסתר";
      timer = setTimeout(() => { val.textContent = "••••••••"; reveal.textContent = "הצג"; }, 30000);
    }) });
    return el("div", {}, el("dt", { textContent: f.label }), el("dd", {}, val, reveal, copy));
  });

  dlg().replaceChildren(el("div", { className: "fields-wrap" },
    el("h2", { textContent: item.title }),
    el("p", { className: "muted", textContent: def.label }),
    rows.length ? el("dl", { className: "fields" }, ...rows) : el("p", { className: "muted", textContent: "אין שדות מלאים" }),
    el("div", { className: "actions" },
      el("button", { type: "button", className: "danger", textContent: "מחיקה", onclick: safe(async () => {
        if (!confirm(`למחוק את "${item.title}"?`)) return;
        await kv("itemDelete", { id }); dlg().close(); toast("נמחק"); await load();
      }) }),
      el("button", { type: "button", textContent: "עריכה", onclick: () => editItem(item.type, id) }),
      el("button", { type: "button", className: "primary", textContent: "סגירה", onclick: () => dlg().close() }))));
  if (!dlg().open) dlg().showModal();
}

// ── Item: add and edit ──

async function editItem(type, id) {
  const def = TYPES[type];
  let current = { title: "", fields: {} };
  if (id) {
    // Editing loads the secret fields too, so saving doesn't drop them
    const { item } = await kv("item", { id });
    current = { title: item.title, fields: {} };
    for (const f of def.fields) {
      const v = item.fields[f.k];
      if (v == null) continue;
      current.fields[f.k] = f.secret ? (await kv("itemValue", { id, k: f.k })).value : v;
    }
  }

  const inputs = {};
  const title = el("input", { name: "title", required: true, value: current.title, placeholder: def.label });
  const rows = def.fields.map((f) => {
    const multi = f.kind === "multiline";
    const input = el(multi ? "textarea" : "input", {
      name: f.k, value: current.fields[f.k] || "", placeholder: f.placeholder || "", autocomplete: "off", spellcheck: false,
      ...(f.ltr ? { dir: "ltr" } : {}), ...(multi ? { rows: 4 } : { type: f.secret ? "password" : "text" }),
    });
    inputs[f.k] = input;
    const extra = [];
    if (f.secret && !multi) {
      const eye = el("button", { type: "button", textContent: "הצג", onclick: () => {
        const hidden = input.type === "password";
        input.type = hidden ? "text" : "password"; eye.textContent = hidden ? "הסתר" : "הצג";
      } });
      extra.push(eye);
      if (f.generate) {
        extra.push(el("button", { type: "button", textContent: "צור סיסמה", onclick: safe(async () => {
          input.value = (await kv("generate", { length: 20 })).value;
          input.type = "text"; eye.textContent = "הסתר";
        }) }));
      }
    }
    return el("label", {}, f.label, extra.length ? el("div", { className: "field-row" }, input, ...extra) : input);
  });

  const form = el("form", { method: "dialog" },
    el("h2", { textContent: id ? `עריכה — ${def.label}` : `הוספה — ${def.label}` }),
    el("label", {}, "כותרת", title),
    ...rows,
    el("p", { className: "err", role: "alert" }),
    el("div", { className: "actions" },
      el("button", { type: "button", textContent: "ביטול", onclick: () => (id ? openItem(id) : dlg().close()) }),
      el("button", { type: "submit", className: "primary", textContent: "שמירה" })));

  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const fields = Object.fromEntries(Object.entries(inputs).map(([k, i]) => [k, i.value]));
    try {
      const res = await kv("itemSave", { id, type, title: title.value, fields });
      toast("נשמר");
      await load();
      await openItem(res.id);
    } catch (err) { form.querySelector(".err").textContent = err.message; }
  });

  dlg().replaceChildren(form);
  if (!dlg().open) dlg().showModal();
  title.focus();
}

// On close, clear the dialog (no passwords left in the DOM)
dlg().addEventListener("close", () => dlg().replaceChildren());

function pickType() {
  $("#pickGrid").replaceChildren(
    ...Object.entries(TYPES).map(([t, d]) => el("button", { type: "button", textContent: d.label, onclick: () => { $("#pick").close(); editItem(t); } })),
    el("button", { type: "button", textContent: "מפתח פיתוח", onclick: () => { $("#pick").close(); openDev(); } }));
  $("#pick").showModal();
}

// ── Dev key ──

function openDev(p, e) {
  const f = $("#form");
  f.reset();
  $("#dlgTitle").textContent = e ? "עריכת מפתח פיתוח" : "הוספת מפתח פיתוח";
  f.p.value = p || ""; f.k.value = e?.key || ""; f.note.value = e?.note || "";
  f.p.readOnly = f.k.readOnly = !!e;
  f.value.placeholder = e ? "ערך חדש" : "";
  $("#dlg").showModal();
}

$("#dlg").addEventListener("close", async () => {
  const f = $("#form");
  if ($("#dlg").returnValue !== "ok") { f.value.value = ""; return; }
  try { await kv("set", { p: f.p.value, k: f.k.value, value: f.value.value, note: f.note.value }); toast("נשמר"); await load(); }
  catch (err) { toast(err.message); }
  finally { f.value.value = ""; }
});

// ── Create and unlock ──

async function busy(form, errEl, fn) {
  const btn = form.querySelector("button[type=submit]");
  btn.disabled = true; errEl.textContent = "";
  try { await fn(); }
  catch (err) { errEl.textContent = String(err.message || err); }
  finally { btn.disabled = false; }
}

$("#setupForm").addEventListener("submit", (ev) => {
  ev.preventDefault();
  const f = ev.target;
  busy(f, $("#setupErr"), async () => {
    if (f.a.value !== f.b.value) throw new Error("הסיסמאות לא תואמות");
    await kv("init", { password: f.a.value });
    f.reset();
    await show();
  });
});

$("#unlockForm").addEventListener("submit", (ev) => {
  ev.preventDefault();
  const f = ev.target;
  busy(f, $("#unlockErr"), async () => {
    await kv("unlock", { password: f.pw.value, remember: f.remember.checked });
    f.reset();
    await show();
  });
});

$("#add").onclick = () => (cat === DEV ? openDev() : TYPES[cat] ? editItem(cat) : pickType());
$("#q").oninput = render;
$("#lock").onclick = async () => {
  await kv("lock").catch(() => {});
  items = []; projects = {}; $("#list").replaceChildren(); $("#q").value = "";
  await show();
};
$("#forget").onclick = safe(async () => { await kv("forget"); $("#forget").hidden = true; toast("הזכירה בוטלה — בפעם הבאה תידרש סיסמת אב"); });

// On start: if remembered, unlock without a password
(async () => {
  const st = await show();
  if (st?.exists && !st.unlocked && st.remembered) {
    await invoke("kv", { method: "unlock" }).then(show, () => {});
  }
})();
