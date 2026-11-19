/** The longest group name the popup accepts, counted in characters (an emoji is one). */
export const MAX_GROUP_NAME_LENGTH = 50;

// Control characters (tabs, line breaks, NUL...) and the Unicode line and paragraph separators
const FORBIDDEN_CHARACTERS = /[\p{Cc}\u2028\u2029]/u;

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
