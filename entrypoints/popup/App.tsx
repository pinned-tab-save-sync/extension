import { useEffect, useState } from "react";
import "@/assets/tailwind.css";
import { useAuth } from "./hooks/useAuth";
import { useGroups } from "./hooks/useGroups";
import { useSyncLimits } from "./hooks/useSyncLimits";
import { usePinnedTabs } from "./hooks/usePinnedTabs";
import { useDensity } from "./hooks/useDensity";
import { useTheme } from "./hooks/useTheme";
import { Footer } from "./components/Footer";
import { GroupRowContent } from "./components/GroupRowContent";
import { PopupHeader } from "./components/PopupHeader";
import { SaveBar } from "./components/SaveBar";
import { SettingsScreen } from "./components/SettingsScreen";
import { SyncConflictPrompt } from "./components/SyncConflictPrompt";
import { SyncLimitNotice } from "./components/SyncLimitNotice";
import { SortableGroupList } from "./components/SortableGroupList";
import { SortableGroupItem } from "./components/SortableGroupItem";
import { IS_LOCAL_ONLY } from "@/lib/buildMode";
import { clearAuthToken, clearStoredUser, getAuthToken } from "@/lib/storage/auth";
import { deleteAllLocalData } from "@/lib/localData";
import { replacePinnedTabs } from "@/lib/tabs";
import { checkSaveAgainstLimits, findMatchingGroupName } from "@/lib/limits";
import { trimGroupName, validateGroupName } from "@/lib/groupName";
import { toSyncableTabUrl } from "@/lib/tabUrl";
import type { SyncConflictChoice } from "@/lib/types";

/** The reason a browser gave for refusing a storage write, for showing to the user. */
function describeError(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "the browser did not say why";
}

