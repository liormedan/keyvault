import assert from "node:assert/strict";
import zlib from "node:zlib";
import { test } from "node:test";
import { from1Password, fromBitwarden, fromKeePass, parseImport } from "../src/import-file.ts";
import { readZipEntry } from "../src/unzip.ts";

// Every export here is made up, in each manager's real shape.

const BITWARDEN = {
  encrypted: false,
  folders: [],
  items: [
    {
      type: 1,
      name: "GitHub",
      notes: "work account",
      fields: [
        { name: "Recovery email", value: "dana@example.com", type: 0 },
        { name: "Security answer", value: "blue-whale", type: 1 },
      ],
      login: { username: "dana", password: "bw-pass-1", totp: "JBSWY3DPEHPK3PXP", uris: [{ uri: "https://github.com/login" }] },
    },
    { type: 1, name: "No password", login: { username: "x", password: null, uris: [] } },
    { type: 2, name: "Wi-Fi at the office", notes: "door code 4321", secureNote: { type: 0 } },
    { type: 3, name: "Visa", card: { cardholderName: "Dana Levi", brand: "Visa", number: "4111111111111111", expMonth: "8", expYear: "2029", code: "123" } },
    {
      type: 4,
      name: "Passport",
      identity: { firstName: "Dana", lastName: "Levi", passportNumber: "P1234567", email: "dana@example.com", city: "Haifa", country: "IL" },
    },
  ],
};

test("bitwarden json: logins, cards, notes, identities; hidden fields stay secret", () => {
  const { format, items, skipped } = fromBitwarden(BITWARDEN);
  assert.equal(format, "Bitwarden");
  assert.equal(skipped, 1, "the login without a password");
  const gh = items.find((i) => i.title === "GitHub")!;
  assert.deepEqual(gh, {
    type: "login",
    title: "GitHub",
    fields: {
      url: "https://github.com/login",
      username: "dana",
      password: "bw-pass-1",
      totp: "JBSWY3DPEHPK3PXP",
      notes: "work account\n\nRecovery email: dana@example.com",
    },
  });
  assert.ok(!gh.fields.notes!.includes("blue-whale"), "a hidden field never lands in plain notes");
  assert.deepEqual(
    items.find((i) => i.title === "GitHub — extra fields"),
    { type: "note", title: "GitHub — extra fields", fields: { body: "Security answer: blue-whale" } },
  );
  assert.deepEqual(items.find((i) => i.type === "card")!.fields, {
    cardholder: "Dana Levi",
    number: "4111111111111111",
    cvv: "123",
    expiry: "08/29",
    issuer: "Visa",
  });
  assert.equal(items.find((i) => i.type === "note" && i.title.startsWith("Wi-Fi"))!.fields.body, "door code 4321");
  assert.deepEqual(items.find((i) => i.type === "identity")!.fields, {
    fullName: "Dana Levi",
    passport: "P1234567",
    email: "dana@example.com",
    address: "Haifa, IL",
  });
  assert.throws(() => fromBitwarden({ encrypted: true, items: [] }), /encrypted/);
});

const KEEPASS = `<?xml version="1.0" encoding="utf-8" standalone="yes"?>
<KeePassFile>
  <Meta><Generator>KeePass</Generator><RecycleBinUUID>BIN0000000000000000000==</RecycleBinUUID></Meta>
  <Root>
    <Group>
      <UUID>ROOT000000000000000000==</UUID>
      <Name>Database</Name>
      <Entry>
        <UUID>E1</UUID>
        <String><Key>Notes</Key><Value>line one&#10;line &lt;two&gt;</Value></String>
        <String><Key>Password</Key><Value ProtectInMemory="True">kp-pass-&amp;-1</Value></String>
        <String><Key>Title</Key><Value>Router admin</Value></String>
        <String><Key>URL</Key><Value>http://192.168.1.1</Value></String>
        <String><Key>UserName</Key><Value>admin</Value></String>
        <String><Key>otp</Key><Value>otpauth://totp/x?secret=JBSWY3DPEHPK3PXP</Value></String>
        <String><Key>Serial</Key><Value>SN-42</Value></String>
        <String><Key>PIN</Key><Value ProtectInMemory="True">9876</Value></String>
        <History>
          <Entry>
            <UUID>E1</UUID>
            <String><Key>Password</Key><Value ProtectInMemory="True">old-history-pass</Value></String>
            <String><Key>Title</Key><Value>Router admin</Value></String>
          </Entry>
        </History>
      </Entry>
      <Entry>
        <UUID>E2</UUID>
        <String><Key>Title</Key><Value>Empty</Value></String>
        <String><Key>Password</Key><Value /></String>
      </Entry>
      <Group>
        <UUID>BIN0000000000000000000==</UUID>
        <Name>Recycle Bin</Name>
        <Entry>
          <UUID>E3</UUID>
          <String><Key>Title</Key><Value>Deleted</Value></String>
          <String><Key>Password</Key><Value>deleted-pass</Value></String>
        </Entry>
      </Group>
    </Group>
  </Root>
</KeePassFile>`;

