import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import type { TabGroups, TabGroupsSummary, SyncStatus, SyncConflictChoice, UserLimits } from "@/lib/types";
import { STORAGE_KEYS } from "@/lib/storage/keys";
import { getAuthToken } from "@/lib/storage/auth";
import { getActiveGroupForWindow, setActiveGroupForWindow } from "@/lib/storage/activeGroups";
import { getLastSyncedFingerprint } from "@/lib/storage/sync";
import { guardedStorageWrite } from "@/lib/storage/guardedWrite";
import { fetchTabs, syncTabs } from "@/lib/api/tabs";
import { NetworkError } from "@/lib/api/client";
import {
  tabsToGroups,
  groupsToTabs,
  debouncedSync,
  cancelPendingSync,
  markAsSynced,
  resetSyncFingerprint,
  buildSyncFingerprint,
  hashSyncFingerprint,
  decideLoadAction,
  mergeTabGroups,
  summariseTabGroups,
  enableSync,
  disableSync,
  markSyncPausedOverLimit,
  clearSyncPausedOverLimit,
  wasSyncPausedOverLimit,
} from "@/lib/sync";
import { findLimitViolation, getSyncLimitErrorMessage } from "@/lib/limits";
import { applyImport, type ImportedGroup, type ImportMode } from "@/lib/import";

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

/** The groups and order in local storage, which can be newer than this context's React state. */
async function readStoredGroups(): Promise<{ groups: TabGroups; groupOrder: string[] }> {
  const storedResult = await browser.storage.local.get([STORAGE_KEYS.TAB_GROUPS, STORAGE_KEYS.GROUP_ORDER]);
  const storedGroups = storedResult[STORAGE_KEYS.TAB_GROUPS];
  const storedOrder = storedResult[STORAGE_KEYS.GROUP_ORDER];
  const groups: TabGroups = isValidTabGroups(storedGroups) ? storedGroups : {};
  const groupOrder: string[] = isValidGroupOrder(storedOrder) ? storedOrder.filter((name) => Object.hasOwn(groups, name)) : Object.keys(groups);

  return { groups, groupOrder };
}

interface UseGroupsReturn {
  groups: TabGroups;
  groupOrder: string[];
  activeGroupName: string | null;
  syncStatus: SyncStatus;
  syncError: string | null;
  isOffline: boolean;
  hasSyncConflict: boolean;
  /** Why sync is paused for being over the limits, or the API's limit rejection message. Null when within limits. */
  syncLimitError: string | null;
  /** Limit problems with the conflict prompt's "browser" and "merge" choices, so they can be disabled up front. */
  conflictLimitViolations: { browser: string | null; merge: string | null };
  /** Group and tab counts for each side of a sync conflict, or null when there is no conflict. */
  conflictSummary: { account: TabGroupsSummary; browser: TabGroupsSummary } | null;
  setActiveGroupName: (name: string | null) => void;
  saveGroup: (name: string, urls: string[]) => Promise<void>;
  deleteGroup: (name: string) => Promise<void>;
  reorderGroups: (fromIndex: number, toIndex: number) => Promise<void>;
  /** Imports another extension's groups. Returns why nothing was saved, or null once saved. */
  importGroups: (importedGroups: ImportedGroup[], mode: ImportMode) => Promise<string | null>;
  loadGroupsFromApi: () => Promise<void>;
  /** Resets all local UI state after a successful deleteAllLocalData(). Does NOT write to storage. */
  resetLocalState: () => void;
  resolveSyncConflict: (choice: SyncConflictChoice) => Promise<void>;
  /** Bumps loadGeneration to immediately cancel any in-flight API loads.
   *  Call this BEFORE starting a destructive operation (e.g. delete-all) so
   *  the synchronous generation check in guardedStorageWrite closes the race
   *  window before the async wipe begins. */
  invalidateInFlightLoads: () => void;
  /** Whether the groups have been read from local storage. */
  hasLoadedLocalState: boolean;
  /** Signed in: whether the account's groups have loaded and sync is running (false during a conflict or after a failed load). */
  hasLoadedAccount: boolean;
}

/**
 * @param syncLimits The signed-in user's limits from `GET /user`, or null when logged out or unknown (no limits apply).
 */
