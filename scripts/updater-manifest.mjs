// latest.json for Tauri's updater, from the files a release build left in one folder:
//   node scripts/updater-manifest.mjs <folder> <tag> [notes-file]   (notes: this version's CHANGELOG section)
// Each updatable installer (Windows NSIS setup, Linux AppImage) sits next to its .sig — the signature Tauri wrote with
// the updater key. The app downloads latest.json from the newest release and installs only what that key signed.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const REPO = "liormedan/kv-vault";

/** Updater platform → the installer it downloads */
export const TARGETS = {
  "windows-x86_64": /_x64-setup\.exe$/,
  "linux-x86_64": /_amd64\.AppImage$/,
};

export function manifest(files, readSig, tag, notes = "", date = new Date()) {
  /** @type {Record<string, { signature: string; url: string }>} */
  const platforms = {};
  for (const [platform, re] of Object.entries(TARGETS)) {
    const file = files.find((f) => re.test(f));
    if (!file) continue;
    if (!files.includes(`${file}.sig`)) throw new Error(`${file}: no ${file}.sig — was TAURI_SIGNING_PRIVATE_KEY set?`);
    platforms[platform] = {
      signature: readSig(`${file}.sig`).trim(),
      url: `https://github.com/${REPO}/releases/download/${tag}/${encodeURIComponent(file)}`,
    };
  }
  if (!Object.keys(platforms).length) throw new Error("no updatable installer found");
  return { version: tag.replace(/^v/, ""), notes, pub_date: date.toISOString(), platforms };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [dir, tag, notesFile] = process.argv.slice(2);
  if (!dir || !tag) {
    console.error("usage: node scripts/updater-manifest.mjs <folder> <tag> [notes-file]");
    process.exit(1);
  }
  const notes = notesFile ? fs.readFileSync(notesFile, "utf8").trim() : "";
  const m = manifest(fs.readdirSync(dir), (f) => fs.readFileSync(path.join(dir, f), "utf8"), tag, notes);
  fs.writeFileSync(path.join(dir, "latest.json"), `${JSON.stringify(m, null, 2)}\n`);
  console.log(`latest.json: ${m.version} for ${Object.keys(m.platforms).join(", ")}`);
}
