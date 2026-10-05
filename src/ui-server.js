// Browser UI (kv ui): a local server on 127.0.0.1 only, random port, random token in the URL.
// Protections: Host must be 127.0.0.1 (against DNS rebinding), every API call needs the token header,
// no CORS, and automatic shutdown after 15 idle minutes.
import { randomBytes, timingSafeEqual } from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import { getLang, messages, t } from "./i18n.js";
import * as store from "./store.js";

const IDLE_MS = 15 * 60 * 1000;
const TEMPLATE = fs.readFileSync(new URL("./ui.html", import.meta.url), "utf8");
const esc = (v) => String(v).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// The page in the current language: {{key}} → escaped text, {{T}} → the web.* strings as JSON for the script
function page() {
  const m = messages();
  const web = Object.fromEntries(Object.entries(m).filter(([k]) => k.startsWith("web.")));
  return TEMPLATE.replace(/\{\{([\w.]+)\}\}/g, (_, k) => {
    if (k === "lang") return getLang();
    if (k === "dir") return getLang() === "he" ? "rtl" : "ltr";
    if (k === "T") return JSON.stringify(web).replace(/</g, "\\u003c");
    return esc(t(k));
  });
}

export function startUi({ key, data }) {
  const token = randomBytes(24).toString("hex");
  const tokenBuf = Buffer.from(token);
  let idle;
  const bump = () => {
    clearTimeout(idle);
    idle = setTimeout(() => shutdown(t("ui.idle")), IDLE_MS);
  };

  const server = http.createServer(async (req, res) => {
    const send = (status, body, type = "application/json; charset=utf-8") => {
      res.writeHead(status, {
        "Content-Type": type,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
        "Content-Security-Policy": "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'",
      });
      res.end(typeof body === "string" ? body : JSON.stringify(body));
    };

    const { port } = server.address();
    if (req.headers.host !== `127.0.0.1:${port}`) return send(403, { error: "host" });
    const url = new URL(req.url, `http://127.0.0.1:${port}`);

    if (req.method === "GET" && url.pathname === "/") return send(200, page(), "text/html; charset=utf-8");
    if (!url.pathname.startsWith("/api/")) return send(404, { error: "not found" });

    const got = Buffer.from(String(req.headers["x-kv-token"] || ""));
    if (got.length !== tokenBuf.length || !timingSafeEqual(got, tokenBuf)) return send(401, { error: "token" });
    if (req.headers.origin && req.headers.origin !== `http://127.0.0.1:${port}`) return send(403, { error: "origin" });
    bump();

    try {
      let body = {};
      if (req.method === "POST") {
        let raw = "";
        for await (const c of req) {
          raw += c;
          if (raw.length > 100_000) return send(413, { error: t("ui.tooBig") });
        }
        body = raw ? JSON.parse(raw) : {};
      }

      switch (`${req.method} ${url.pathname}`) {
        case "GET /api/list":
          return send(200, { vault: store.VAULT, projects: store.listing(data) });
        case "GET /api/value":
          return send(200, { value: store.getEntry(data, url.searchParams.get("p"), url.searchParams.get("k")).value });
        case "POST /api/set": {
          const p = String(body.p || "").trim();
          const k = String(body.k || "").trim();
          if (!p || !k || p.includes("/") || !body.value) return send(422, { error: t("entry.missing") });
          store.setEntry(data, p, k, String(body.value), body.note == null ? undefined : String(body.note));
          await store.save(key, data);
          return send(200, { ok: true });
        }
        case "POST /api/delete":
          store.deleteEntry(data, String(body.p), String(body.k));
          await store.save(key, data);
          return send(200, { ok: true });
        case "POST /api/lock":
          send(200, { ok: true });
          return shutdown(t("ui.locked"));
        default:
          return send(404, { error: "not found" });
      }
    } catch (e) {
      return send(400, { error: e.message });
    }
  });

  function shutdown(reason) {
    process.stderr.write(`kv ui: ${reason}\n`);
    server.close();
    server.closeAllConnections?.();
    process.exit(0);
  }

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      // The token is in the fragment (#) — never sent to the server or logged in request history
      const url = `http://127.0.0.1:${port}/#${token}`;
      process.stderr.write(`${t("ui.open", { url })}\n`);
      if (process.platform === "win32" && !process.env.KV_NO_OPEN) spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore", windowsHide: true }).unref();
      bump();
      process.on("SIGINT", () => shutdown(t("ui.closed")));
      resolve(url);
    });
  });
}
