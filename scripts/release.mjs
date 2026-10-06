// npm run release -- 0.8.0
// Sets the version everywhere it lives (package.json + lock, tauri.conf.json, Cargo.toml + Cargo.lock)
// and dates the "unreleased" section of CHANGELOG.md. Then: commit, PR, merge, and push the tag —
// the release workflow builds and publishes from the tag.
import { execFileSync } from "node:child_process";
import fs from "node:fs";

const version = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(version ?? "")) {
  console.error("Usage: npm run release -- <x.y.z>");
  process.exit(2);
}

const edit = (file, fn) => {
  const before = fs.readFileSync(file, "utf8");
  const after = fn(before);
  if (after === before) throw new Error(`${file}: nothing changed — is the version already ${version}?`);
  fs.writeFileSync(file, after);
  console.log(`  ${file}`);
};

execFileSync("npm", ["version", version, "--no-git-tag-version", "--allow-same-version"], { stdio: "ignore", shell: process.platform === "win32" });
console.log("  package.json, package-lock.json");
edit("app/src-tauri/tauri.conf.json", (s) => s.replace(/("version":\s*")[^"]+(")/, `$1${version}$2`));
edit("app/src-tauri/Cargo.toml", (s) => s.replace(/^version = "[^"]+"/m, `version = "${version}"`));
edit("app/src-tauri/Cargo.lock", (s) => s.replace(/(name = "kv-vault"\r?\nversion = ")[^"]+(")/, `$1${version}$2`));

const today = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD, local time
edit("CHANGELOG.md", (s) => {
  if (!s.includes(`## ${version} — unreleased`)) throw new Error(`CHANGELOG.md has no "## ${version} — unreleased" section`);
  return s.replace(`## ${version} — unreleased`, `## ${version} — ${today}`);
});

console.log(
  `\nVersion ${version} (${today}). Next: commit, open a PR, merge, then\n  git tag -a v${version} -m "kv-vault ${version}" <merge commit> && git push origin refs/tags/v${version}`,
);
