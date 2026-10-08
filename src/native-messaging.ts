// Native messaging framing (Chrome, Edge, Firefox): each message is a 32-bit length in native byte order
// (little-endian on every platform kv runs on) followed by that many bytes of UTF-8 JSON.

/** Browsers refuse host messages over 1 MB */
export const MAX_OUT = 1024 * 1024;
/** Messages from the extension are small; anything bigger is a protocol error */
export const MAX_IN = 64 * 1024;

export function encode(message: unknown): Buffer {
  const body = Buffer.from(JSON.stringify(message), "utf8");
  if (body.length > MAX_OUT) throw new Error("message too large");
  const head = Buffer.alloc(4);
  head.writeUInt32LE(body.length, 0);
  return Buffer.concat([head, body]);
}

/** Splits a byte stream into messages; feed it chunks as they arrive */
export class Decoder {
  private buf = Buffer.alloc(0);

  push(chunk: Buffer): unknown[] {
    this.buf = Buffer.concat([this.buf, chunk]);
    const out: unknown[] = [];
    while (this.buf.length >= 4) {
      const len = this.buf.readUInt32LE(0);
      if (len > MAX_IN) throw new Error("message too large");
      if (this.buf.length < 4 + len) break;
      out.push(JSON.parse(this.buf.subarray(4, 4 + len).toString("utf8")));
      this.buf = this.buf.subarray(4 + len);
    }
    return out;
  }
}
