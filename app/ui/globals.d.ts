// Globals the window relies on: Tauri's API (withGlobalTauri) and the language helpers from i18n.ts.
import type { Label, Lang } from "../../src/model.ts";
import type { UiKey } from "./i18n.ts";

type DialogFilter = { name: string; extensions: string[] };

declare global {
  /** A newer, signed version found by the updater: download it, then install (the app exits on Windows) */
  interface Update {
    version: string;
    download(): Promise<void>;
    install(): Promise<void>;
  }

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
      event: { listen(event: string, handler: () => void): Promise<() => void> };
      dialog: {
        open(options: { multiple?: boolean; directory?: boolean; filters?: DialogFilter[] }): Promise<string | string[] | null>;
        save(options: { defaultPath?: string; filters?: DialogFilter[] }): Promise<string | null>;
      };
      /** Tauri's updater plugin: null when there is no newer version */
      updater: { check(): Promise<Update | null> };
      process: { relaunch(): Promise<void> };
      window: { getCurrentWindow(): { setTheme(theme: "light" | "dark" | null): Promise<void>; setTitle(title: string): Promise<void> } };
    };
  }

  interface DocumentEventMap {
    /** fired by i18n.ts after the language changes */
    "kv-lang": CustomEvent<Lang>;
  }
}
