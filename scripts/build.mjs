// One build for everything that ships: the kv CLI, the desktop backend, and the window's scripts.
// esbuild compiles (TypeScript included); type checking is `npm run typecheck`.
import * as esbuild from "esbuild";
import fs from "node:fs";

// libsodium is CommonJS-flavored; bundled into ESM it needs a real `require`
const nodeBanner = "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);";
// @napi-rs/keyring is native (macOS/Linux "remember me"): installed as a dependency, never bundled
const node = { bundle: true, platform: "node", format: "esm", target: "node20", logLevel: "warning", legalComments: "none", external: ["@napi-rs/keyring"] };
const browser = { bundle: true, platform: "browser", format: "iife", target: "es2022", logLevel: "warning", legalComments: "none" };

const entry = (base) => [`${base}.ts`, `${base}.js`].find((f) => fs.existsSync(f));

// ── The browser extension: one source, a manifest per browser family ──
const version = JSON.parse(fs.readFileSync("package.json", "utf8")).version;
const key = /EXTENSION_KEY =\s*"([^"]+)"/.exec(fs.readFileSync("src/browser-ids.ts", "utf8"))[1];
const firefoxId = /FIREFOX_ID = "([^"]+)"/.exec(fs.readFileSync("src/browser-ids.ts", "utf8"))[1];
const base = {
  manifest_version: 3,
  name: "kv-vault",
  version,
  description: "Fill and save logins with kv-vault, your local encrypted vault. No account, no cloud.",
  permissions: ["nativeMessaging", "activeTab", "scripting", "storage"],
  action: { default_popup: "popup.html", default_icon: { 32: "icon-32.png", 128: "icon-128.png" } },
  icons: { 32: "icon-32.png", 128: "icon-128.png" },
  content_scripts: [{ matches: ["https://*/*", "http://*/*"], js: ["content.js"], run_at: "document_idle" }],
  commands: { "fill-login": { suggested_key: { default: "Ctrl+Shift+L", mac: "Command+Shift+L" }, description: "Fill the login for this page" } },
};
const manifests = {
  chrome: { ...base, key, minimum_chrome_version: "116", background: { service_worker: "background.js" } },
  firefox: {
    ...base,
    background: { scripts: ["background.js"] },
    host_permissions: ["https://*/*", "http://*/*"],
    browser_specific_settings: { gecko: { id: firefoxId, strict_min_version: "128.0" } },
  },
};
async function buildExtension(target) {
  const out = `dist/extension/${target}`;
  await fs.promises.rm(out, { recursive: true, force: true });
  await fs.promises.mkdir(out, { recursive: true });
  await esbuild.build({ ...browser, entryPoints: ["extension/background.ts", "extension/content.ts", "extension/popup.ts"], outdir: out });
  await Promise.all([
    fs.promises.copyFile("extension/popup.html", `${out}/popup.html`),
    fs.promises.copyFile("extension/popup.css", `${out}/popup.css`),
    fs.promises.copyFile("app/src-tauri/icons/32x32.png", `${out}/icon-32.png`),
    fs.promises.copyFile("app/src-tauri/icons/128x128.png", `${out}/icon-128.png`),
    fs.promises.writeFile(`${out}/manifest.json`, `${JSON.stringify(manifests[target], null, 2)}\n`),
  ]);
  // The installer ships the extension next to the backend, so the app can show where to load it from
  await fs.promises.cp(out, `app/src-tauri/resources/extension/${target}`, { recursive: true, force: true });
}

await Promise.all([
  esbuild.build({ ...node, entryPoints: [entry("src/cli")], outfile: "dist/cli.js", banner: { js: nodeBanner } }), // the shebang comes from the source
  esbuild.build({ ...node, entryPoints: [entry("src/backend")], outfile: "app/src-tauri/resources/backend.mjs", banner: { js: nodeBanner } }),
  // The native messaging host the browser starts: next to the CLI (npm) and next to the backend (installer)
  esbuild.build({ ...node, entryPoints: ["src/host.ts"], outfile: "dist/host.js", banner: { js: nodeBanner } }),
  esbuild.build({ ...node, entryPoints: ["src/host.ts"], outfile: "app/src-tauri/resources/host.mjs", banner: { js: nodeBanner } }),
  buildExtension("chrome"),
  buildExtension("firefox"),
  // kv ui serves this page from next to the CLI bundle
  fs.promises.mkdir("dist", { recursive: true }).then(() => fs.promises.copyFile("src/ui.html", "dist/ui.html")),
  // head.js: theme + language, loaded before first paint; app.js: the window
  esbuild.build({ ...browser, entryPoints: [entry("app/ui/head")], outfile: "app/ui/dist/head.js" }),
  esbuild.build({ ...browser, entryPoints: [entry("app/ui/app")], outfile: "app/ui/dist/app.js" }),
]);
