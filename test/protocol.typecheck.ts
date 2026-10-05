// Compile-time checks for the window ↔ backend contract. Not run — `npm run typecheck` fails
// if any line marked @ts-expect-error stops being an error, or if a valid call stops compiling.
import type { Method, Params, Result } from "../src/protocol.ts";

declare function call<M extends Method>(method: M, params: Params<M>): Promise<Result<M>>;

export async function contract() {
  const st = await call("status", {});
  st.unlocked satisfies boolean;

  const { id } = await call("itemSave", { type: "login", title: "GitHub", fields: { username: "dana" } });
  id satisfies string;

  const imp = await call("importCsv", { path: "C:/export.csv" });
  imp.added satisfies number;

  // @ts-expect-error — no such method
  await call("itemsave", {});

  // @ts-expect-error — not an item type
  await call("itemSave", { type: "passport", title: "x", fields: {} });

  // @ts-expect-error — `p` and `k`, not `project`
  await call("value", { project: "my-app", k: "API_KEY" });

  // @ts-expect-error — only en and he
  await call("setLang", { lang: "fr" });

  // @ts-expect-error — the listing has no fields, so no secrets
  (await call("items", {})).items[0].fields;
}
