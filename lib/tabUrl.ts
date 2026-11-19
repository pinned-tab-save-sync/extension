/** Browser-internal schemes a pinned tab can use. */
const BROWSER_SCHEMES = [
  "about",
  "brave",
  "chrome",
  "chrome-extension",
  "chrome-untrusted",
  "edge",
  "extension",
  "file",
  "moz-extension",
  "opera",
  "vivaldi",
  "view-source",
];

const MAX_TAB_URL_LENGTH = 2048;

/**
 * Whether a URL may be saved in a group and opened from one: a web address (http or https) or a
 * browser page such as about:blank, chrome://extensions or a local file. Everything else is refused,
 * notably javascript: and data: URLs, so a group can never be used to open one.
 */
export function isAllowedTabUrl(url: string): boolean {
  // Whitespace and control characters never belong in a tab URL
  if (url === "" || url.length > MAX_TAB_URL_LENGTH || /[\s\p{Cc}]/u.test(url)) {
    return false;
  }

  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(url)?.[1]?.toLowerCase();
  if (scheme === undefined) {
    return false;
  }

  if (BROWSER_SCHEMES.includes(scheme)) {
    // Needs a target after the scheme: "about:" alone is not a page
    return url.slice(scheme.length + 1).replace(/^\/+/, "") !== "";
  }

  if (scheme !== "http" && scheme !== "https") {
    return false;
  }

  try {
    return new URL(url).hostname !== "";
  } catch {
    return false;
  }
}
