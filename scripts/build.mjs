// One build for everything that ships: the kv CLI, the desktop backend, and the window's scripts.
// esbuild compiles (TypeScript included); type checking is `npm run typecheck`.
import * as esbuild from "esbuild";
import fs from "node:fs";

// libsodium is CommonJS-flavored; bundled into ESM it needs a real `require`
const nodeBanner = "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);";
const node = { bundle: true, platform: "node", format: "esm", target: "node20", logLevel: "warning", legalComments: "none" };
const browser = { bundle: true, platform: "browser", format: "iife", target: "es2022", logLevel: "warning", legalComments: "none" };

const entry = (base) => [`${base}.ts`, `${base}.js`].find((f) => fs.existsSync(f));

await Promise.all([
  esbuild.build({ ...node, entryPoints: [entry("src/cli")], outfile: "dist/cli.js", banner: { js: nodeBanner } }), // the shebang comes from the source
  esbuild.build({ ...node, entryPoints: [entry("src/backend")], outfile: "app/src-tauri/resources/backend.mjs", banner: { js: nodeBanner } }),
  // kv ui serves this page from next to the CLI bundle
  fs.promises.mkdir("dist", { recursive: true }).then(() => fs.promises.copyFile("src/ui.html", "dist/ui.html")),
  // head.js: theme + language, loaded before first paint; app.js: the window
  esbuild.build({ ...browser, entryPoints: [entry("app/ui/head")], outfile: "app/ui/dist/head.js" }),
  esbuild.build({ ...browser, entryPoints: [entry("app/ui/app")], outfile: "app/ui/dist/app.js" }),
]);
