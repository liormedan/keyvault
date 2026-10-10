import assert from "node:assert/strict";
import { test } from "node:test";
import { winQuote } from "../src/io.ts";

// Expected forms follow Microsoft's CommandLineToArgvW rules
test("winQuote: plain arguments as they are; spaces, quotes and trailing backslashes quoted correctly", () => {
  assert.equal(winQuote("plain"), "plain");
  assert.equal(winQuote(String.raw`C:\no-space\path`), String.raw`C:\no-space\path`);
  assert.equal(winQuote("a b"), `"a b"`);
  assert.equal(winQuote(`say "hi"`), String.raw`"say \"hi\""`);
  assert.equal(
    winQuote(String.raw`C:\dir with space\\`.slice(0, -1)),
    String.raw`"C:\dir with space\\"`,
    "a trailing backslash is doubled before the closing quote",
  );
  assert.equal(winQuote(String.raw`x\"y z`), String.raw`"x\\\"y z"`, "a backslash before a quote is doubled, then the quote escaped");
  assert.equal(winQuote("a&b"), `"a&b"`);
});