function App() {
  const {
    user,
    isAuthenticated,
    isLoading: authLoading,
    justLoggedIn,
    openLogin,
    openRegister,
    logout,
    logoutAndDeleteAllLocalData,
    clearJustLoggedIn,
  } = useAuth();

  // Limits only apply while signed in; logged out (local only) is unlimited
  const syncLimits = useSyncLimits(user, isAuthenticated);

  const {
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
    loadGroupsFromApi,
    resetLocalState,
    resolveSyncConflict,
    invalidateInFlightLoads,
  } = useGroups(isAuthenticated, syncLimits);

  const { theme, setTheme, resetTheme, isDark } = useTheme();
  const { density, setDensity, resetDensity } = useDensity();
  const pinnedTabs = usePinnedTabs();

  const [newGroupName, setNewGroupName] = useState("");
  const [warning, setWarning] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [isLoadingGroup, setIsLoadingGroup] = useState(false);
  // Group awaiting an inline delete confirmation (window.confirm() does not work in Firefox popups)
  const [groupPendingDelete, setGroupPendingDelete] = useState<string | null>(null);
  // Whether the conflict resolution is in progress
  const [isResolvingConflict, setIsResolvingConflict] = useState(false);

  useEffect(() => {
    console.log("[App] Auth state changed:", { isAuthenticated, justLoggedIn });
    if (isAuthenticated && justLoggedIn) {
      clearJustLoggedIn();
    }
  }, [isAuthenticated, justLoggedIn, clearJustLoggedIn]);

  /** Saves the window's pinned tabs as the named group; false when a warning stopped the save. */
  const saveCurrentPinned = async (name: string): Promise<boolean> => {
    const trimmedName = trimGroupName(name);
    // A name the API treats as the same group ("work" for "Work") updates that group rather than adding a duplicate
    const existingName = findMatchingGroupName(groups, trimmedName);
    // Only a new name is checked, so a group saved before the rule existed can still be updated
    const nameError = existingName === null ? validateGroupName(trimmedName) : null;
    if (nameError) {
      setWarning(nameError);
      return false;
    }
    const nameToSave = existingName ?? trimmedName;

    const pinnedTabs = await browser.tabs.query({ pinned: true, currentWindow: true });
    if (pinnedTabs.length === 0) {
      setWarning("Please add some pinned tabs before saving");
      return false;
    }
    const pinnedUrls = pinnedTabs.map((tab) => tab.url).filter(Boolean) as string[];
    // Only web addresses and browser pages are saved (not e.g. data: or blob: tabs), written so the API accepts them
    // unchanged: browsers leave characters such as `|` unencoded, which the API refuses, failing every sync
    const urls = pinnedUrls.map(toSyncableTabUrl).filter((url): url is string => url !== null);
    const leftOutCount = pinnedUrls.length - urls.length;
    if (urls.length === 0) {
      setWarning("None of this window's pinned tabs can be saved: only web addresses and browser pages can be");
      return false;
    }

    const limitWarning = checkSaveAgainstLimits(groups, nameToSave, urls.length, syncLimits);
    if (limitWarning) {
      setWarning(limitWarning);
      return false;
    }

    try {
      await saveGroup(nameToSave, urls);
      await setActiveGroupName(nameToSave);
    } catch (error) {
      // The browser refused the write (e.g. its storage is full); say why, as nothing else shows it when signed out
      setWarning(`Could not save "${nameToSave}": ${describeError(error)}`);
      return false;
    }
    setNewGroupName("");
    setWarning(
      leftOutCount > 0
        ? `${leftOutCount} pinned ${leftOutCount === 1 ? "tab was" : "tabs were"} left out: only web addresses and browser pages can be saved`
        : null,
    );
    return true;
  };

  const loadGroup = async (name: string) => {
    const urls = groups[name];
    if (!urls || urls.length === 0) return;

    const previousActiveGroupName = activeGroupName;

    // Set active group name FIRST, before any tab operations
    // This ensures the value is persisted even if the popup closes during tab manipulation
    await setActiveGroupName(name);

    setIsLoadingGroup(true);
    try {
      const currentWindow = await browser.windows.getCurrent();
      const currentPinned = await browser.tabs.query({ pinned: true, windowId: currentWindow.id });
      const currentIds = currentPinned.map((tab) => tab.id).filter((id): id is number => id !== undefined);

      // Browsers refuse to open some internal pages (e.g. about:addons) - restore the rest regardless
      const failedCount = await replacePinnedTabs(urls, currentWindow.id, currentIds);

      if (failedCount === urls.length) {
        // Nothing opened, so the window still has its old tabs
        await setActiveGroupName(previousActiveGroupName);
        setWarning(`None of the tabs in "${name}" could be opened by this browser`);
      } else if (failedCount > 0) {
        setWarning(`${failedCount} of ${urls.length} tabs could not be opened by the browser`);
      }
    } catch (error) {
      setWarning(error instanceof Error ? error.message : "Failed to load group");
    } finally {
      setIsLoadingGroup(false);
    }
  };

  const confirmDeleteGroup = async (name: string) => {
    setGroupPendingDelete(null);
    try {
      await deleteGroup(name);
    } catch (error) {
      setWarning(`Could not delete "${name}": ${describeError(error)}`);
    }
  };

  const handleReorderGroups = async (fromIndex: number, toIndex: number) => {
    try {
      await reorderGroups(fromIndex, toIndex);
    } catch (error) {
      setWarning(`Could not save the new order: ${describeError(error)}`);
    }
  };

  /**
   * Invalidates any in-flight API load first (synchronously), then runs the
   * standard logout flow. Keeps local tab groups intact.
   */
  const handleLogout = async () => {
    invalidateInFlightLoads();
    await logout();
  };

  /** Deletes all local data, choosing the right flow based on whether a token is stored. */
  const handleDeleteAllLocalData = async () => {
    // Bump the generation FIRST so any in-flight API load is immediately invalidated.
    // The synchronous generation check in guardedStorageWrite then closes the race
    // window before the async wipe begins.
    invalidateInFlightLoads();
    if (IS_LOCAL_ONLY) {
      // A token left behind by a sync build is only removed here; there is no session to end
      await clearAuthToken();
      await clearStoredUser();
    }
    const token = await getAuthToken();
    if (token !== null) {
      await logoutAndDeleteAllLocalData();
    } else {
      await deleteAllLocalData();
    }
    resetLocalState();
    resetTheme();
    resetDensity();
    setNewGroupName("");
    setWarning(null);
    setGroupPendingDelete(null);
    setShowSettings(false);
  };

  const handleResolveConflict = async (choice: SyncConflictChoice) => {
    setIsResolvingConflict(true);
    try {
      await resolveSyncConflict(choice);
    } finally {
      setIsResolvingConflict(false);
    }
  };

  if (authLoading) {
    return (
      <div className="flex min-h-[200px] w-full items-center justify-center text-sm text-muted-foreground">
        <p>Loading...</p>
      </div>
    );
  }

  if (showSettings) {
    return (
      <SettingsScreen
        user={user}
        isAuthenticated={isAuthenticated}
        onBack={() => setShowSettings(false)}
        onDeleteAllLocalData={handleDeleteAllLocalData}
        theme={theme}
        onThemeChange={setTheme}
        density={density}
        onDensityChange={setDensity}
      />
    );
  }

  // Signed in with known limits, the count is shown against the group limit
  const groupCountLabel = syncLimits ? `${groupOrder.length} of ${syncLimits.max_groups}` : String(groupOrder.length);

  return (
    <div className="flex max-h-[600px] min-h-[200px] w-full flex-col">
      <PopupHeader
        isDark={isDark}
        isAuthenticated={isAuthenticated}
        syncStatus={syncStatus}
        syncError={syncError}
        isOffline={isOffline}
        onRetrySync={loadGroupsFromApi}
        onOpenSettings={() => setShowSettings(true)}
      />

      {hasSyncConflict && user ? (
        <SyncConflictPrompt
          accountEmail={user.email}
          isResolving={isResolvingConflict}
          summary={conflictSummary}
          localHasGroups={Object.keys(groups).length > 0}
          browserLimitViolation={conflictLimitViolations.browser}
          mergeLimitViolation={conflictLimitViolations.merge}
          error={syncError}
          onChoose={handleResolveConflict}
        />
      ) : (
        <>
          <SaveBar
            pinnedTabs={pinnedTabs}
            groupName={newGroupName}
            onGroupNameChange={(name) => {
              setNewGroupName(name);
              setWarning(null);
            }}
            onSave={() => {
              setWarning(null);
              saveCurrentPinned(newGroupName);
            }}
            warning={warning}
          />

          {syncStatus === "overLimit" && syncLimitError && <SyncLimitNotice message={syncLimitError} />}

          <div className="flex shrink-0 items-baseline justify-between px-5 pt-1 pb-1.5 compact:pt-[5px] compact:pb-1">
            <h2 className="text-[13px] font-semibold tracking-[0.02em]">Saved groups</h2>
            {groupOrder.length > 0 && <span className="text-xs text-muted-foreground">{groupCountLabel}</span>}
          </div>

          {groupOrder.length === 0 ? (
            <p className="px-5 pb-4 text-sm text-muted-foreground">No saved groups yet. Pin some tabs, name them above and save.</p>
          ) : (
            <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-2 pb-2">
              <SortableGroupList groupOrder={groupOrder} onReorder={handleReorderGroups}>
                {groupOrder.map((name, index) => {
                  const urls = groups[name];
                  if (!urls) return null;
                  const isActive = activeGroupName === name;
                  const isConfirmingDelete = groupPendingDelete === name;
                  const nextName = groupOrder[index + 1];
                  // Highlighted rows have their own border, so no divider next to one
                  const isHighlighted = (groupName: string) => groupName === activeGroupName || groupName === groupPendingDelete;
                  const hasDivider = nextName !== undefined && !isHighlighted(name) && !isHighlighted(nextName);
                  return (
                    <SortableGroupItem key={name} id={name} isActive={isActive} isConfirmingDelete={isConfirmingDelete} hasDivider={hasDivider}>
                      <GroupRowContent
                        name={name}
                        tabCount={urls.length}
                        isActive={isActive}
                        isConfirmingDelete={isConfirmingDelete}
                        isBusy={isLoadingGroup}
                        onOpen={() => loadGroup(name)}
                        onUpdate={() => {
                          setWarning(null);
                          return saveCurrentPinned(name);
                        }}
                        onRequestDelete={() => setGroupPendingDelete(name)}
                        onCancelDelete={() => setGroupPendingDelete(null)}
                        onConfirmDelete={() => confirmDeleteGroup(name)}
                      />
                    </SortableGroupItem>
                  );
                })}
              </SortableGroupList>
            </div>
          )}
        </>
      )}

      {!IS_LOCAL_ONLY && (
        <Footer user={user} isAuthenticated={isAuthenticated} onLogout={handleLogout} onSignIn={openLogin} onRegister={openRegister} />
      )}
    </div>
  );
}

export default App;
