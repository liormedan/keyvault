// `.kv.json` — which vault project a folder belongs to, so `kv run -- <cmd>` needs no project name.
// It holds names only, never values, so it is safe to commit.
import fs from "node:fs";
import path from "node:path";
import { t } from "./i18n.ts";

export const PROJECT_FILE = ".kv.json";

export interface ProjectFile {
  project: string;
  /** default environment for kv run / kv env in this folder */
  env?: string;
}

/** The nearest .kv.json from `dir` up to the filesystem root, with the folder it was found in */
export function findProject(dir: string = process.cwd()): (ProjectFile & { dir: string }) | null {
  let d = path.resolve(dir);
  for (;;) {
    const f = path.join(d, PROJECT_FILE);
    if (fs.existsSync(f)) {
      let parsed: Partial<ProjectFile>;
      try {
        parsed = JSON.parse(fs.readFileSync(f, "utf8")) as Partial<ProjectFile>;
      } catch {
        throw new Error(t("project.badFile", { path: f }));
      }
      if (typeof parsed.project !== "string" || !parsed.project || parsed.project.includes("/")) throw new Error(t("project.badFile", { path: f }));
      return { project: parsed.project, ...(typeof parsed.env === "string" && parsed.env ? { env: parsed.env } : {}), dir: d };
    }
    const up = path.dirname(d);
    if (up === d) return null;
    d = up;
  }
}

/** A sensible default project name for a folder: package.json "name" (unscoped), else the folder name */
export function suggestName(dir: string = process.cwd()): string {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8")) as { name?: string };
    if (pkg.name) return pkg.name.replace(/^@[^/]+\//, "");
  } catch {
    // no package.json — use the folder name
  }
  return path.basename(path.resolve(dir));
}

export function writeProject(dir: string, file: ProjectFile, force = false): string {
  const f = path.join(dir, PROJECT_FILE);
  try {
    // "wx": create, failing if it exists — one step, so nothing can appear between a check and the write
    fs.writeFileSync(f, `${JSON.stringify(file, null, 2)}\n`, { flag: force ? "w" : "wx" });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "EEXIST") throw new Error(t("project.fileExists", { path: f }));
    throw e;
  }
  return f;
}
