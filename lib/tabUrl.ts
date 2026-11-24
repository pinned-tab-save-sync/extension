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

// An IPv6 address, copied from Laravel's Str::isUrl (derived from Symfony's UrlValidator)
const IPV6_PATTERN = String.raw`(?:(?:(?:(?:(?:(?:(?:[0-9a-f]{1,4})):){6})(?:(?:(?:(?:(?:[0-9a-f]{1,4})):(?:(?:[0-9a-f]{1,4})))|(?:(?:(?:(?:(?:25[0-5]|(?:[1-9]|1[0-9]|2[0-4])?[0-9]))\.){3}(?:(?:25[0-5]|(?:[1-9]|1[0-9]|2[0-4])?[0-9])))))))|(?:(?:::(?:(?:(?:[0-9a-f]{1,4})):){5})(?:(?:(?:(?:(?:[0-9a-f]{1,4})):(?:(?:[0-9a-f]{1,4})))|(?:(?:(?:(?:(?:25[0-5]|(?:[1-9]|1[0-9]|2[0-4])?[0-9]))\.){3}(?:(?:25[0-5]|(?:[1-9]|1[0-9]|2[0-4])?[0-9])))))))|(?:(?:(?:(?:(?:[0-9a-f]{1,4})))?::(?:(?:(?:[0-9a-f]{1,4})):){4})(?:(?:(?:(?:(?:[0-9a-f]{1,4})):(?:(?:[0-9a-f]{1,4})))|(?:(?:(?:(?:(?:25[0-5]|(?:[1-9]|1[0-9]|2[0-4])?[0-9]))\.){3}(?:(?:25[0-5]|(?:[1-9]|1[0-9]|2[0-4])?[0-9])))))))|(?:(?:(?:(?:(?:(?:[0-9a-f]{1,4})):){0,1}(?:(?:[0-9a-f]{1,4})))?::(?:(?:(?:[0-9a-f]{1,4})):){3})(?:(?:(?:(?:(?:[0-9a-f]{1,4})):(?:(?:[0-9a-f]{1,4})))|(?:(?:(?:(?:(?:25[0-5]|(?:[1-9]|1[0-9]|2[0-4])?[0-9]))\.){3}(?:(?:25[0-5]|(?:[1-9]|1[0-9]|2[0-4])?[0-9])))))))|(?:(?:(?:(?:(?:(?:[0-9a-f]{1,4})):){0,2}(?:(?:[0-9a-f]{1,4})))?::(?:(?:(?:[0-9a-f]{1,4})):){2})(?:(?:(?:(?:(?:[0-9a-f]{1,4})):(?:(?:[0-9a-f]{1,4})))|(?:(?:(?:(?:(?:25[0-5]|(?:[1-9]|1[0-9]|2[0-4])?[0-9]))\.){3}(?:(?:25[0-5]|(?:[1-9]|1[0-9]|2[0-4])?[0-9])))))))|(?:(?:(?:(?:(?:(?:[0-9a-f]{1,4})):){0,3}(?:(?:[0-9a-f]{1,4})))?::(?:(?:[0-9a-f]{1,4})):)(?:(?:(?:(?:(?:[0-9a-f]{1,4})):(?:(?:[0-9a-f]{1,4})))|(?:(?:(?:(?:(?:25[0-5]|(?:[1-9]|1[0-9]|2[0-4])?[0-9]))\.){3}(?:(?:25[0-5]|(?:[1-9]|1[0-9]|2[0-4])?[0-9])))))))|(?:(?:(?:(?:(?:(?:[0-9a-f]{1,4})):){0,4}(?:(?:[0-9a-f]{1,4})))?::)(?:(?:(?:(?:(?:[0-9a-f]{1,4})):(?:(?:[0-9a-f]{1,4})))|(?:(?:(?:(?:(?:25[0-5]|(?:[1-9]|1[0-9]|2[0-4])?[0-9]))\.){3}(?:(?:25[0-5]|(?:[1-9]|1[0-9]|2[0-4])?[0-9])))))))|(?:(?:(?:(?:(?:(?:[0-9a-f]{1,4})):){0,5}(?:(?:[0-9a-f]{1,4})))?::)(?:(?:[0-9a-f]{1,4})))|(?:(?:(?:(?:(?:(?:[0-9a-f]{1,4})):){0,6}(?:(?:[0-9a-f]{1,4})))?::))))`;

/**
 * The check the API applies to every http and https URL, which is Laravel's Str::isUrl.
 * A port of its pattern: PCRE's possessive quantifiers become greedy ones (each is followed by a character its
 * class cannot match, so they match the same strings) and escapes JavaScript's `u` flag refuses are dropped.
 */
