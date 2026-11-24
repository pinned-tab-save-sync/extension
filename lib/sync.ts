import type { PinnedTab, TabGroups, TabGroupsSummary } from "./types";
import { syncTabs } from "./api/tabs";
import { getLastSyncedFingerprint, setLastSyncedFingerprint } from "./storage/sync";
import { getAuthToken } from "./storage/auth";
import { STORAGE_KEYS } from "./storage/keys";

interface TabPayload {
  url: string;
  title?: string | null;
  favicon_url?: string | null;
  group_name: string;
  position: number;
}

/**
 * An empty group map with no prototype, so a group named after an Object.prototype member
 * ("constructor", "toString", "__proto__") is an ordinary key rather than an inherited value.
 */
export function createGroupMap(): TabGroups {
  return Object.create(null) as TabGroups;
}

export function groupsToTabs(groups: TabGroups, groupOrder?: string[]): TabPayload[] {
  const tabs: TabPayload[] = [];
  let position = 0;

  // Use provided order, or fall back to Object.keys order
  const orderedGroupNames = groupOrder ?? Object.keys(groups);

  // Process groups in order, then any remaining groups not in the order array
  const processedNames = new Set<string>();

  for (const groupName of orderedGroupNames) {
    const urls = Object.hasOwn(groups, groupName) ? groups[groupName] : undefined;
    if (urls && !processedNames.has(groupName)) {
      processedNames.add(groupName);
      for (const url of urls) {
        tabs.push({
          url,
          group_name: groupName,
          position: position++,
        });
      }
    }
  }

  // Handle any groups not in the order array
  for (const [groupName, urls] of Object.entries(groups)) {
    if (!processedNames.has(groupName)) {
      for (const url of urls) {
        tabs.push({
          url,
          group_name: groupName,
          position: position++,
        });
      }
    }
  }

  return tabs;
}

export interface TabsToGroupsResult {
  groups: TabGroups;
  groupOrder: string[];
}

export function tabsToGroups(tabs: PinnedTab[]): TabsToGroupsResult {
  const groups = createGroupMap();
  const groupPositions: Map<string, number> = new Map();

  for (const tab of tabs) {
    const groupName = tab.group?.name || "Default";
    const groupPosition = tab.group?.position ?? Infinity;

    let urls = groups[groupName];
    if (!urls) {
      urls = [];
      groups[groupName] = urls;
      groupPositions.set(groupName, groupPosition);
    }
    urls.push(tab.url);
  }

  // Sort group names by their position
  const groupOrder = Array.from(groupPositions.entries())
    .sort((a, b) => a[1] - b[1])
    .map(([name]) => name);

  return { groups, groupOrder };
}

/** Counts the groups, and the tabs across them, in a set of tab groups (shown on the sync conflict screen). */
export function summariseTabGroups(groups: TabGroups): TabGroupsSummary {
  const groupUrls = Object.values(groups);

  return {
    groups: groupUrls.length,
    tabs: groupUrls.reduce((total, urls) => total + urls.length, 0),
  };
}

/**
 * Merge the browser's groups into the account's groups without removing anything.
 * Account groups keep their order and tabs; browser-only groups are appended in browser order,
 * and browser tabs missing from a shared group are appended to the end of that group.
 */
export function mergeTabGroups(account: TabsToGroupsResult, browser: TabsToGroupsResult): TabsToGroupsResult {
  const groups = createGroupMap();
  const groupOrder: string[] = [];

  for (const groupName of [...account.groupOrder, ...Object.keys(account.groups)]) {
    const accountUrls = Object.hasOwn(account.groups, groupName) ? account.groups[groupName] : undefined;
    if (accountUrls && !groups[groupName]) {
      groups[groupName] = [...accountUrls];
      groupOrder.push(groupName);
    }
  }

  for (const groupName of [...browser.groupOrder, ...Object.keys(browser.groups)]) {
    const browserUrls = Object.hasOwn(browser.groups, groupName) ? browser.groups[groupName] : undefined;
    if (!browserUrls) {
      continue;
    }

    let mergedUrls = groups[groupName];
    if (!mergedUrls) {
      mergedUrls = [];
      groups[groupName] = mergedUrls;
      groupOrder.push(groupName);
    }

    for (const url of browserUrls) {
      if (!mergedUrls.includes(url)) {
        mergedUrls.push(url);
      }
    }
  }

  return { groups, groupOrder };
}