export function useGroups(isAuthenticated: boolean, syncLimits: UserLimits | null): UseGroupsReturn {
  const [groups, setGroups] = useState<TabGroups>({});
  const [groupOrder, setGroupOrder] = useState<string[]>([]);
  const [activeGroupName, setActiveGroupNameState] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  const [syncError, setSyncError] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(false);
  const [hasSyncConflict, setHasSyncConflict] = useState(false);
  const [syncLimitError, setSyncLimitError] = useState<string | null>(null);

  const isInitialized = useRef(false);
  // State twin of isInitialized, so the auto-load effect re-runs once local storage has loaded
  const [hasLoadedLocalState, setHasLoadedLocalState] = useState(false);
  const wasAuthenticated = useRef(false);
  // Tracks whether we've loaded groups from API - prevents syncing before we know remote state
  const hasLoadedFromApi = useRef(false);
  // State twin of hasLoadedFromApi, for screens that wait for the account's groups (the import page)
  const [hasLoadedAccount, setHasLoadedAccount] = useState(false);
  const setLoadedFromApi = (loaded: boolean) => {
    hasLoadedFromApi.current = loaded;
    setHasLoadedAccount(loaded);
  };
  // Tracks if we're currently loading from API (to prevent duplicate calls)
  const isLoadingFromApi = useRef(false);
  // Prevents the auto-load effect from re-triggering on every groups change after a failure or conflict
  const isAutoLoadBlocked = useRef(false);
  // Incremented on logout and after deleteAllLocalData to cancel any in-flight loads
  const loadGeneration = useRef(0);
  // Current browser window ID for per-window active group tracking
  const windowIdRef = useRef<number | null>(null);
  // Holds the API state while a conflict prompt is showing
  const pendingApiState = useRef<{ groups: TabGroups; groupOrder: string[] } | null>(null);

  // Load groups from local storage on mount (after resolving window ID)
  useEffect(() => {
    browser.windows.getCurrent().then((win) => {
      windowIdRef.current = win.id ?? null;
      loadFromLocalStorage();
    });
  }, []);

  // Keep groups local when user logs out (do NOT clear groups)
  useEffect(() => {
    // Only act when user was previously authenticated and is now logged out
    if (wasAuthenticated.current && !isAuthenticated && isInitialized.current) {
      console.log("[useGroups] User logged out, keeping local tab groups");
      // Reset API load flags so we load fresh on next login
      setLoadedFromApi(false);
      isLoadingFromApi.current = false;
      isAutoLoadBlocked.current = false;
      // Clear any pending conflict
      setHasSyncConflict(false);
      setSyncLimitError(null);
      pendingApiState.current = null;
      void clearSyncPausedOverLimit();
      // Disable sync and cancel any in-flight load
      disableSync();
      loadGeneration.current++;
      resetSyncFingerprint();
      setSyncStatus("idle");
      setSyncError(null);
      setIsOffline(false);
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
      isAutoLoadBlocked: isAutoLoadBlocked.current,
    });

    if (isAuthenticated && isInitialized.current && !hasLoadedFromApi.current && !isLoadingFromApi.current && !isAutoLoadBlocked.current) {
      console.log("[useGroups] Auto-loading from API...");
      isLoadingFromApi.current = true;
      loadGroupsFromApiInternal();
    }
  }, [isAuthenticated, groups, hasLoadedLocalState]); // Also re-check once local storage has loaded

  /** Pause sync because the groups are over the limits. Local edits keep saving, and the next edit that fits resumes sync. */
  const enterOverLimit = useCallback((message: string) => {
    setSyncStatus("overLimit");
    setSyncLimitError(message);
    setSyncError(message);
    setIsOffline(false);
    void markSyncPausedOverLimit();
  }, []);

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

    // Don't send a push the API would reject; pause until the groups fit again
    const limitViolation = findLimitViolation(groups, syncLimits);
    if (limitViolation) {
      console.log("[useGroups] Sync paused - over the sync limits:", limitViolation);
      cancelPendingSync();
      enterOverLimit(limitViolation);
      return;
    }

    setSyncLimitError(null);
    setSyncStatus((status) => (status === "overLimit" ? "idle" : status));

    console.log("[useGroups] Starting debounced sync...");
    debouncedSync(
      groups,
      groupOrder,
      () => setSyncStatus("syncing"),
      () => {
        setSyncStatus("idle");
        setSyncError(null);
        setSyncLimitError(null);
        setIsOffline(false);
        void clearSyncPausedOverLimit();
      },
      (error) => {
        const limitMessage = getSyncLimitErrorMessage(error);
        if (limitMessage) {
          enterOverLimit(limitMessage);
          return;
        }

        setSyncStatus("error");
        if (error instanceof NetworkError) {
          setIsOffline(true);
          setSyncError("Working offline");
        } else {
          setIsOffline(false);
          setSyncError(error.message);
        }
      },
    );

    return () => cancelPendingSync();
  }, [groups, groupOrder, isAuthenticated, syncLimits, enterOverLimit]);

  const loadFromLocalStorage = async () => {
    const result = await browser.storage.local.get([STORAGE_KEYS.TAB_GROUPS, STORAGE_KEYS.GROUP_ORDER]);
    const storedGroups = result[STORAGE_KEYS.TAB_GROUPS];
    const storedOrder = result[STORAGE_KEYS.GROUP_ORDER];

    if (isValidTabGroups(storedGroups)) {
      setGroups(storedGroups);
      // Use stored order if valid, otherwise derive from groups
      if (isValidGroupOrder(storedOrder)) {
        // Filter out any names that no longer exist in groups
        const validOrder = storedOrder.filter((name) => Object.hasOwn(storedGroups, name));
        // Add any groups that aren't in the order
        const missingGroups = Object.keys(storedGroups).filter((name) => !validOrder.includes(name));
        setGroupOrder([...validOrder, ...missingGroups]);
      } else {
        setGroupOrder(Object.keys(storedGroups));
      }
    }

    // Set before the await below, and mirrored in state so the auto-load effect runs even if it already
    // checked (and skipped) while this was loading - otherwise the API load waits for the first edit
    isInitialized.current = true;
    setHasLoadedLocalState(true);

    // Load active group for this specific window
    const winId = windowIdRef.current;
    if (winId != null) {
      const activeForWindow = await getActiveGroupForWindow(winId).catch((error) => {
        console.warn("[useGroups] Failed to read the window's active group:", error);
        return null;
      });
      if (activeForWindow !== null) {
        setActiveGroupNameState(activeForWindow);
      }
    }
  };

  // Internal function to load groups from API - implements the reconciliation strategy
  const loadGroupsFromApiInternal = async () => {
    console.log("[useGroups] loadGroupsFromApiInternal called");
    const generation = loadGeneration.current;

    setSyncStatus("syncing");
    try {
      console.log("[useGroups] Fetching tabs from API...");
      const apiTabs = await fetchTabs();

      // Stale-load guard: cancel if the popup was reset or the token is gone
      if (loadGeneration.current !== generation || (await getAuthToken()) === null) {
        console.log("[useGroups] Load cancelled (stale generation or missing token) after fetchTabs");
        isLoadingFromApi.current = false;
        return;
      }

      console.log("[useGroups] Fetched tabs:", apiTabs);
      const { groups: apiGroups, groupOrder: apiOrder } = tabsToGroups(apiTabs);

      // Read authoritative local state from storage (not React state, which may be stale)
      const { groups: localGroups, groupOrder: localOrder } = await readStoredGroups();

      // Stale-load guard after storage read
      if (loadGeneration.current !== generation || (await getAuthToken()) === null) {
        console.log("[useGroups] Load cancelled (stale generation or missing token) after storage read");
        isLoadingFromApi.current = false;
        return;
      }

      const localHasGroups = Object.keys(localGroups).length > 0;
      const apiHasGroups = Object.keys(apiGroups).length > 0;

      const [localHash, apiHash, lastSyncedHash, wasPausedOverLimit] = await Promise.all([
        hashSyncFingerprint(buildSyncFingerprint(localGroups, localOrder)),
        hashSyncFingerprint(buildSyncFingerprint(apiGroups, apiOrder)),
        getLastSyncedFingerprint(),
        wasSyncPausedOverLimit(),
      ]);

      // Stale-load guard after hash computation
      if (loadGeneration.current !== generation || (await getAuthToken()) === null) {
        console.log("[useGroups] Load cancelled (stale generation or missing token) after hashing");
        isLoadingFromApi.current = false;
        return;
      }

      const action = decideLoadAction({ localHasGroups, apiHasGroups, localHash, apiHash, lastSyncedHash, wasPausedOverLimit });
      console.log("[useGroups] Load action:", action, { localHasGroups, apiHasGroups, localHash, apiHash, lastSyncedHash, wasPausedOverLimit });

      if (action === "useApi") {
        // API wins - write to storage only if the load is still current.
        // guardedStorageWrite checks the token (async) then the generation
        // (synchronous, no await before the set call), so a wipe that bumps
        // loadGeneration before this point cannot slip a stale write through.
        const written = await guardedStorageWrite(
          { [STORAGE_KEYS.TAB_GROUPS]: apiGroups, [STORAGE_KEYS.GROUP_ORDER]: apiOrder },
          generation,
          () => loadGeneration.current,
        );
        if (!written) {
          isLoadingFromApi.current = false;
          return;
        }

        // Stale-load guard before React state updates (defence in depth)
        if (loadGeneration.current !== generation || (await getAuthToken()) === null) {
          isLoadingFromApi.current = false;
          return;
        }

        // Cleared before the state update, so a pause the sync effect re-enters below is kept
        await clearSyncPausedOverLimit();
        setGroups(apiGroups);
        setGroupOrder(apiOrder);
        await markAsSynced(apiGroups, apiOrder);
        setLoadedFromApi(true);
        isLoadingFromApi.current = false;
        isAutoLoadBlocked.current = false;
        enableSync();
        setSyncStatus("idle");
        setSyncError(null);
        setSyncLimitError(null);
        setIsOffline(false);
      } else if (action === "pushLocal") {
        // Push local to API: first sign-in onboarding (empty account), or carrying on after an over-limit pause
        console.log("[useGroups] Pushing local data to API");

        // Local groups can be over the limits (made while logged out, or still over after a pause). Nothing
        // newer is in the account, so enable sync anyway: the next edit that brings them within the limits pushes them.
        let limitMessage = findLimitViolation(localGroups, syncLimits);
        if (!limitMessage) {
          try {
            await syncTabs(groupsToTabs(localGroups, localOrder));
          } catch (error) {
            limitMessage = getSyncLimitErrorMessage(error);
            if (!limitMessage) {
              throw error;
            }
          }
        }

        if (limitMessage) {
          if (loadGeneration.current !== generation || (await getAuthToken()) === null) {
            isLoadingFromApi.current = false;
            return;
          }

          setLoadedFromApi(true);
          isLoadingFromApi.current = false;
          isAutoLoadBlocked.current = false;
          enableSync();
          enterOverLimit(limitMessage);
          return;
        }

        // Stale-load guard after sync
        if (loadGeneration.current !== generation || (await getAuthToken()) === null) {
          isLoadingFromApi.current = false;
          return;
        }

        await markAsSynced(localGroups, localOrder);
        await clearSyncPausedOverLimit();
        setLoadedFromApi(true);
        isLoadingFromApi.current = false;
        isAutoLoadBlocked.current = false;
        enableSync();
        setSyncStatus("idle");
        setSyncError(null);
        setSyncLimitError(null);
        setIsOffline(false);
      } else if (action === "none") {
        // Both empty
        console.log("[useGroups] Both API and local are empty");
        await markAsSynced({}, []);
        setLoadedFromApi(true);
        isLoadingFromApi.current = false;
        isAutoLoadBlocked.current = false;
        enableSync();
        setSyncStatus("idle");
        setSyncError(null);
        setSyncLimitError(null);
        setIsOffline(false);
      } else {
        // action === "conflict"
        console.log("[useGroups] Sync conflict detected - showing prompt");
        pendingApiState.current = { groups: apiGroups, groupOrder: apiOrder };
        setHasSyncConflict(true);
        setSyncStatus("conflict");
        setSyncError(null);
        setSyncLimitError(null);
        setIsOffline(false);
        isLoadingFromApi.current = false;
        isAutoLoadBlocked.current = true;
        // Do NOT set hasLoadedFromApi; do NOT call enableSync()
      }
    } catch (error) {
      console.error("[useGroups] loadGroupsFromApiInternal error:", error);
      isLoadingFromApi.current = false;
      // Block auto-reload after a failure (R4 fix: do NOT enable sync on failure)
      isAutoLoadBlocked.current = true;
      // Do NOT set hasLoadedFromApi.current = true
      // Do NOT call enableSync()
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
    // Clear the auto-load block on an explicit retry
    isAutoLoadBlocked.current = false;
    isLoadingFromApi.current = true;
    await loadGroupsFromApiInternal();
  }, [isAuthenticated]);

  /**
   * Bumps the load generation to immediately cancel any in-flight API load.
   * Must be called BEFORE starting a destructive operation so that the
   * synchronous generation check in guardedStorageWrite closes the race window.
   */
  const invalidateInFlightLoads = useCallback(() => {
    loadGeneration.current++;
  }, []);

  /**
   * Resets all local React state after a successful deleteAllLocalData().
   * Does NOT write to storage - that was already cleared by deleteAllLocalData.
   */
  const resetLocalState = useCallback(() => {
    setGroups({});
    setGroupOrder([]);
    setActiveGroupNameState(null);
    setSyncStatus("idle");
    setSyncError(null);
    setIsOffline(false);
    setHasSyncConflict(false);
    setSyncLimitError(null);
    pendingApiState.current = null;
    loadGeneration.current++;
  }, []);

  /**
   * Resolves a sync conflict by choosing the account's groups, the browser's
   * local groups, or a merge of both (nothing removed) as the new source of truth.
   * Empty-state guard: "browser" choice is blocked when local groups is empty
   * to prevent account wipes.
   */
  const resolveSyncConflict = useCallback(
    async (choice: SyncConflictChoice): Promise<void> => {
      const generation = loadGeneration.current;
      const token = await getAuthToken();
      if (loadGeneration.current !== generation || token === null) {
        return;
      }

      if (choice === "account") {
        const { groups: apiGroups, groupOrder: apiOrder } = pendingApiState.current!;

        // Guard before write: same token-first then synchronous-generation pattern
        // as guardedStorageWrite ensures a delete-all wipe that bumped the generation
        // cannot race with this write.
        const written = await guardedStorageWrite(
          { [STORAGE_KEYS.TAB_GROUPS]: apiGroups, [STORAGE_KEYS.GROUP_ORDER]: apiOrder },
          generation,
          () => loadGeneration.current,
        );
        if (!written) {
          return;
        }

        // Stale-load guard before React state updates (defence in depth)
        if (loadGeneration.current !== generation || (await getAuthToken()) === null) {
          return;
        }

        setGroups(apiGroups);
        setGroupOrder(apiOrder);
        await markAsSynced(apiGroups, apiOrder);
      } else if (choice === "merge") {
        const { groups: mergedGroups, groupOrder: mergedOrder } = mergeTabGroups(pendingApiState.current!, { groups, groupOrder });

        // Push first so a failed sync leaves both sides untouched and the prompt still showing
        try {
          await syncTabs(groupsToTabs(mergedGroups, mergedOrder));
        } catch (error) {
          setSyncStatus("conflict");
          setSyncLimitError(getSyncLimitErrorMessage(error));
          setSyncError(error instanceof Error ? error.message : "Sync failed");
          return;
        }

        const written = await guardedStorageWrite(
          { [STORAGE_KEYS.TAB_GROUPS]: mergedGroups, [STORAGE_KEYS.GROUP_ORDER]: mergedOrder },
          generation,
          () => loadGeneration.current,
        );
        if (!written) {
          return;
        }

        if (loadGeneration.current !== generation || (await getAuthToken()) === null) {
          return;
        }

        setGroups(mergedGroups);
        setGroupOrder(mergedOrder);
        await markAsSynced(mergedGroups, mergedOrder);
      } else {
        // choice === "browser"
        // Empty-state guard: refuse to push an empty state (account-wipe invariant)
        if (Object.keys(groups).length === 0) {
          setSyncError("There are no tab groups in this browser to keep.");
          return;
        }

        const tabsPayload = groupsToTabs(groups, groupOrder);
        try {
          await syncTabs(tabsPayload);
        } catch (error) {
          setSyncStatus("conflict");
          setSyncLimitError(getSyncLimitErrorMessage(error));
          setSyncError(error instanceof Error ? error.message : "Sync failed");
          return;
        }

        if (loadGeneration.current !== generation || (await getAuthToken()) === null) {
          return;
        }

        await markAsSynced(groups, groupOrder);
      }

      await clearSyncPausedOverLimit();
      pendingApiState.current = null;
      setHasSyncConflict(false);
      setSyncLimitError(null);
      isAutoLoadBlocked.current = false;
      setLoadedFromApi(true);
      isLoadingFromApi.current = false;
      enableSync();
      setSyncStatus("idle");
      setSyncError(null);
      setIsOffline(false);
    },
    [groups, groupOrder],
  );

  const conflictLimitViolations = useMemo(() => {
    if (!hasSyncConflict || !pendingApiState.current) {
      return { browser: null, merge: null };
    }

    const merged = mergeTabGroups(pendingApiState.current, { groups, groupOrder });

    return {
      browser: findLimitViolation(groups, syncLimits),
      merge: findLimitViolation(merged.groups, syncLimits),
    };
  }, [hasSyncConflict, groups, groupOrder, syncLimits]);

  const conflictSummary = useMemo(() => {
    if (!hasSyncConflict || !pendingApiState.current) {
      return null;
    }

    return {
      account: summariseTabGroups(pendingApiState.current.groups),
      browser: summariseTabGroups(groups),
    };
  }, [hasSyncConflict, groups]);

  const saveGroup = useCallback(
    async (name: string, urls: string[]) => {
      try {
        const updatedGroups = { ...groups, [name]: urls };
        // Add to order if it's a new group
        const isNewGroup = !Object.hasOwn(groups, name);
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
    [groups, groupOrder],
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
            await setActiveGroupForWindow(winId, null).catch((error) =>
              console.warn("[useGroups] Failed to forget the window's active group:", error),
            );
          }
        }
        setSyncError(null);
      } catch (error) {
        setSyncStatus("error");
        setSyncError(error instanceof Error ? error.message : "Failed to delete group");
        throw error;
      }
    },
    [groups, groupOrder, activeGroupName],
  );

  /**
   * Imports groups from another extension's export, merged with or replacing the groups in local storage (read
   * fresh, as another context may have changed them since this one loaded). Returns why nothing was saved (no
   * importable groups, or the result would break the sync limits), or null once saved. Throws if the browser refuses the write.
   */
  const importGroups = useCallback(
    async (importedGroups: ImportedGroup[], mode: ImportMode): Promise<string | null> => {
      // Replacing with nothing would delete every group (and, signed in, the account's)
      if (!importedGroups.some((group) => group.skipReason === null)) {
        return "There are no groups to import.";
      }

      try {
        const updated = applyImport(await readStoredGroups(), importedGroups, mode);
        const limitViolation = findLimitViolation(updated.groups, syncLimits);
        if (limitViolation) {
          return limitViolation;
        }

        await browser.storage.local.set({
          [STORAGE_KEYS.TAB_GROUPS]: updated.groups,
          [STORAGE_KEYS.GROUP_ORDER]: updated.groupOrder,
        });
        setGroups(updated.groups);
        setGroupOrder(updated.groupOrder);

        // Replacing can remove the group loaded in this window
        if (activeGroupName !== null && !Object.hasOwn(updated.groups, activeGroupName)) {
          setActiveGroupNameState(null);
          const winId = windowIdRef.current;
          if (winId != null) {
            await setActiveGroupForWindow(winId, null).catch((error) =>
              console.warn("[useGroups] Failed to forget the window's active group:", error),
            );
          }
        }
        setSyncError(null);
        return null;
      } catch (error) {
        setSyncStatus("error");
        setSyncError(error instanceof Error ? error.message : "Failed to import groups");
        throw error;
      }
    },
    [syncLimits, activeGroupName],
  );

  const setActiveGroupName = useCallback(async (name: string | null) => {
    setActiveGroupNameState(name);
    const winId = windowIdRef.current;
    if (winId == null) return;

    if (name !== null) {
      await browser.storage.local.set({ [STORAGE_KEYS.STARTUP_GROUP]: name });
    }
    // Only the highlight depends on this, so a failure must not stop the group loading
    await setActiveGroupForWindow(winId, name).catch((error) => console.warn("[useGroups] Failed to save the window's active group:", error));
  }, []);

  const reorderGroups = useCallback(
    async (fromIndex: number, toIndex: number) => {
      if (fromIndex === toIndex) return;
      if (fromIndex < 0 || fromIndex >= groupOrder.length) return;
      if (toIndex < 0 || toIndex >= groupOrder.length) return;

      try {
        const updatedOrder = [...groupOrder];
        const [removed] = updatedOrder.splice(fromIndex, 1);
        if (removed === undefined) return;
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
    [groupOrder],
  );

  return {
    groups,
    groupOrder,
    activeGroupName,
    syncStatus,
    syncError,
    isOffline,
    hasSyncConflict,
    syncLimitError,
    conflictLimitViolations,
    conflictSummary,
    setActiveGroupName,
    saveGroup,
    deleteGroup,
    reorderGroups,
    importGroups,
    loadGroupsFromApi,
    resetLocalState,
    resolveSyncConflict,
    invalidateInFlightLoads,
    hasLoadedLocalState,
    hasLoadedAccount,
  };
}
