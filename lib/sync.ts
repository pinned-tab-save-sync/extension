import type { PinnedTab, TabGroups } from "./types";
import { syncTabs } from "./api/tabs";

interface TabPayload {
  url: string;
  title?: string | null;
  favicon_url?: string | null;
  group_name: string;
  position: number;
}

export function groupsToTabs(groups: TabGroups, groupOrder?: string[]): TabPayload[] {
  const tabs: TabPayload[] = [];
  let position = 0;

  // Use provided order, or fall back to Object.keys order
  const orderedGroupNames = groupOrder ?? Object.keys(groups);

  // Process groups in order, then any remaining groups not in the order array
  const processedNames = new Set<string>();

  for (const groupName of orderedGroupNames) {
    if (groups[groupName]) {
      processedNames.add(groupName);
      for (const url of groups[groupName]) {
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
  const groups: TabGroups = {};
  const groupPositions: Map<string, number> = new Map();

  for (const tab of tabs) {
    const groupName = tab.group?.name || "Default";
    const groupPosition = tab.group?.position ?? Infinity;

    if (!groups[groupName]) {
      groups[groupName] = [];
      groupPositions.set(groupName, groupPosition);
    }
    groups[groupName].push(tab.url);
  }

  // Sort group names by their position
  const groupOrder = Array.from(groupPositions.entries())
    .sort((a, b) => a[1] - b[1])
    .map(([name]) => name);

  return { groups, groupOrder };
}

let syncTimeout: ReturnType<typeof setTimeout> | null = null;

export function debouncedSync(
  groups: TabGroups,
  groupOrder: string[],
  onSyncStart: () => void,
  onSyncComplete: () => void,
  onSyncError: (error: Error) => void,
  delay: number = 300
): void {
  if (syncTimeout) {
    clearTimeout(syncTimeout);
  }

  syncTimeout = setTimeout(async () => {
    console.log("[sync] Starting sync...");
    onSyncStart();
    try {
      const tabs = groupsToTabs(groups, groupOrder);
      console.log("[sync] Syncing tabs to API:", tabs);
      await syncTabs(tabs);
      console.log("[sync] Sync completed successfully");
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
