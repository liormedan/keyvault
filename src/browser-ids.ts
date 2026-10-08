// Who may talk to the native messaging host. The Chrome/Edge extension ID is derived from the public key below
// (the manifest's "key"), so an unpacked install gets the same ID everywhere. The private key isn't kept:
// it's only needed to pack a .crx, which this project doesn't do. A Chrome Web Store ID is added here once published.
import { createHash } from "node:crypto";

export const HOST_NAME = "com.liormedan.kv_vault";

export const EXTENSION_KEY =
  "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA2r800mzxRmU9ejj6Z8C9xtWKQCcK3K9dXRLoBMyha1q95LwL2SuNXAzyZlEovkPFPGSrb5LPoJJGPiFrvDtjj5e4AldScIxZmEAdbeHeYhCM7uN4HzusEYofx411DDr7d9Su9KZyAl21X5cLmM5xRB/igs0wYPRffmLHHxRNPOk6uQpdI66pjx5oRGRWqJB/kfjt9k0KVgjNoX+fOYgjaU/PcNYJ7A8Gg0b+eZhDRzOfLiQxuzU+kJwNFTXaT1djvQiW+Ib0YC8JqHUzqDw2aPvNvgSogJQhp7ZOy5dmxs6iCg5LuJUj83Los6PsHnir0sT0MOjg+S84hlgeoii2/QIDAQAB";

/** Chrome's rule: the first 128 bits of SHA-256 of the DER public key, hex digits mapped 0-f → a-p */
export function extensionId(keyBase64: string): string {
  const hex = createHash("sha256").update(Buffer.from(keyBase64, "base64")).digest("hex").slice(0, 32);
  return [...hex].map((h) => String.fromCharCode(97 + Number.parseInt(h, 16))).join("");
}

export const CHROME_ID = extensionId(EXTENSION_KEY);
export const FIREFOX_ID = "kv-vault@liormedan.github.io";

/** What Chrome/Edge pass as the host's first argument, and what Firefox passes as its second */
export const ALLOWED_CALLERS: readonly string[] = [`chrome-extension://${CHROME_ID}/`, FIREFOX_ID];
