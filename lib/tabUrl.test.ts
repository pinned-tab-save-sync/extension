import { describe, it, expect } from "vitest";
import { isAllowedTabUrl, toSyncableTabUrl } from "./tabUrl";

describe("isAllowedTabUrl", () => {
  it.each([
    "https://example.com",
    "http://localhost:3000/path?query=1#hash",
    "HTTPS://EXAMPLE.COM",
    "about:blank",
    "chrome://extensions",
    "edge://settings",
    "file:///home/user/notes.html",
    "moz-extension://abc/page.html",
    "view-source:https://example.com",
  ])("allows %s", (url) => {
    expect(isAllowedTabUrl(url)).toBe(true);
  });

  it.each([
    "javascript:alert(1)",
    "JavaScript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "blob:https://example.com/123",
    "ftp://example.com",
    "vbscript:msgbox(1)",
    "example.com",
    "",
    "about:",
    "https://",
    "https://example.com/a b",
    "https://example.com/\nfoo",
    `https://example.com/${"a".repeat(2048)}`,
  ])("refuses %s", (url) => {
    expect(isAllowedTabUrl(url)).toBe(false);
  });
});

// Expected values were checked against the API: each result passes its input trimming unchanged and its URL check
describe("toSyncableTabUrl", () => {
  it.each([
    "https://example.com/",
    "http://localhost:3000/path?query=1#hash",
    "https://user:pass@example.com/",
    "http://[::1]/",
    "https://example.com/search?q=a[0]",
    "about:blank",
    "chrome://extensions",
    "file:///home/user/notes.html",
    "view-source:https://example.com",
  ])("keeps %s as it is", (url) => {
    expect(toSyncableTabUrl(url)).toBe(url);
  });

  it.each([
    ["writes the scheme and host as browsers do", "HTTPS://EXAMPLE.COM", "https://example.com/"],
    ["punycodes an international host", "https://例え.jp/", "https://xn--r8jz45g.jp/"],
    ["encodes non-ASCII characters", "https://example.com/café/😀", "https://example.com/caf%C3%A9/%F0%9F%98%80"],
    ["encodes characters the API's URL check refuses", "https://example.com/a|b^c/{d}[e]`f", "https://example.com/a%7Cb%5Ec/%7Bd%7D%5Be%5D%60f"],
    [
      "encodes a | a browser leaves in a tab's URL",
      "https://fonts.googleapis.com/css?family=Roboto|Open+Sans",
      "https://fonts.googleapis.com/css?family=Roboto%7COpen+Sans",
    ],
    ["encodes them in the query", "https://example.com/?a=1|2&b={x}", "https://example.com/?a=1%7C2&b=%7Bx%7D"],
    ["encodes a second # in the fragment", "https://example.com/#a#b", "https://example.com/#a%23b"],
    ["encodes a stray percent sign and keeps valid escapes", "https://example.com/100%25/50%", "https://example.com/100%25/50%25"],
    ["encodes a trailing invisible character the API would trim", "https://example.com/\u200b", "https://example.com/%E2%80%8B"],
    ["replaces a lone surrogate, which cannot be sent as JSON", "https://example.com/\ud800", "https://example.com/%EF%BF%BD"],
    ["drops an empty query", "https://example.com/?", "https://example.com/"],
    ["encodes a browser page's non-ASCII characters", "about:\u200b", "about:%E2%80%8B"],
  ])("%s", (_label, url, expected) => {
    expect(toSyncableTabUrl(url)).toBe(expected);
  });

  it.each([
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "https://example..com/",
    "https://example.com:99999/",
    "https://example.com/a b",
    "\u200bhttps://example.com/",
    `https://example.com/${"|".repeat(700)}`,
  ])("refuses %s", (url) => {
    expect(toSyncableTabUrl(url)).toBeNull();
  });
});
