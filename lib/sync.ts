import type { PinnedTab, TabGroups } from "./types";
import { syncTabs } from "./api/tabs";

interface TabPayload {
  url: string;
  title?: string | null;
  favicon_url?: string | null;
  group_name: string;
  position: number;
}

export function groupsToTabs(groups: TabGroups): TabPayload[] {
  const tabs: TabPayload[] = [];
  let position = 0;

  for (const [groupName, urls] of Object.entries(groups)) {
    for (const url of urls) {
      tabs.push({
        url,
        group_name: groupName,
        position: position++,
      });
    }
  }

  return tabs;
}

export function tabsToGroups(tabs: PinnedTab[]): TabGroups {
  const groups: TabGroups = {};

  for (const tab of tabs) {
    const groupName = tab.group?.name || "Default";
    if (!groups[groupName]) {
      groups[groupName] = [];
    }
    groups[groupName].push(tab.url);
  }

  return groups;
}

let syncTimeout: ReturnType<typeof setTimeout> | null = null;

export function debouncedSync(
  groups: TabGroups,
  onSyncStart: () => void,
  onSyncComplete: () => void,
  onSyncError: (error: Error) => void,
  delay: number = 300
): void {
  if (syncTimeout) {
    clearTimeout(syncTimeout);
  }

  syncTimeout = setTimeout(async () => {
    onSyncStart();
    try {
      const tabs = groupsToTabs(groups);
      await syncTabs(tabs);
      onSyncComplete();
    } catch (error) {
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
