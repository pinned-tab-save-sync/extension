import { useState, useEffect, useCallback, useRef } from "react";
import type { TabGroups, SyncStatus } from "@/lib/types";
import { STORAGE_KEYS } from "@/lib/storage/keys";
import { fetchTabs, syncTabs } from "@/lib/api/tabs";
import { NetworkError } from "@/lib/api/client";
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

function isValidGroupOrder(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

interface UseGroupsReturn {
  groups: TabGroups;
  groupOrder: string[];
  activeGroupName: string | null;
  syncStatus: SyncStatus;
  syncError: string | null;
  isOffline: boolean;
  setActiveGroupName: (name: string | null) => void;
  saveGroup: (name: string, urls: string[]) => Promise<void>;
  deleteGroup: (name: string) => Promise<void>;
  reorderGroups: (fromIndex: number, toIndex: number) => Promise<void>;
  loadGroupsFromApi: () => Promise<void>;
}

export function useGroups(isAuthenticated: boolean): UseGroupsReturn {
  const [groups, setGroups] = useState<TabGroups>({});
  const [groupOrder, setGroupOrder] = useState<string[]>([]);
  const [activeGroupName, setActiveGroupNameState] = useState<string | null>(
    null
  );
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  const [syncError, setSyncError] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(false);
  const isInitialized = useRef(false);
  const wasAuthenticated = useRef(false);
  // Tracks whether we've loaded groups from API - prevents syncing before we know remote state
  const hasLoadedFromApi = useRef(false);
  // Tracks if we're currently loading from API (to prevent duplicate calls)
  const isLoadingFromApi = useRef(false);
  // Current browser window ID for per-window active group tracking
  const windowIdRef = useRef<number | null>(null);

  // Load groups from local storage on mount (after resolving window ID)
  useEffect(() => {
    browser.windows.getCurrent().then((win) => {
      windowIdRef.current = win.id ?? null;
      loadFromLocalStorage();
    });
  }, []);

  // Clear groups state when user logs out
  useEffect(() => {
    // Only clear groups if user was previously authenticated and is now logged out
    if (wasAuthenticated.current && !isAuthenticated && isInitialized.current) {
      console.log("[useGroups] User logged out, clearing state");
      setGroups({});
      setGroupOrder([]);
      setActiveGroupNameState(null);
      // Reset the API load flag so we load from API on next login
      hasLoadedFromApi.current = false;
      isLoadingFromApi.current = false;
    }
    wasAuthenticated.current = isAuthenticated;
  }, [isAuthenticated]);

  // Auto-load from API when authenticated and initialized (but not yet loaded)
  useEffect(() => {
    console.log("[useGroups] Auto-load effect:", {
      isAuthenticated,
      isInitialized: isInitialized.current,
      hasLoadedFromApi: hasLoadedFromApi.current,
      isLoadingFromApi: isLoadingFromApi.current,
    });

    // When authenticated and initialized, but haven't loaded from API yet, do it now
    if (isAuthenticated && isInitialized.current && !hasLoadedFromApi.current && !isLoadingFromApi.current) {
      console.log("[useGroups] Auto-loading from API...");
      isLoadingFromApi.current = true;
      loadGroupsFromApiInternal();
    }
  }, [isAuthenticated, groups]); // Also trigger when groups change (after loadFromLocalStorage)

  // Sync with API when authenticated and groups/order change
  useEffect(() => {
    console.log("[useGroups] Sync effect triggered", {
      isAuthenticated,
      isInitialized: isInitialized.current,
      hasLoadedFromApi: hasLoadedFromApi.current,
      groupCount: Object.keys(groups).length,
    });
    // Don't sync if:
    // - Not authenticated
    // - Not initialized from local storage
    // - Haven't loaded from API yet (prevents syncing before we know remote state)
    if (!isAuthenticated || !isInitialized.current || !hasLoadedFromApi.current) {
      console.log("[useGroups] Sync skipped - conditions not met");
      return;
    }

    console.log("[useGroups] Starting debounced sync...");
    debouncedSync(
      groups,
      groupOrder,
      () => setSyncStatus("syncing"),
      () => {
        setSyncStatus("idle");
        setSyncError(null);
        setIsOffline(false);
      },
      (error) => {
        setSyncStatus("error");
        if (error instanceof NetworkError) {
          setIsOffline(true);
          setSyncError("Working offline");
        } else {
          setIsOffline(false);
          setSyncError(error.message);
        }
      }
    );

    return () => cancelPendingSync();
  }, [groups, groupOrder, isAuthenticated]);

  const loadFromLocalStorage = async () => {
    const result = await browser.storage.local.get([
      STORAGE_KEYS.TAB_GROUPS,
      STORAGE_KEYS.ACTIVE_GROUPS_BY_WINDOW,
      STORAGE_KEYS.GROUP_ORDER,
    ]);
    const storedGroups = result[STORAGE_KEYS.TAB_GROUPS];
    const storedActiveByWindow = result[STORAGE_KEYS.ACTIVE_GROUPS_BY_WINDOW];
    const storedOrder = result[STORAGE_KEYS.GROUP_ORDER];

    if (isValidTabGroups(storedGroups)) {
      setGroups(storedGroups);
      // Use stored order if valid, otherwise derive from groups
      if (isValidGroupOrder(storedOrder)) {
        // Filter out any names that no longer exist in groups
        const validOrder = storedOrder.filter((name) => name in storedGroups);
        // Add any groups that aren't in the order
        const missingGroups = Object.keys(storedGroups).filter(
          (name) => !validOrder.includes(name)
        );
        setGroupOrder([...validOrder, ...missingGroups]);
      } else {
        setGroupOrder(Object.keys(storedGroups));
      }
    }

    // Load active group for this specific window
    const winId = windowIdRef.current;
    if (winId != null && storedActiveByWindow && typeof storedActiveByWindow === "object") {
      const activeForWindow = (storedActiveByWindow as Record<string, string>)[String(winId)];
      if (typeof activeForWindow === "string") {
        setActiveGroupNameState(activeForWindow);
      }
    }

    isInitialized.current = true;
  };

  // Internal function to load groups from API - implements API-first sync strategy
  const loadGroupsFromApiInternal = async () => {
    console.log("[useGroups] loadGroupsFromApiInternal called");

    setSyncStatus("syncing");
    try {
      console.log("[useGroups] Fetching tabs from API...");
      const apiTabs = await fetchTabs();
      console.log("[useGroups] Fetched tabs:", apiTabs);
      const { groups: apiGroups, groupOrder: apiOrder } = tabsToGroups(apiTabs);

      const hasApiGroups = Object.keys(apiGroups).length > 0;

      if (hasApiGroups) {
        // API has data - use it as source of truth
        console.log("[useGroups] API has data, using as source of truth");
        await browser.storage.local.set({
          [STORAGE_KEYS.TAB_GROUPS]: apiGroups,
          [STORAGE_KEYS.GROUP_ORDER]: apiOrder,
        });
        setGroups(apiGroups);
        setGroupOrder(apiOrder);
      } else {
        // API is empty - check if we have local data to push
        const result = await browser.storage.local.get([
          STORAGE_KEYS.TAB_GROUPS,
          STORAGE_KEYS.GROUP_ORDER,
        ]);
        const storedGroups = result[STORAGE_KEYS.TAB_GROUPS];
        const storedOrder = result[STORAGE_KEYS.GROUP_ORDER];
        const localGroups: TabGroups = isValidTabGroups(storedGroups)
          ? storedGroups
          : {};
        const localOrder: string[] = isValidGroupOrder(storedOrder)
          ? storedOrder.filter((name) => name in localGroups)
          : Object.keys(localGroups);

        const hasLocalGroups = Object.keys(localGroups).length > 0;

        if (hasLocalGroups) {
          // Push local data to API
          console.log("[useGroups] API empty, pushing local data to API");
          const tabsPayload = groupsToTabs(localGroups, localOrder);
          await syncTabs(tabsPayload);
          // Local data is already in state, no need to update
        } else {
          console.log("[useGroups] Both API and local are empty");
        }
      }

      // Mark as loaded from API - this enables syncing for subsequent changes
      hasLoadedFromApi.current = true;
      isLoadingFromApi.current = false;
      setSyncStatus("idle");
      setSyncError(null);
      setIsOffline(false);
    } catch (error) {
      console.error("[useGroups] loadGroupsFromApiInternal error:", error);
      isLoadingFromApi.current = false;
      // Mark as loaded so user can continue working offline
      hasLoadedFromApi.current = true;
      setSyncStatus("error");

      if (error instanceof NetworkError) {
        setIsOffline(true);
        setSyncError("Working offline");
      } else {
        setIsOffline(false);
        setSyncError(error instanceof Error ? error.message : "Sync failed");
      }
    }
  };

  // Public wrapper for loadGroupsFromApi (used for manual retry)
  const loadGroupsFromApi = useCallback(async () => {
    console.log("[useGroups] loadGroupsFromApi called, isAuthenticated:", isAuthenticated);
    if (!isAuthenticated) return;
    if (isLoadingFromApi.current) {
      console.log("[useGroups] Already loading from API, skipping");
      return;
    }
    isLoadingFromApi.current = true;
    await loadGroupsFromApiInternal();
  }, [isAuthenticated]);

  const saveGroup = useCallback(
    async (name: string, urls: string[]) => {
      try {
        const updatedGroups = { ...groups, [name]: urls };
        // Add to order if it's a new group
        const isNewGroup = !(name in groups);
        const updatedOrder = isNewGroup ? [...groupOrder, name] : groupOrder;

        await browser.storage.local.set({
          [STORAGE_KEYS.TAB_GROUPS]: updatedGroups,
          [STORAGE_KEYS.GROUP_ORDER]: updatedOrder,
        });
        setGroups(updatedGroups);
        if (isNewGroup) {
          setGroupOrder(updatedOrder);
        }
        setSyncError(null);
      } catch (error) {
        setSyncStatus("error");
        setSyncError(error instanceof Error ? error.message : "Failed to save group");
        throw error;
      }
    },
    [groups, groupOrder]
  );

  const deleteGroup = useCallback(
    async (name: string) => {
      try {
        const updatedGroups = { ...groups };
        delete updatedGroups[name];
        const updatedOrder = groupOrder.filter((n) => n !== name);

        await browser.storage.local.set({
          [STORAGE_KEYS.TAB_GROUPS]: updatedGroups,
          [STORAGE_KEYS.GROUP_ORDER]: updatedOrder,
        });
        setGroups(updatedGroups);
        setGroupOrder(updatedOrder);

        if (activeGroupName === name) {
          setActiveGroupNameState(null);
          const winId = windowIdRef.current;
          if (winId != null) {
            const result = await browser.storage.local.get(STORAGE_KEYS.ACTIVE_GROUPS_BY_WINDOW);
            const current = (result[STORAGE_KEYS.ACTIVE_GROUPS_BY_WINDOW] as Record<string, string | null> | undefined) ?? {};
            await browser.storage.local.set({
              [STORAGE_KEYS.ACTIVE_GROUPS_BY_WINDOW]: { ...current, [String(winId)]: null },
            });
          }
        }
        setSyncError(null);
      } catch (error) {
        setSyncStatus("error");
        setSyncError(error instanceof Error ? error.message : "Failed to delete group");
        throw error;
      }
    },
    [groups, groupOrder, activeGroupName]
  );

  const setActiveGroupName = useCallback(async (name: string | null) => {
    setActiveGroupNameState(name);
    const winId = windowIdRef.current;
    if (winId == null) return;

    const result = await browser.storage.local.get(STORAGE_KEYS.ACTIVE_GROUPS_BY_WINDOW);
    const current = (result[STORAGE_KEYS.ACTIVE_GROUPS_BY_WINDOW] as Record<string, string | null> | undefined) ?? {};
    await browser.storage.local.set({
      [STORAGE_KEYS.ACTIVE_GROUPS_BY_WINDOW]: { ...current, [String(winId)]: name },
    });
  }, []);

  const reorderGroups = useCallback(
    async (fromIndex: number, toIndex: number) => {
      if (fromIndex === toIndex) return;
      if (fromIndex < 0 || fromIndex >= groupOrder.length) return;
      if (toIndex < 0 || toIndex >= groupOrder.length) return;

      try {
        const updatedOrder = [...groupOrder];
        const [removed] = updatedOrder.splice(fromIndex, 1);
        updatedOrder.splice(toIndex, 0, removed);

        await browser.storage.local.set({
          [STORAGE_KEYS.GROUP_ORDER]: updatedOrder,
        });
        setGroupOrder(updatedOrder);
        setSyncError(null);
      } catch (error) {
        setSyncStatus("error");
        setSyncError(error instanceof Error ? error.message : "Failed to reorder groups");
        throw error;
      }
    },
    [groupOrder]
  );

  return {
    groups,
    groupOrder,
    activeGroupName,
    syncStatus,
    syncError,
    isOffline,
    setActiveGroupName,
    saveGroup,
    deleteGroup,
    reorderGroups,
    loadGroupsFromApi,
  };
}
