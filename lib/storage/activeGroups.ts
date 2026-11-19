import { STORAGE_KEYS } from "./keys";

/**
 * Which group is loaded in each window. Window IDs only mean something while the browser runs, so
 * this lives in session storage, one key per window: every write touches a single key, so the popup
 * and the background can never overwrite each other's windows.
 */

function activeGroupKey(windowId: number): string {
  return `${STORAGE_KEYS.ACTIVE_GROUP_PREFIX}${windowId}`;
}

/** The group loaded in the window, or null when none is. */
export async function getActiveGroupForWindow(windowId: number): Promise<string | null> {
  const key = activeGroupKey(windowId);
  const result = await browser.storage.session.get(key);
  const groupName = result[key];

  return typeof groupName === "string" ? groupName : null;
}

/** Record the group loaded in the window; null forgets it. */
export async function setActiveGroupForWindow(windowId: number, groupName: string | null): Promise<void> {
  if (groupName === null) {
    await browser.storage.session.remove(activeGroupKey(windowId));
    return;
  }

  await browser.storage.session.set({ [activeGroupKey(windowId)]: groupName });
}

/** Where versions before 0.1.0 kept every window's active group, as one map in local storage. */
const LEGACY_ACTIVE_GROUPS_BY_WINDOW_KEY = "activeGroupsByWindow";

/**
 * After an update from a version that kept the active groups in local storage: move the entries for
 * windows that are still open into session storage, then remove the old map.
 */
export async function migrateLegacyActiveGroups(): Promise<void> {
  const result = await browser.storage.local.get(LEGACY_ACTIVE_GROUPS_BY_WINDOW_KEY);
  const legacyActiveGroups = result[LEGACY_ACTIVE_GROUPS_BY_WINDOW_KEY];

  if (legacyActiveGroups === undefined) {
    return;
  }

  if (typeof legacyActiveGroups === "object" && legacyActiveGroups !== null) {
    const legacyGroupNames = legacyActiveGroups as Record<string, unknown>;
    const openWindows = await browser.windows.getAll();
    const migrated: Record<string, string> = {};

    for (const { id: windowId } of openWindows) {
      const groupName = windowId === undefined ? undefined : legacyGroupNames[String(windowId)];
      if (windowId !== undefined && typeof groupName === "string") {
        migrated[activeGroupKey(windowId)] = groupName;
      }
    }

    if (Object.keys(migrated).length > 0) {
      await browser.storage.session.set(migrated);
    }
  }

  await browser.storage.local.remove(LEGACY_ACTIVE_GROUPS_BY_WINDOW_KEY);
}
