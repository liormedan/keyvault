import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { copyWithClear } from "../src/io.ts";

// Uses the real clipboard, so it only runs where KV_TEST_CLIPBOARD=1 (the Windows CI job) —
// never on a developer's machine, where it would overwrite what they copied.
const enabled = process.platform === "win32" && process.env.KV_TEST_CLIPBOARD === "1";
const ps = (script: string) => execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-STA", "-Command", script], { encoding: "utf8" }).trim();

test("copy is private (no clipboard history, no cloud sync) and clears itself", { skip: !enabled && "set KV_TEST_CLIPBOARD=1 (CI only)" }, async () => {
  const log = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "kv-clip-")), "clear.log");
  process.env.KV_CLIPBOARD_LOG = log;
  copyWithClear("clipboard-test-value-שלום", 2);
  assert.equal(ps("Get-Clipboard -Raw"), "clipboard-test-value-שלום");
  const formats = ps("Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Clipboard]::GetDataObject().GetFormats() -join ','");
  for (const f of ["ExcludeClipboardContentFromMonitorProcessing", "CanIncludeInClipboardHistory", "CanUploadToCloudClipboard"]) {
    assert.ok(formats.includes(f), `${f} missing — the value would land in clipboard history`);
  }
  // the clear starts a fresh PowerShell: allow for a slow start on CI
  for (let i = 0; i < 30 && !fs.existsSync(log); i++) await new Promise((r) => setTimeout(r, 1000));
  const said = fs.existsSync(log) ? fs.readFileSync(log, "utf8").trim() : "(the clear never ran)";
  assert.equal(said, "cleared");
  assert.equal(ps("Get-Clipboard -Raw"), "", "cleared after the timeout");
});