test("keepass xml: current entries only (no history, no recycle bin); entities decoded; protected extras stay secret", () => {
  const { format, items, skipped } = fromKeePass(KEEPASS);
  assert.equal(format, "KeePass");
  assert.equal(skipped, 1, "the empty entry");
  assert.deepEqual(
    items.map((i) => i.title),
    ["Router admin", "Router admin — extra fields"],
  );
  assert.deepEqual(items[0]!.fields, {
    url: "http://192.168.1.1",
    username: "admin",
    password: "kp-pass-&-1",
    totp: "otpauth://totp/x?secret=JBSWY3DPEHPK3PXP",
    notes: "line one\nline <two>\n\nSerial: SN-42",
  });
  assert.deepEqual(items[1]!.fields, { body: "PIN: 9876" });
  const all = JSON.stringify(items);
  assert.ok(!all.includes("old-history-pass") && !all.includes("deleted-pass"));
});

/** A minimal zip writer for the test: one entry, stored or deflated (the reader doesn't check CRCs) */
function zip(name: string, content: Buffer, deflate: boolean): Buffer {
  const data = deflate ? zlib.deflateRawSync(content) : content;
  const n = Buffer.from(name);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(deflate ? 8 : 0, 8);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(content.length, 22);
  local.writeUInt16LE(n.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(deflate ? 8 : 0, 10);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt32LE(content.length, 24);
  central.writeUInt16LE(n.length, 28);
  central.writeUInt32LE(0, 42);
  const cdOffset = local.length + n.length + data.length;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + n.length, 12);
  end.writeUInt32LE(cdOffset, 16);
  return Buffer.concat([local, n, data, central, n, end]);
}

const ONEPUX = {
  accounts: [
    {
      vaults: [
        {
          items: [
            {
              state: "active",
              categoryUuid: "001",
              overview: { title: "Dropbox", url: "https://www.dropbox.com/login" },
              details: {
                loginFields: [
                  { value: "dana@example.com", designation: "username", fieldType: "E" },
                  { value: "op-pass-1", designation: "password", fieldType: "P" },
                ],
                notesPlain: "personal",
                sections: [
                  {
                    fields: [
                      { title: "one-time password", id: "TOTP_1", value: { totp: "otpauth://totp/Dropbox?secret=JBSWY3DPEHPK3PXP" } },
                      { title: "member since", id: "m", value: { string: "2015" } },
                      { title: "backup code", id: "b", value: { concealed: "1111-2222" } },
                    ],
                  },
                ],
              },
            },
            {
              state: "active",
              categoryUuid: "002",
              overview: { title: "Mastercard" },
              details: {
                sections: [
                  {
                    fields: [
                      { id: "cardholder", value: { string: "Dana Levi" } },
                      { id: "ccnum", value: { creditCardNumber: "5555555555554444" } },
                      { id: "cvv", value: { concealed: "321" } },
                      { id: "expiry", value: { monthYear: 202711 } },
                    ],
                  },
                ],
              },
            },
            { state: "active", categoryUuid: "003", overview: { title: "Safe combination" }, details: { notesPlain: "12-34-56" } },
            { state: "archived", categoryUuid: "001", overview: { title: "Archived" }, details: { loginFields: [{ value: "gone", designation: "password" }] } },
          ],
        },
      ],
    },
  ],
};

test("1password .1pux: logins with TOTP, cards, notes; archived items left out; stored and deflated zips", () => {
  for (const deflate of [false, true]) {
    const buf = zip("export.data", Buffer.from(JSON.stringify(ONEPUX)), deflate);
    assert.ok(readZipEntry(buf, "export.data"));
    assert.equal(readZipEntry(buf, "missing"), null);
    const { format, items, skipped } = parseImport(buf);
    assert.equal(format, "1Password");
    assert.equal(skipped, 0);
    assert.deepEqual(
      items.map((i) => `${i.type}:${i.title}`),
      ["login:Dropbox", "note:Dropbox — extra fields", "card:Mastercard", "note:Safe combination"],
    );
    assert.deepEqual(items[0]!.fields, {
      url: "https://www.dropbox.com/login",
      username: "dana@example.com",
      password: "op-pass-1",
      totp: "otpauth://totp/Dropbox?secret=JBSWY3DPEHPK3PXP",
      notes: "personal\n\nmember since: 2015",
    });
    assert.equal(items[1]!.fields.body, "backup code: 1111-2222");
    assert.deepEqual(items[2]!.fields, { cardholder: "Dana Levi", number: "5555555555554444", cvv: "321", expiry: "11/27" });
  }
  assert.throws(() => from1Password(Buffer.from("PK\x03\x04 not really a zip")), /damaged/);
});

test("format detection: zip, JSON, XML, else CSV", () => {
  assert.equal(parseImport(Buffer.from(JSON.stringify(BITWARDEN))).format, "Bitwarden");
  assert.equal(parseImport(Buffer.from(`﻿${KEEPASS}`)).format, "KeePass");
  assert.equal(parseImport(Buffer.from("name,url,username,password\nx,https://x.example,dana,pw\n")).format, "CSV");
  assert.throws(() => parseImport(Buffer.from("{ not json")), /Unknown file format/);
  assert.throws(() => parseImport(Buffer.from("<html></html>")), /Unknown file format/);
});
