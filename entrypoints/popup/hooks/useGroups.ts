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

function isValidTabGroups(value: unknown): value is TabGroups {
  if (!value || typeof value !== "object") return false;
  for (const [key, urls] of Object.entries(value)) {
    if (typeof key !== "string") return false;
    if (!Array.isArray(urls)) return false;
    if (!urls.every((url) => typeof url === "string")) return false;
  }
  return true;
}

export interface ConflictData {
  localGroups: TabGroups;
  apiGroups: TabGroups;
}

interface UseGroupsReturn {
  groups: TabGroups;
  activeGroupName: string | null;
  syncStatus: SyncStatus;
  syncError: string | null;
  pendingConflict: ConflictData | null;
  setActiveGroupName: (name: string | null) => void;
  saveGroup: (name: string, urls: string[]) => Promise<void>;
  deleteGroup: (name: string) => Promise<void>;
  loadGroupsFromApi: () => Promise<void>;
  resolveConflict: (choice: "discard" | "merge") => Promise<void>;
}

export function useGroups(isAuthenticated: boolean): UseGroupsReturn {
  const [groups, setGroups] = useState<TabGroups>({});
  const [activeGroupName, setActiveGroupNameState] = useState<string | null>(
    null
  );
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  const [syncError, setSyncError] = useState<string | null>(null);
  const [pendingConflict, setPendingConflict] = useState<ConflictData | null>(
    null
  );
  const isInitialized = useRef(false);

  // Load groups from local storage on mount
  useEffect(() => {
    loadFromLocalStorage();
  }, []);

  // Clear groups state when user logs out
  useEffect(() => {
    if (!isAuthenticated && isInitialized.current) {
      setGroups({});
      setActiveGroupNameState(null);
      setPendingConflict(null);
    }
  }, [isAuthenticated]);

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
    if (isValidTabGroups(result.tabGroups)) {
      setGroups(result.tabGroups);
    }
    if (typeof result.activeGroupName === "string") {
      setActiveGroupNameState(result.activeGroupName);
    }
    isInitialized.current = true;
  };

  const loadGroupsFromApi = useCallback(async () => {
    if (!isAuthenticated) return;

    setSyncStatus("syncing");
    try {
      const tabs = await fetchTabs();
      const apiGroups = tabsToGroups(tabs);

      // Get local groups
      const result = await browser.storage.local.get("tabGroups");
      const localGroups = isValidTabGroups(result.tabGroups)
        ? result.tabGroups
        : {};

      const hasLocalGroups = Object.keys(localGroups).length > 0;
      const hasApiGroups = Object.keys(apiGroups).length > 0;

      // If both local and API groups exist, we have a conflict
      // Let the user decide how to resolve it
      if (hasLocalGroups && hasApiGroups) {
        setPendingConflict({ localGroups, apiGroups });
        setSyncStatus("idle");
        return;
      }

      // No conflict - proceed with merge
      const mergedGroups = { ...localGroups, ...apiGroups };

      await browser.storage.local.set({ tabGroups: mergedGroups });
      setGroups(mergedGroups);

      // If there are local-only groups, sync them to API
      if (hasLocalGroups && !hasApiGroups) {
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

  const resolveConflict = useCallback(
    async (choice: "discard" | "merge") => {
      if (!pendingConflict) return;

      const { localGroups, apiGroups } = pendingConflict;

      setSyncStatus("syncing");
      try {
        if (choice === "discard") {
          // Discard local groups, use only API groups
          await browser.storage.local.set({ tabGroups: apiGroups });
          setGroups(apiGroups);
        } else {
          // Merge: local groups first, API takes precedence for same names
          const mergedGroups = { ...localGroups, ...apiGroups };
          await browser.storage.local.set({ tabGroups: mergedGroups });
          setGroups(mergedGroups);

          // Sync merged groups to API so local-only groups are backed up
          const tabsPayload = groupsToTabs(mergedGroups);
          await syncTabs(tabsPayload);
        }

        setPendingConflict(null);
        setSyncStatus("idle");
        setSyncError(null);
      } catch (error) {
        setSyncStatus("error");
        setSyncError(error instanceof Error ? error.message : "Sync failed");
      }
    },
    [pendingConflict]
  );

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
    pendingConflict,
    setActiveGroupName,
    saveGroup,
    deleteGroup,
    loadGroupsFromApi,
    resolveConflict,
  };
}
