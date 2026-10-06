// Globals the window relies on: Tauri's API (withGlobalTauri) and the language helpers from i18n.ts.
import type { Label, Lang } from "../../src/model.ts";
import type { UiKey } from "./i18n.ts";

type DialogFilter = { name: string; extensions: string[] };

declare global {
  interface Window {
    I18N: {
      tr(key: UiKey, params?: Record<string, string | number>): string;
      /** a { en, he } label in the current language */
      L(v: Label | string | undefined): string;
      set(l: Lang): void;
      lang(): Lang;
    };
    __TAURI__: {
      core: { invoke<T = unknown>(cmd: string, args?: Record<string, unknown>): Promise<T> };
      dialog: { open(options: { multiple?: boolean; directory?: boolean; filters?: DialogFilter[] }): Promise<string | string[] | null> };
      window: { getCurrentWindow(): { setTheme(theme: "light" | "dark" | null): Promise<void>; setTitle(title: string): Promise<void> } };
    };
  }

  interface DocumentEventMap {
    /** fired by i18n.ts after the language changes */
    "kv-lang": CustomEvent<Lang>;
  }
}

export {};
