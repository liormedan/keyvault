// The extension's side of the native messaging link to kv-vault's host (src/host.ts).
// One port per use: the popup opens one while it's open; the shortcut opens one for a single fill.

export const HOST = "com.liormedan.kv_vault";

export type Reply<T = Record<string, unknown>> = { result: T; error?: undefined } | { result?: undefined; error: string };

export interface Link {
  call<T = Record<string, unknown>>(method: string, params?: Record<string, unknown>): Promise<Reply<T>>;
  close(): void;
}

export function connect(): Link {
  let port: chrome.runtime.Port | null;
  const waiting = new Map<number, (r: Reply) => void>();
  let gone = false;
  try {
    port = chrome.runtime.connectNative(HOST);
  } catch {
    port = null;
    gone = true;
  }
  port?.onMessage.addListener((m) => {
    const msg = m as { id: number } & Reply;
    waiting.get(msg.id)?.(msg);
    waiting.delete(msg.id);
  });
  // The host isn't registered (the user hasn't turned the extension on in kv-vault), or it exited
  port?.onDisconnect.addListener(() => {
    gone = true;
    for (const r of waiting.values()) r({ error: "not-connected" });
    waiting.clear();
  });
  let id = 0;
  return {
    call<T>(method: string, params: Record<string, unknown> = {}): Promise<Reply<T>> {
      if (gone || !port) return Promise.resolve({ error: "not-connected" });
      const n = ++id;
      return new Promise((resolve) => {
        waiting.set(n, resolve as (r: Reply) => void);
        port!.postMessage({ id: n, method, params });
      });
    },
    close: () => port?.disconnect(),
  };
}
