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

// Copies to the clipboard and clears it after `seconds` — only if it still holds the same value (compares a hash, not the value).
export function copyWithClear(value: string, seconds: number = 20): void {
  execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-STA", "-Command", WIN_PRIVATE_COPY], { input: value, windowsHide: true });
  const script =
    `Start-Sleep -Seconds ${seconds}; $c = Get-Clipboard -Raw; if ($c) { ` +
    `$h = [BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes($c.TrimEnd([char]13,[char]10)))).Replace('-','').ToLower(); ` +
    `if ($h -eq '${sha(value)}') { Set-Clipboard -Value $null } }`;
  spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", script], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  }).unref();
}
