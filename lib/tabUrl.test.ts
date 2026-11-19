import { describe, it, expect } from "vitest";
import { isAllowedTabUrl } from "./tabUrl";

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
