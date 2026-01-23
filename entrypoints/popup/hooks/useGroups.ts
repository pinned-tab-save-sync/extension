import { useState, useEffect, useCallback, useRef } from "react";
import type { TabGroups } from "@/lib/types";
import { fetchTabs, syncTabs } from "@/lib/api/tabs";
import {
  tabsToGroups,
  groupsToTabs,
  debouncedSync,
  cancelPendingSync,
} from "@/lib/sync";

type SyncStatus = "idle" | "syncing" | "error";

interface UseGroupsReturn {
  groups: TabGroups;
  activeGroupName: string | null;
  syncStatus: SyncStatus;
  syncError: string | null;
  setActiveGroupName: (name: string | null) => void;
  saveGroup: (name: string, urls: string[]) => Promise<void>;
  deleteGroup: (name: string) => Promise<void>;
  loadGroupsFromApi: () => Promise<void>;
}

export function useGroups(isAuthenticated: boolean): UseGroupsReturn {
  const [groups, setGroups] = useState<TabGroups>({});
  const [activeGroupName, setActiveGroupNameState] = useState<string | null>(
    null
  );
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  const [syncError, setSyncError] = useState<string | null>(null);
  const isInitialized = useRef(false);

  // Load groups from local storage on mount
  useEffect(() => {
    loadFromLocalStorage();
  }, []);

  // Sync with API when authenticated and groups change
  useEffect(() => {
    if (!isAuthenticated || !isInitialized.current) {
      return;
    }

    debouncedSync(
      groups,
      () => setSyncStatus("syncing"),
      () => {
        setSyncStatus("idle");
        setSyncError(null);
      },
      (error) => {
        setSyncStatus("error");
        setSyncError(error.message);
      }
    );

    return () => cancelPendingSync();
  }, [groups, isAuthenticated]);

  const loadFromLocalStorage = async () => {
    const result = await browser.storage.local.get([
      "tabGroups",
      "activeGroupName",
    ]);
    if (result.tabGroups) {
      setGroups(result.tabGroups as TabGroups);
    }
    if (result.activeGroupName) {
      setActiveGroupNameState(result.activeGroupName as string);
    }
    isInitialized.current = true;
  };

  const loadGroupsFromApi = useCallback(async () => {
    if (!isAuthenticated) return;

    setSyncStatus("syncing");
    try {
      const tabs = await fetchTabs();
      const apiGroups = tabsToGroups(tabs);

      // Merge with local groups (API takes precedence)
      const result = await browser.storage.local.get("tabGroups");
      const localGroups = (result.tabGroups as TabGroups) || {};
      const mergedGroups = { ...localGroups, ...apiGroups };

      // Check if there are local-only groups that need to be synced to API
      const hasLocalOnlyGroups = Object.keys(localGroups).some(
        (name) => !(name in apiGroups)
      );

      await browser.storage.local.set({ tabGroups: mergedGroups });
      setGroups(mergedGroups);

      // If there are local groups not in API, sync them immediately
      // This ensures offline groups are backed up after registration/login
      if (hasLocalOnlyGroups) {
        const tabsPayload = groupsToTabs(mergedGroups);
        await syncTabs(tabsPayload);
      }

      setSyncStatus("idle");
      setSyncError(null);
    } catch (error) {
      setSyncStatus("error");
      setSyncError(error instanceof Error ? error.message : "Sync failed");
    }
  }, [isAuthenticated]);

  const saveGroup = useCallback(
    async (name: string, urls: string[]) => {
      const updatedGroups = { ...groups, [name]: urls };
      await browser.storage.local.set({ tabGroups: updatedGroups });
      setGroups(updatedGroups);
    },
    [groups]
  );

  const deleteGroup = useCallback(
    async (name: string) => {
      const updatedGroups = { ...groups };
      delete updatedGroups[name];
      await browser.storage.local.set({ tabGroups: updatedGroups });
      setGroups(updatedGroups);

      if (activeGroupName === name) {
        setActiveGroupNameState(null);
        await browser.storage.local.set({ activeGroupName: null });
      }
    },
    [groups, activeGroupName]
  );

  const setActiveGroupName = useCallback(async (name: string | null) => {
    setActiveGroupNameState(name);
    await browser.storage.local.set({ activeGroupName: name });
  }, []);

  return {
    groups,
    activeGroupName,
    syncStatus,
    syncError,
    setActiveGroupName,
    saveGroup,
    deleteGroup,
    loadGroupsFromApi,
  };
}
