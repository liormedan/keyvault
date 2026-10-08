import assert from "node:assert/strict";
import { test } from "node:test";
import { base32Decode, parseTotp, totp } from "../src/totp.ts";

// RFC 6238, appendix B: the seeds are the ASCII strings below, at 8 digits
const b32 = (ascii: string) => {
  const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const b of Buffer.from(ascii)) bits += b.toString(2).padStart(8, "0");
  return bits
    .match(/.{1,5}/g)!
    .map((c) => A[Number.parseInt(c.padEnd(5, "0"), 2)])
    .join("");
};
const SHA1 = b32("12345678901234567890");
const SHA256 = b32("12345678901234567890123456789012");
const SHA512 = b32("1234567890123456789012345678901234567890123456789012345678901234");
const uri = (secret: string, alg: string) => `otpauth://totp/Test:dana?secret=${secret}&algorithm=${alg}&digits=8&period=30`;

test("totp: RFC 6238 test vectors (SHA-1, SHA-256, SHA-512)", () => {
  const cases: [number, string, string, string][] = [
    [59, "94287082", "46119246", "90693936"],
    [1111111109, "07081804", "68084774", "25091201"],
    [1234567890, "89005924", "91819424", "93441116"],
    [2000000000, "69279037", "90698825", "38618901"],
  ];
  for (const [time, s1, s256, s512] of cases) {
    assert.equal(totp(uri(SHA1, "SHA1"), time * 1000).code, s1, `sha1 @${time}`);
    assert.equal(totp(uri(SHA256, "SHA256"), time * 1000).code, s256, `sha256 @${time}`);
    assert.equal(totp(uri(SHA512, "SHA512"), time * 1000).code, s512, `sha512 @${time}`);
  }
});

test("totp: a bare base32 secret means SHA-1, 6 digits, 30 seconds; spaces and case don't matter", () => {
  const secret = "JBSW Y3DP EHPK 3PXP";
  const a = totp(secret, 1_700_000_000_000);
  const b = totp(secret.toLowerCase().replace(/ /g, ""), 1_700_000_000_000);
  assert.equal(a.code.length, 6);
  assert.equal(a.code, b.code);
  assert.equal(a.period, 30);
  assert.equal(a.remaining, 30 - (1_700_000_000 % 30));
  assert.deepEqual(parseTotp(secret).algorithm, "sha1");
});

test("totp: invalid keys and counter-based links are refused", () => {
  assert.throws(() => base32Decode("not base32!"), /not a valid/);
  assert.throws(() => totp(""), /not a valid/);
  assert.throws(() => totp("otpauth://hotp/x?secret=JBSWY3DPEHPK3PXP&counter=1"), /time-based/);
  assert.throws(() => totp("otpauth://totp/x?secret=JBSWY3DPEHPK3PXP&algorithm=MD5"), /not a valid/);
  assert.throws(() => totp("otpauth://totp/x?secret=JBSWY3DPEHPK3PXP&digits=4"), /not a valid/);
});
