// The slice of the extension API this extension uses (Chrome / Edge MV3; Firefox provides the same `chrome.*`).
// Hand-written instead of @types/chrome: small, and it documents exactly what the extension can touch.

declare namespace chrome {
  namespace runtime {
    interface Port {
      postMessage(message: unknown): void;
      disconnect(): void;
      onMessage: { addListener(cb: (message: unknown) => void): void };
      onDisconnect: { addListener(cb: () => void): void };
    }
    interface MessageSender {
      tab?: tabs.Tab;
      frameId?: number;
      id?: string;
    }
    const lastError: { message?: string } | undefined;
    const id: string;
    function connectNative(application: string): Port;
    function sendMessage(message: unknown): Promise<unknown>;
    const onMessage: { addListener(cb: (message: unknown, sender: MessageSender, respond: (r?: unknown) => void) => boolean | undefined): void };
  }
  namespace tabs {
    interface Tab {
      id?: number;
      url?: string;
      title?: string;
    }
    function query(q: { active?: boolean; currentWindow?: boolean; url?: string }): Promise<Tab[]>;
    function get(tabId: number): Promise<Tab>;
    const onRemoved: { addListener(cb: (tabId: number) => void): void };
    const onUpdated: { addListener(cb: (tabId: number, change: { url?: string; status?: string }) => void): void };
  }
  namespace scripting {
    function executeScript<A extends unknown[], R>(o: { target: { tabId: number }; func: (...args: A) => R; args: A }): Promise<{ result?: R }[]>;
  }
  namespace storage {
    const session: {
      get(key: string): Promise<Record<string, unknown>>;
      set(items: Record<string, unknown>): Promise<void>;
      remove(key: string): Promise<void>;
    };
  }
  namespace action {
    function setBadgeText(o: { tabId?: number; text: string }): Promise<void>;
    function setBadgeBackgroundColor(o: { color: string }): Promise<void>;
    function openPopup(): Promise<void>;
  }
  namespace commands {
    const onCommand: { addListener(cb: (command: string, tab?: tabs.Tab) => void): void };
  }
  namespace i18n {
    function getUILanguage(): string;
  }
}
