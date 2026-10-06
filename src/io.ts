// Hidden input, stdin reading, and a clipboard that clears itself.
import { createHash } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { t } from "./i18n.ts";

// Typing without echo. The prompt goes to stderr so stdout stays clean for pipes (kv get … | …).
export function readHidden(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const { stdin, stderr } = process;
    if (!stdin.isTTY) return reject(new Error(t("tty.none")));
    stderr.write(prompt);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    let buf = "";
    const done = (err?: Error) => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener("data", onData);
      stderr.write("\n");
      err ? reject(err) : resolve(buf);
    };
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n") return done();
        if (ch === "\u0003") return done(new Error(t("cancelled")));
        if (ch === "\u0008" || ch === "\u007f") buf = buf.slice(0, -1);
        else if (ch >= " ") buf += ch;
      }
    };
    stdin.on("data", onData);
  });
}

export async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of process.stdin) chunks.push(c);
  return Buffer.concat(chunks).toString("utf8").replace(/\r?\n$/, "");
}

const sha = (v: string) => createHash("sha256").update(v, "utf8").digest("hex");

// Windows: put text on the clipboard marked as private. Clipboard history (Win+V) and cloud clipboard
// sync skip content that carries these formats — without them, a copied secret outlives the 20-second clear.
// https://learn.microsoft.com/windows/win32/dataxchg/clipboard-formats#cloud-clipboard-and-clipboard-history-formats
export const WIN_PRIVATE_COPY =
  "[Console]::InputEncoding=[Text.Encoding]::UTF8; Add-Type -AssemblyName System.Windows.Forms; " +
  "$d = New-Object System.Windows.Forms.DataObject; $d.SetText([Console]::In.ReadToEnd(), 'UnicodeText'); " +
  "$z = { ,(New-Object System.IO.MemoryStream (,[byte[]](0,0,0,0))) }; " +
  "$d.SetData('ExcludeClipboardContentFromMonitorProcessing', (& $z)); " +
  "$d.SetData('CanIncludeInClipboardHistory', (& $z)); " +
  "$d.SetData('CanUploadToCloudClipboard', (& $z)); " +
  "[System.Windows.Forms.Clipboard]::SetDataObject($d, $true)";

// Reads the clipboard and clears it if it still holds the text with this SHA-256. Prints what it did.
const WIN_CLEAR_IF = (hash: string) =>
  "Add-Type -AssemblyName System.Windows.Forms; $c = [System.Windows.Forms.Clipboard]::GetText(); if ($c) { " +
  "$h = [BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes($c))).Replace('-','').ToLower(); " +
  `if ($h -eq '${hash}') { [System.Windows.Forms.Clipboard]::Clear(); 'cleared' } else { 'changed since - left alone' } } else { 'empty' }`;

/** One clipboard tool per platform: [command, args] to write (value on stdin), read, and clear */
interface Tool {
  copy: [string, string[]];
  read: [string, string[]];
  clear: [string, string[]];
}

function tool(): Tool | "windows" {
  if (process.platform === "win32") return "windows";
  if (process.platform === "darwin") return { copy: ["pbcopy", []], read: ["pbpaste", []], clear: ["pbcopy", []] };
  if (process.env.WAYLAND_DISPLAY) return { copy: ["wl-copy", []], read: ["wl-paste", ["--no-newline"]], clear: ["wl-copy", ["--clear"]] };
  return { copy: ["xclip", ["-selection", "clipboard"]], read: ["xclip", ["-selection", "clipboard", "-o"]], clear: ["xclip", ["-selection", "clipboard"]] };
}

// Copies to the clipboard and clears it after `seconds` — only if it still holds the same value (compares a hash, not the value).
// The clear must outlive `kv copy`, so it runs in a detached Node process. (A detached PowerShell doesn't start at
// all on Windows, and a non-detached child dies with its parent.) Only the hash crosses the command line.
// KV_CLIPBOARD_LOG (tests) records what the clear did.
export function copyWithClear(value: string, seconds: number = 20): void {
  const tl = tool();
  try {
    if (tl === "windows") {
      execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-STA", "-Command", WIN_PRIVATE_COPY], { input: value, windowsHide: true });
    } else {
      execFileSync(tl.copy[0], tl.copy[1], { input: value, stdio: ["pipe", "ignore", "ignore"] });
    }
  } catch (e) {
    const name = tl === "windows" ? "powershell.exe" : tl.copy[0];
    throw new Error(t("clipboard.unavailable", { tool: name, reason: (e as Error).message.split(String.fromCharCode(10))[0] ?? "" }));
  }
  spawn(process.execPath, ["-e", clearScript(sha(value), seconds, tl)], { detached: true, stdio: "ignore", windowsHide: true }).unref();
}

/** The detached clear process's code (exported so a test can check it parses) */
export function clearScript(hash: string, seconds: number, tl: Tool | "windows" = tool()): string {
  const body =
    tl === "windows"
      ? [`out = execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-STA", "-Command", ${JSON.stringify(WIN_CLEAR_IF(hash))}], { encoding: "utf8", windowsHide: true }).trim();`]
      : [
          `const now = execFileSync(${JSON.stringify(tl.read[0])}, ${JSON.stringify(tl.read[1])}, { encoding: "utf8" });`,
          `const h = require("node:crypto").createHash("sha256").update(now, "utf8").digest("hex");`,
          `if (!now) out = "empty";`,
          `else if (h !== ${JSON.stringify(hash)}) out = "changed since - left alone";`,
          `else { execFileSync(${JSON.stringify(tl.clear[0])}, ${JSON.stringify(tl.clear[1])}, { input: "" }); out = "cleared"; }`,
        ];
  return [
    `const { execFileSync } = require("node:child_process");`,
    `setTimeout(() => {`,
    `  let out;`,
    `  try {`,
    ...body.map((l) => `    ${l}`),
    `  } catch (e) { out = "failed: " + e.message; }`,
    `  if (process.env.KV_CLIPBOARD_LOG) require("node:fs").writeFileSync(process.env.KV_CLIPBOARD_LOG, out);`,
    `}, ${Math.max(0, Math.floor(seconds)) * 1000});`,
  ].join(String.fromCharCode(10));
}
