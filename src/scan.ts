// kv scan — find where keys live on disk: .env files and private-key/credential files.
// Reports paths and variable names only, plus whether each value is already somewhere in the vault
// (compared in memory, by hash) and whether the file is tracked by git.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { VaultData } from "./model.ts";

const SKIP = new Set(["node_modules", ".git", "target", "dist", "build", "out", ".next", ".nuxt", ".svelte-kit", ".turbo", ".vercel", ".venv", "venv", "site-packages", "__pycache__", ".cache", ".gradle", "Pods", "DerivedData", ".pnpm-store", "AppData", "Library", ".Trash", "$RECYCLE.BIN", "System Volume Information"]);
const SECRETISH = /KEY|SECRET|TOKEN|PASS|PWD|PRIVATE|CREDENTIAL|AUTH|DSN|DATABASE_URL|_URI$|WEBHOOK|SID|SMTP/i;
const PLACEHOLDER = /^(|your[_-].*|<.*>|x{3,}|\*{3,}|changeme|todo|placeholder|example.*|\.\.\.|null|undefined|true|false|\d{1,5})$/i;
const TEMPLATE = /example|sample|template|defaults|\.dist$/i;
const isEnvName = (n: string) => /^\.env(\..+)?$/i.test(n) || /\.env$/i.test(n) || /^\.dev\.vars$/i.test(n);
const CRED: [RegExp, string][] = [
  [/^id_(rsa|ed25519|ecdsa|dsa)$/i, "ssh-private-key"],
  [/\.(pem|key)$/i, "pem"],
  [/\.(p12|pfx|jks|keystore)$/i, "keystore"],
  [/^\.git-credentials$/i, "git-credentials"],
  [/^\.npmrc$/i, "npmrc"],
  [/^(client_secret.*|.*(service[-_]?account|firebase-adminsdk).*)\.json$/i, "credentials-json"],
];

export interface EnvVarFinding {
  name: string;
  /** a real-looking value (not empty, not a placeholder) */
  filled: boolean;
  /** the name suggests a secret */
  secret: boolean;
  /** where the same value already is in the vault (project/KEY), if anywhere */
  inVault?: string;
}

export interface FileFinding {
  file: string;
  kind: "env" | "template" | string;
  /** tracked by git — committed (or about to be) */
  tracked: boolean | null;
  vars?: EnvVarFinding[];
}

export function parseEnvText(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!m) continue;
    let v = m[2]!;
    if (/^(['"]).*\1$/.test(v)) v = v.slice(1, -1);
    out[m[1]!] = v.replace(/\s+#.*$/, "");
  }
  return out;
}

const sha = (v: string) => createHash("sha256").update(v, "utf8").digest("hex");

/** hash → where the value is in the vault */
export function vaultIndex(data: VaultData | null): Map<string, string> {
  const m = new Map<string, string>();
  if (!data) return m;
  for (const [p, keys] of Object.entries(data.projects)) {
    for (const [k, e] of Object.entries(keys)) {
      if (e.value) m.set(sha(e.value), `${p}/${k}`);
      for (const [env, v] of Object.entries(e.envs ?? {})) m.set(sha(v.value), `${p}/${k} (${env})`);
    }
  }
  return m;
}

const trackedCache = new Map<string, Set<string> | null>();
function isTracked(file: string): boolean | null {
  let d = path.dirname(file);
  let root: string | null = null;
  for (let i = 0; i < 40; i++) {
    if (fs.existsSync(path.join(d, ".git"))) { root = d; break; }
    const up = path.dirname(d);
    if (up === d) break;
    d = up;
  }
  if (!root) return null;
  if (!trackedCache.has(root)) {
    try {
      const out = execFileSync("git", ["-C", root, "ls-files", "-z"], { encoding: "utf8", maxBuffer: 64 << 20, stdio: ["ignore", "pipe", "ignore"] });
      trackedCache.set(root, new Set(out.split("\0").filter(Boolean).map((p) => path.resolve(root!, p).toLowerCase())));
    } catch {
      trackedCache.set(root, null);
    }
  }
  return trackedCache.get(root)?.has(path.resolve(file).toLowerCase()) ?? null;
}

export function scan(root: string, data: VaultData | null, maxDepth = 8): FileFinding[] {
  const index = vaultIndex(data);
  const out: FileFinding[] = [];
  const walk = (dir: string, depth: number) => {
    if (depth > maxDepth) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) {
        if (!SKIP.has(e.name) && !e.name.startsWith("$")) walk(p, depth + 1);
        continue;
      }
      if (!e.isFile()) continue;
      if (isEnvName(e.name)) {
        let text: string;
        try {
          if (fs.statSync(p).size > 512 << 10) continue;
          text = fs.readFileSync(p, "utf8");
        } catch {
          continue;
        }
        const vars = Object.entries(parseEnvText(text)).map(([name, v]) => {
          const filled = !PLACEHOLDER.test(v);
          // only real-looking values: "8080" in the vault and in a file is a coincidence, not a key
          const where = filled ? index.get(sha(v)) : undefined;
          return { name, filled, secret: SECRETISH.test(name), ...(where ? { inVault: where } : {}) };
        });
        out.push({ file: p, kind: TEMPLATE.test(e.name) ? "template" : "env", tracked: isTracked(p), vars });
      } else {
        const hit = CRED.find(([re]) => re.test(e.name));
        if (!hit) continue;
        // only files that actually hold a secret
        let head = "";
        try {
          head = fs.readFileSync(p, "utf8").slice(0, 64 << 10);
        } catch {
          continue;
        }
        if (hit[1] === "pem" && !/PRIVATE KEY/.test(head)) continue;
        if (hit[1] === "npmrc" && !/_authToken\s*=|_auth\s*=|_password\s*=/.test(head)) continue;
        if (hit[1] === "credentials-json" && !/"private_key"|"client_secret"|"refresh_token"/.test(head)) continue;
        out.push({ file: p, kind: hit[1], tracked: isTracked(p) });
      }
    }
  };
  walk(path.resolve(root), 0);
  return out.sort((a, b) => a.file.localeCompare(b.file));
}
