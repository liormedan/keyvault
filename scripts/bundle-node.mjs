// Put a Node.js runtime next to the backend, so the desktop app runs on a machine without Node installed.
// Copies the node binary running this script (CI: actions/setup-node's official build) to
// app/src-tauri/resources/node.exe on Windows, resources/node elsewhere — tauri.windows.conf.json and
// tauri.linux.conf.json bundle it. The copy keeps the executable bit. Desktop builds only — the npm package doesn't
// need it: whoever runs the CLI already has Node.
import fs from "node:fs";

const MIN = [22, 6];
const [major, minor] = process.versions.node.split(".").map(Number);
if (major < MIN[0] || (major === MIN[0] && minor < MIN[1])) {
  console.error(`bundle-node: Node ${process.versions.node} is too old to ship — use ${MIN.join(".")} or newer`);
  process.exit(1);
}
const dest = `app/src-tauri/resources/${process.platform === "win32" ? "node.exe" : "node"}`;
fs.mkdirSync("app/src-tauri/resources", { recursive: true });
const src = fs.statSync(process.execPath);
const same = fs.existsSync(dest) && fs.statSync(dest).size === src.size;
if (!same) fs.copyFileSync(process.execPath, dest);
console.log(`bundle-node: ${dest} ← Node ${process.versions.node} (${Math.round(src.size / 1048576)} MB)${same ? ", already there" : ""}`);