const SERVER_HTTP_URL_PATTERN = new RegExp(
  "^https?://" +
    // basic auth
    String.raw`(?:(?:(?:[_.\p{L}\p{N}-]|%[0-9A-Fa-f]{2})+:)?(?:(?:[_.\p{L}\p{N}-]|%[0-9A-Fa-f]{2})+)@)?` +
    // a multi-level domain name, a single-level domain name, an IPv4 address or an IPv6 address
    String.raw`(?:(?:(?:(?:[\p{L}\p{N}\p{S}\p{M}\-_]+\.)+(?:(?:xn--[a-z0-9-]+)|(?:[\p{L}\p{N}\p{M}]+)))|[a-z0-9\-_]+)\.?|\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}|\[${IPV6_PATTERN}\])` +
    // a port, the path, the query and the fragment
    String.raw`(?::[0-9]+)?` +
    String.raw`(?:/(?:[\p{L}\p{N}\-._~!$&'()*+,;=:@]|%[0-9A-Fa-f]{2})*)*` +
    String.raw`(?:\?(?:[\p{L}\p{N}\-._~!$&'\[\]()*+,;=:@/?]|%[0-9A-Fa-f]{2})*)?` +
    String.raw`(?:#(?:[\p{L}\p{N}\-._~!$&'()*+,;=:@/?]|%[0-9A-Fa-f]{2})*)?$`,
  "iu",
);

// The ASCII characters the pattern above allows in each part of a URL, besides percent-escapes
const PATH_CHARACTERS = /[A-Za-z0-9\-._~!$&'()*+,;=:@/]/;
const QUERY_CHARACTERS = /[A-Za-z0-9\-._~!$&'[\]()*+,;=:@/?]/;
const FRAGMENT_CHARACTERS = /[A-Za-z0-9\-._~!$&'()*+,;=:@/?]/;

/** Percent-encode every character `allowed` does not match, keeping valid escapes (a stray `%` becomes `%25`). */
function percentEncodeExcept(text: string, allowed: RegExp): string {
  let encoded = "";
  for (let index = 0; index < text.length; index++) {
    const character = text.charAt(index);
    if (character === "%" && /^[0-9A-Fa-f]{2}$/.test(text.slice(index + 1, index + 3))) {
      encoded += character;
    } else if (allowed.test(character)) {
      encoded += character;
    } else {
      encoded += encodeURIComponent(character);
    }
  }
  return encoded;
}

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

/**
 * The URL as the API will accept and store it unchanged, or null when it cannot be made into one. Stricter than
 * `isAllowedTabUrl`, for URLs that did not come from a browser tab (e.g. an import file): a URL the API refuses would
 * make every sync fail, and one its input trimming changes would differ from the copy kept in this browser.
 *
 * The URL is first written the way browsers write it (`new URL().href`: lower-case scheme and host, non-ASCII
 * characters percent-encoded), so the result is plain printable ASCII with nothing for the server to trim. An http(s)
 * URL then has the characters the API's URL check refuses (`|`, `^`, `{`, a second `#`...) percent-encoded, which
 * browsers read as the same address, and must match that rule.
 */
export function toSyncableTabUrl(url: string): string | null {
  if (!isAllowedTabUrl(url)) {
    return null;
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return null;
  }

  let syncableUrl = parsedUrl.href;
  if (parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:") {
    // An empty query or fragment ("https://a.example/?") is left out, which browsers treat as the same address
    const { protocol, username, password, host, pathname, search, hash } = parsedUrl;
    const credentials = username === "" && password === "" ? "" : `${username}${password === "" ? "" : `:${password}`}@`;
    syncableUrl =
      `${protocol}//${credentials}${host}` +
      percentEncodeExcept(pathname, PATH_CHARACTERS) +
      (search === "" ? "" : "?" + percentEncodeExcept(search.slice(1), QUERY_CHARACTERS)) +
      (hash === "" ? "" : "#" + percentEncodeExcept(hash.slice(1), FRAGMENT_CHARACTERS));

    if (!SERVER_HTTP_URL_PATTERN.test(syncableUrl)) {
      return null;
    }
  }

  // Printable ASCII only: nothing the server trims, no lone surrogates (which cannot be sent as JSON to it)
  if (!/^[\x21-\x7E]+$/.test(syncableUrl) || !isAllowedTabUrl(syncableUrl)) {
    return null;
  }

  return syncableUrl;
}
