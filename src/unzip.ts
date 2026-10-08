// Read one file out of a zip archive (a 1Password .1pux export is a zip). Stored and deflated entries only —
// enough for exports, no dependency. Every offset is bounds-checked; a malformed archive throws.
import zlib from "node:zlib";

const MAX_OUT = 64 * 1024 * 1024;

export function readZipEntry(buf: Buffer, name: string): Buffer | null {
  const u16 = (o: number) => {
    if (o < 0 || o + 2 > buf.length) throw new RangeError("zip: out of bounds");
    return buf.readUInt16LE(o);
  };
  const u32 = (o: number) => {
    if (o < 0 || o + 4 > buf.length) throw new RangeError("zip: out of bounds");
    return buf.readUInt32LE(o);
  };
  // End of central directory: 22 bytes plus a comment of up to 64 KB, at the end of the file
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i >= buf.length - 22 - 0xffff; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("zip: no central directory");
  const count = u16(eocd + 10);
  let p = u32(eocd + 16);
  for (let n = 0; n < count; n++) {
    if (u32(p) !== 0x02014b50) throw new Error("zip: bad central directory entry");
    const method = u16(p + 10);
    const size = u32(p + 20);
    const nameLen = u16(p + 28);
    const next = p + 46 + nameLen + u16(p + 30) + u16(p + 32);
    const local = u32(p + 42);
    if (p + 46 + nameLen > buf.length) throw new RangeError("zip: out of bounds");
    if (buf.toString("utf8", p + 46, p + 46 + nameLen) === name) {
      if (u32(local) !== 0x04034b50) throw new Error("zip: bad local header");
      const start = local + 30 + u16(local + 26) + u16(local + 28);
      if (start + size > buf.length) throw new RangeError("zip: out of bounds");
      const data = buf.subarray(start, start + size);
      if (method === 0) return data;
      if (method === 8) return zlib.inflateRawSync(data, { maxOutputLength: MAX_OUT });
      throw new Error(`zip: compression method ${method}`);
    }
    p = next;
  }
  return null;
}
