/** The longest group name the popup accepts, counted in characters (an emoji is one). */
export const MAX_GROUP_NAME_LENGTH = 50;

// Control characters (tabs, line breaks, NUL...) and the Unicode line and paragraph separators, as the API refuses,
// plus lone surrogates: the API cannot read a request that contains one, so it would refuse every sync
const FORBIDDEN_CHARACTERS = /[\p{Cc}\u2028\u2029\p{Cs}]/u;

// What the API's input trimming removes from both ends of a name: whitespace and invisible characters
const SERVER_TRIMMED_CHARACTERS =
  "\\s\\u0009\\u0020\\u00A0\\u00AD\\u034F\\u061C\\u115F\\u1160\\u17B4\\u17B5\\u180E\\u2000-\\u200F\\u202F\\u205F\\u2060-\\u2065\\u206A-\\u206F\\u3000\\u2800\\u3164\\uFEFF\\uFFA0\\u{1D159}\\u{1D173}-\\u{1D17A}\\u{E0020}\\0\\v";
const SERVER_TRIM_PATTERN = new RegExp(`^[${SERVER_TRIMMED_CHARACTERS}]+|[${SERVER_TRIMMED_CHARACTERS}]+$`, "gu");

/**
 * Trim a name the way the API trims its input, which removes invisible characters (zero-width spaces, soft hyphens...)
 * that `String.prototype.trim` keeps. Otherwise the API would store "Work\u200b" as "Work", or a name of only
 * invisible characters as no group at all, and the account would no longer match this browser.
 */
export function trimGroupName(name: string): string {
  return name.replace(SERVER_TRIM_PATTERN, "");
}

/**
 * Why a new group cannot have this (already trimmed) name, or null when it can. Any other text is a valid
 * name, including "constructor" or "__proto__".
 */
export function validateGroupName(name: string): string | null {
  if (name === "") {
    return "Please enter a group name";
  }

  if (Array.from(name).length > MAX_GROUP_NAME_LENGTH) {
    return `Group names cannot be longer than ${MAX_GROUP_NAME_LENGTH} characters`;
  }

  if (FORBIDDEN_CHARACTERS.test(name)) {
    return "Group names cannot contain line breaks or control characters";
  }

  return null;
}
