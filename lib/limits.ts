import type { TabGroups, UserLimits } from "./types";
import { ApiClientError } from "./api/client";

// Base sensitivity ignores case and accents ("Work" = "work", "Cafe" = "Café", "ß" = "ss"),
// matching how the API's database collation decides which names are the same group.
const groupNameCollator = new Intl.Collator("und", { sensitivity: "base" });

/** Whether the API stores `a` and `b` as the same group: case, accents and trailing spaces are ignored. */
export function isSameGroupName(a: string, b: string): boolean {
  return groupNameCollator.compare(a.trimEnd(), b.trimEnd()) === 0;
}

/** The existing group that saving as `name` would update (an exact match first), or null for a new group. */
export function findMatchingGroupName(groups: TabGroups, name: string): string | null {
  if (Object.hasOwn(groups, name)) {
    return name;
  }

  return Object.keys(groups).find((existing) => isSameGroupName(existing, name)) ?? null;
}

/** Tab counts per group as the API stores them, merging names it treats as the same group. */
function countTabsByStoredGroup(groups: TabGroups): { name: string; tabCount: number }[] {
  const storedGroups: { name: string; tabCount: number }[] = [];

  for (const [name, urls] of Object.entries(groups)) {
    const match = storedGroups.find((group) => isSameGroupName(group.name, name));
    if (match) {
      match.tabCount += urls.length;
    } else {
      storedGroups.push({ name, tabCount: urls.length });
    }
  }

  return storedGroups;
}

/**
 * Check whether saving `urlCount` tabs as group `name` would break the sync limits.
 * Returns a message to show the user, or null when the save is allowed.
 * Limits only apply while signed in - pass null limits when logged out.
 */
export function checkSaveAgainstLimits(groups: TabGroups, name: string, urlCount: number, limits: UserLimits | null): string | null {
  if (!limits) {
    return null;
  }

  const isNewGroup = findMatchingGroupName(groups, name) === null;
  if (isNewGroup && countTabsByStoredGroup(groups).length >= limits.max_groups) {
    return `You can sync up to ${limits.max_groups} tab groups. Delete a group to save a new one.`;
  }

  if (urlCount > limits.max_tabs_per_group) {
    return `You can sync up to ${limits.max_tabs_per_group} tabs per group. This window has ${urlCount} pinned tabs.`;
  }

  return null;
}

/**
 * Describe how `groups` breaks the sync limits, or return null when it fits.
 * Used to warn before a push that the API would reject.
 */
export function findLimitViolation(groups: TabGroups, limits: UserLimits | null): string | null {
  if (!limits) {
    return null;
  }

  const storedGroups = countTabsByStoredGroup(groups);
  if (storedGroups.length > limits.max_groups) {
    return `This would sync ${storedGroups.length} tab groups, but the limit is ${limits.max_groups}.`;
  }

  const largestGroup = storedGroups.find((group) => group.tabCount > limits.max_tabs_per_group);
  if (largestGroup) {
    return `"${largestGroup.name}" has ${largestGroup.tabCount} tabs, but the limit is ${limits.max_tabs_per_group} per group.`;
  }

  return null;
}

/**
 * If `error` is the API rejecting a sync for being over the limits, return its message.
 * Limit rejections are 422s keyed `tabs`; other 422s (a bad URL, a name too long) are keyed
 * per tab, e.g. `tabs.0.url`, and are ordinary sync errors, so they return null.
 */
export function getSyncLimitErrorMessage(error: unknown): string | null {
  if (!(error instanceof ApiClientError) || error.status !== 422) {
    return null;
  }

  return error.errors?.tabs?.[0] ?? null;
}
