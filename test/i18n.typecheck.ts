// Compile-time checks for the message tables. Not run — part of `npm run typecheck`.
import { t } from "../src/i18n.ts";

export function keys() {
  t("pw.wrong");
  t("vault.none", { path: "C:/vault.kv" });

  // @ts-expect-error — no such message key
  t("pw.wrongg");
}
