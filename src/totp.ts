// Two-factor codes (TOTP, RFC 6238) from a login's `totp` field: a base32 secret or an otpauth:// URI.
// HMAC comes from node:crypto — TOTP needs HMAC-SHA1, which libsodium doesn't offer. This is code generation,
// not vault encryption: the vault itself stays libsodium-only (src/crypto.ts).
import { createHmac } from "node:crypto";
import { t } from "./i18n.ts";

export interface TotpParams {
  secret: Buffer;
  digits: number;
  period: number;
  algorithm: "sha1" | "sha256" | "sha512";
}

export interface TotpCode {
  code: string;
  /** seconds until the code changes */
  remaining: number;
  period: number;
}

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Decode(input: string): Buffer {
  const s = input.toUpperCase().replace(/[\s=-]/g, "");
  if (!s || /[^A-Z2-7]/.test(s)) throw new Error(t("totp.invalid"));
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const c of s) {
    value = (value << 5) | B32.indexOf(c);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function parseTotp(field: string): TotpParams {
  const raw = field.trim();
  if (!/^otpauth:/i.test(raw)) return { secret: base32Decode(raw), digits: 6, period: 30, algorithm: "sha1" };
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(t("totp.invalid"));
  }
  if (url.host.toLowerCase() !== "totp") throw new Error(t("totp.notTotp"));
  const q = url.searchParams;
  const algorithm = (q.get("algorithm") || "SHA1").toLowerCase();
  if (algorithm !== "sha1" && algorithm !== "sha256" && algorithm !== "sha512") throw new Error(t("totp.invalid"));
  const digits = Number(q.get("digits") || 6);
  const period = Number(q.get("period") || 30);
  if (![6, 7, 8].includes(digits) || !Number.isInteger(period) || period < 1 || period > 300) throw new Error(t("totp.invalid"));
  return { secret: base32Decode(q.get("secret") || ""), digits, period, algorithm };
}

/** RFC 4226 HOTP for one counter value */
export function hotp(p: Pick<TotpParams, "secret" | "digits" | "algorithm">, counter: number): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const mac = createHmac(p.algorithm, p.secret).update(msg).digest();
  const off = mac[mac.length - 1]! & 0x0f;
  const bin = (mac.readUInt32BE(off) & 0x7fffffff) % 10 ** p.digits;
  return String(bin).padStart(p.digits, "0");
}

export function totp(field: string, now: number = Date.now()): TotpCode {
  const p = parseTotp(field);
  const step = Math.floor(now / 1000 / p.period);
  return { code: hotp(p, step), remaining: p.period - (Math.floor(now / 1000) % p.period), period: p.period };
}