// In-memory fingerprint of the last successfully synced state.
// Null means nothing has been synced yet this session (popup open).
let lastSyncedFingerprint: string | null = null;

/**
 * Build a stable string fingerprint of the current groups + order.
 * Two identical desired states produce the same fingerprint.
 */
export function buildSyncFingerprint(groups: TabGroups, groupOrder: string[]): string {
  return JSON.stringify(groupsToTabs(groups, groupOrder));
}

/**
 * Compute the SHA-256 hex hash of a raw fingerprint string.
 * Used for the persisted last-synced fingerprint.
 */
export async function hashSyncFingerprint(raw: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(raw);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Record the current state as the last successfully synced state.
 * Updates the in-memory fingerprint for the no-op guard and persists
 * the SHA-256 hash to storage for cross-session dirty tracking.
 */
export async function markAsSynced(groups: TabGroups, groupOrder: string[]): Promise<void> {
  const raw = buildSyncFingerprint(groups, groupOrder);
  lastSyncedFingerprint = raw;
  const hash = await hashSyncFingerprint(raw);
  await setLastSyncedFingerprint(hash);
}

/** Reset the in-memory fingerprint on logout so the next login re-seeds it from the API.
 *  Does NOT touch storage - the persisted hash is kept to detect offline edits. */
export function resetSyncFingerprint(): void {
  lastSyncedFingerprint = null;
}

// --- Over-limit pause marker ---
// Edits made while sync is paused over the limits are not "offline edits": the account has not
// moved on. The marker lets the next popup open carry on from the pause instead of prompting.
// It stores a hash of the auth token, so it only counts for the sign-in that paused.

/** Remember that sync is paused over the limits for the current sign-in. */
export async function markSyncPausedOverLimit(): Promise<void> {
  const token = await getAuthToken();
  if (token === null) {
    return;
  }

  await browser.storage.local.set({ [STORAGE_KEYS.SYNC_PAUSED_OVER_LIMIT]: await hashSyncFingerprint(token) });
}

/** Forget the over-limit pause, e.g. after a successful sync. */
export async function clearSyncPausedOverLimit(): Promise<void> {
  await browser.storage.local.remove(STORAGE_KEYS.SYNC_PAUSED_OVER_LIMIT);
}

/** Whether sync was paused over the limits under the current sign-in. */
export async function wasSyncPausedOverLimit(): Promise<boolean> {
  const [token, result] = await Promise.all([getAuthToken(), browser.storage.local.get(STORAGE_KEYS.SYNC_PAUSED_OVER_LIMIT)]);
  const marker = result[STORAGE_KEYS.SYNC_PAUSED_OVER_LIMIT];

  return token !== null && typeof marker === "string" && marker === (await hashSyncFingerprint(token));
}

// --- Sync kill switch ---
// Default-off: a fresh popup cannot sync until the remote state is known.
let syncEnabled = false;

/** Disable sync, cancel any pending debounce timer, and reset the in-memory fingerprint. */
export function disableSync(): void {
  syncEnabled = false;
  cancelPendingSync();
  resetSyncFingerprint();
}

/** Enable sync (called after a successful remote load or conflict resolution). */
export function enableSync(): void {
  syncEnabled = true;
}

/** Returns whether sync is currently enabled. */
export function isSyncEnabled(): boolean {
  return syncEnabled;
}

// --- Load action decision ---

/** The outcome of `decideLoadAction`. */
export type LoadAction = "useApi" | "pushLocal" | "conflict" | "none";

/**
 * Pure function that decides what to do after fetching the remote state.
 * Evaluated top-to-bottom; first match wins.
 * The account-wipe invariant: an empty local state is NEVER pushed,
 * regardless of fingerprint.
 */
export function decideLoadAction(input: {
  localHasGroups: boolean;
  apiHasGroups: boolean;
  localHash: string;
  apiHash: string;
  lastSyncedHash: string | null;
  /** Sync was paused over the limits under this sign-in (see `wasSyncPausedOverLimit`). */
  wasPausedOverLimit?: boolean;
}): LoadAction {
  const { localHasGroups, apiHasGroups, localHash, apiHash, lastSyncedHash, wasPausedOverLimit = false } = input;

  // 1. Both empty - nothing to do
  if (!localHasGroups && !apiHasGroups) {
    return "none";
  }

  // 2. Local empty - never push an empty state; use whatever the API has (or do nothing if API empty too, covered above)
  if (!localHasGroups) {
    return "useApi";
  }

  // 3. API empty but local is non-empty - push local (first sign-in onboarding)
  if (!apiHasGroups) {
    return "pushLocal";
  }

  // 4. Both non-empty and identical - no prompt; reseed fingerprint
  if (localHash === apiHash) {
    return "useApi";
  }

  // 5. Not dirty (local matches last synced state) - API wins silently (changes from another device)
  if (lastSyncedHash !== null && lastSyncedHash === localHash) {
    return "useApi";
  }

  // 6. Edited while sync was paused over the limits, and the account has not changed since - carry on
  //    from the pause: push local (or pause again if it is still over the limits)
  if (wasPausedOverLimit && lastSyncedHash !== null && lastSyncedHash === apiHash) {
    return "pushLocal";
  }

  // 7. Dirty: local was edited since last sync and differs from the account
  return "conflict";
}

/** Whether these groups are what this context last synced or loaded (false before the first sync or load). */
export function isLastSyncedState(groups: TabGroups, groupOrder: string[]): boolean {
  return lastSyncedFingerprint !== null && buildSyncFingerprint(groups, groupOrder) === lastSyncedFingerprint;
}

let syncTimeout: ReturnType<typeof setTimeout> | null = null;

export function debouncedSync(
  groups: TabGroups,
  groupOrder: string[],
  onSyncStart: () => void,
  onSyncComplete: () => void,
  onSyncError: (error: Error) => void,
  delay: number = 300,
): void {
  // Kill switch: if sync is disabled, don't even schedule
  if (!syncEnabled) {
    return;
  }

  if (syncTimeout) {
    clearTimeout(syncTimeout);
  }

  syncTimeout = setTimeout(async () => {
    // Re-check kill switch inside the timer (belt-and-suspenders)
    if (!isSyncEnabled()) {
      return;
    }

    // Skip sync if nothing has changed since the last successful sync.
    const fingerprint = buildSyncFingerprint(groups, groupOrder);
    if (fingerprint === lastSyncedFingerprint) {
      console.log("[sync] No changes since last sync - skipping");
      return;
    }

    console.log("[sync] Starting sync...");
    onSyncStart();
    try {
      const tabs = groupsToTabs(groups, groupOrder);
      console.log("[sync] Syncing tabs to API:", tabs);
      await syncTabs(tabs);
      console.log("[sync] Sync completed successfully");
      await markAsSynced(groups, groupOrder);
      onSyncComplete();
    } catch (error) {
      console.error("[sync] Sync error:", error);
      onSyncError(error instanceof Error ? error : new Error("Sync failed"));
    }
  }, delay);
}

export function cancelPendingSync(): void {
  if (syncTimeout) {
    clearTimeout(syncTimeout);
    syncTimeout = null;
  }
}
