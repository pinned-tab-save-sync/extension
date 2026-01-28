import { useState, useEffect, useCallback, useRef } from "react";
import type { TabGroups, SyncStatus } from "@/lib/types";
import { STORAGE_KEYS } from "@/lib/storage/keys";
import { fetchTabs, syncTabs } from "@/lib/api/tabs";
import {
  tabsToGroups,
  groupsToTabs,
  debouncedSync,
  cancelPendingSync,
} from "@/lib/sync";

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
  const wasAuthenticated = useRef(false);
  // Tracks whether we've loaded groups from API after login - prevents syncing empty groups
  const hasLoadedFromApi = useRef(false);
  // Tracks if user was already authenticated on initial mount (vs. logging in after mount)
  const wasAuthenticatedOnMount = useRef<boolean | null>(null);

  // Load groups from local storage on mount
  useEffect(() => {
    loadFromLocalStorage();
  }, []);

  // Track if user was already authenticated on mount
  // If so, we can trust local storage and enable syncing immediately
  // If not (user logged in after mount), we need to wait for loadGroupsFromApi
  useEffect(() => {
    if (wasAuthenticatedOnMount.current === null) {
      wasAuthenticatedOnMount.current = isAuthenticated;
      // If already authenticated on mount, we can trust local storage for syncing
      if (isAuthenticated) {
        hasLoadedFromApi.current = true;
      }
    }
  }, [isAuthenticated]);

  // Clear groups state when user logs out (not during initial auth check)
  useEffect(() => {
    // Only clear groups if user was previously authenticated and is now logged out
    if (wasAuthenticated.current && !isAuthenticated && isInitialized.current) {
      setGroups({});
      setActiveGroupNameState(null);
      setPendingConflict(null);
      // Reset the API load flag so we don't sync empty groups on next login
      hasLoadedFromApi.current = false;
      // Reset mount tracking since user logged out
      wasAuthenticatedOnMount.current = false;
    }
    wasAuthenticated.current = isAuthenticated;
  }, [isAuthenticated]);

  // Sync with API when authenticated and groups change
  useEffect(() => {
    // Don't sync if:
    // - Not authenticated
    // - Not initialized from local storage
    // - Haven't loaded from API yet after login (prevents syncing empty groups)
    if (!isAuthenticated || !isInitialized.current || !hasLoadedFromApi.current) {
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
      STORAGE_KEYS.TAB_GROUPS,
      STORAGE_KEYS.ACTIVE_GROUP,
    ]);
    const storedGroups = result[STORAGE_KEYS.TAB_GROUPS];
    const storedActiveGroup = result[STORAGE_KEYS.ACTIVE_GROUP];

    if (isValidTabGroups(storedGroups)) {
      setGroups(storedGroups);
    }
    if (typeof storedActiveGroup === "string") {
      setActiveGroupNameState(storedActiveGroup);
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
      const result = await browser.storage.local.get(STORAGE_KEYS.TAB_GROUPS);
      const storedGroups = result[STORAGE_KEYS.TAB_GROUPS];
      const localGroups: TabGroups = isValidTabGroups(storedGroups)
        ? storedGroups
        : {};

      const hasLocalGroups = Object.keys(localGroups).length > 0;
      const hasApiGroups = Object.keys(apiGroups).length > 0;

      // If both local and API groups exist, we have a conflict
      // Let the user decide how to resolve it
      if (hasLocalGroups && hasApiGroups) {
        setPendingConflict({ localGroups, apiGroups });
        // Mark as loaded so subsequent changes can sync (after conflict resolution)
        hasLoadedFromApi.current = true;
        setSyncStatus("idle");
        return;
      }

      // No conflict - proceed with merge
      const mergedGroups = { ...localGroups, ...apiGroups };

      await browser.storage.local.set({ [STORAGE_KEYS.TAB_GROUPS]: mergedGroups });
      setGroups(mergedGroups);

      // Mark as loaded from API - this enables syncing for subsequent changes
      hasLoadedFromApi.current = true;

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
          await browser.storage.local.set({ [STORAGE_KEYS.TAB_GROUPS]: apiGroups });
          setGroups(apiGroups);
        } else {
          // Merge: local groups first, API takes precedence for same names
          const mergedGroups = { ...localGroups, ...apiGroups };
          await browser.storage.local.set({ [STORAGE_KEYS.TAB_GROUPS]: mergedGroups });
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
      try {
        const updatedGroups = { ...groups, [name]: urls };
        await browser.storage.local.set({ [STORAGE_KEYS.TAB_GROUPS]: updatedGroups });
        setGroups(updatedGroups);
        setSyncError(null);
      } catch (error) {
        setSyncStatus("error");
        setSyncError(error instanceof Error ? error.message : "Failed to save group");
        throw error;
      }
    },
    [groups]
  );

  const deleteGroup = useCallback(
    async (name: string) => {
      try {
        const updatedGroups = { ...groups };
        delete updatedGroups[name];
        await browser.storage.local.set({ [STORAGE_KEYS.TAB_GROUPS]: updatedGroups });
        setGroups(updatedGroups);

        if (activeGroupName === name) {
          setActiveGroupNameState(null);
          await browser.storage.local.set({ [STORAGE_KEYS.ACTIVE_GROUP]: null });
        }
        setSyncError(null);
      } catch (error) {
        setSyncStatus("error");
        setSyncError(error instanceof Error ? error.message : "Failed to delete group");
        throw error;
      }
    },
    [groups, activeGroupName]
  );

  const setActiveGroupName = useCallback(async (name: string | null) => {
    setActiveGroupNameState(name);
    await browser.storage.local.set({ [STORAGE_KEYS.ACTIVE_GROUP]: name });
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
