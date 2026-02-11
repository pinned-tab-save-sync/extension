import { useEffect, useState } from "react";
import "@/assets/tailwind.css";
import { useAuth } from "./hooks/useAuth";
import { useGroups } from "./hooks/useGroups";
import { useTheme } from "./hooks/useTheme";
import { AuthScreen } from "./components/AuthScreen";
import { Header } from "./components/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SortableGroupList } from "./components/SortableGroupList";
import { SortableGroupItem } from "./components/SortableGroupItem";
import { ThemeToggle } from "./components/ThemeToggle";

function App() {
  const { user, isAuthenticated, isLoading: authLoading, justLoggedIn, openLogin, openRegister, logout, clearJustLoggedIn } = useAuth();

  const {
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
  } = useGroups(isAuthenticated);

  const { theme, setTheme, isDark } = useTheme();

  const [newGroupName, setNewGroupName] = useState("");
  const [warning, setWarning] = useState<string | null>(null);
  const [showAuthScreen, setShowAuthScreen] = useState(false);
  const [isLoadingGroup, setIsLoadingGroup] = useState(false);

  // Hide auth screen when user becomes authenticated
  useEffect(() => {
    console.log("[App] Auth state changed:", { isAuthenticated, justLoggedIn });
    if (isAuthenticated) {
      setShowAuthScreen(false);
      if (justLoggedIn) {
        clearJustLoggedIn();
      }
    }
  }, [isAuthenticated, justLoggedIn, clearJustLoggedIn]);

  const saveCurrentPinned = async (name: string) => {
    const nameToSave = name.trim();
    if (!nameToSave) {
      setWarning("Please enter a group name");
      return;
    }

    const pinnedTabs = await browser.tabs.query({ pinned: true, currentWindow: true });
    if (pinnedTabs.length === 0) {
      setWarning("Please add some pinned tabs before saving");
      return;
    }
    const urls = pinnedTabs.map((tab) => tab.url).filter(Boolean) as string[];

    await saveGroup(nameToSave, urls);
    await setActiveGroupName(nameToSave);
    setNewGroupName("");
    setWarning(null);
  };

  const loadGroup = async (name: string) => {
    const urls = groups[name];
    if (!urls || urls.length === 0) return;

    // Set active group name FIRST, before any tab operations
    // This ensures the value is persisted even if the popup closes during tab manipulation
    await setActiveGroupName(name);

    setIsLoadingGroup(true);
    try {
      const currentWindow = await browser.windows.getCurrent();
      const currentPinned = await browser.tabs.query({ pinned: true, windowId: currentWindow.id });
      const currentIds = currentPinned.map((tab) => tab.id).filter((id): id is number => id !== undefined);

      await Promise.all(urls.map((url) => browser.tabs.create({ url, pinned: true, active: false, windowId: currentWindow.id })));

      if (currentIds.length > 0) {
        await browser.tabs.remove(currentIds);
      }
    } catch (error) {
      setWarning(error instanceof Error ? error.message : "Failed to load group");
    } finally {
      setIsLoadingGroup(false);
    }
  };

  const handleDeleteGroup = async (name: string) => {
    if (!confirm(`Are you sure you want to delete the group "${name}"?`)) {
      return;
    }
    await deleteGroup(name);
  };

  if (authLoading) {
    return (
      <div className={isDark ? "dark" : ""}>
        <div className="min-w-[550px] min-h-[200px] p-4 flex items-center justify-center bg-white dark:bg-[#242424] text-gray-900 dark:text-white/85">
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  if (showAuthScreen && !isAuthenticated) {
    return (
      <AuthScreen
        onOpenLogin={openLogin}
        onOpenRegister={openRegister}
        onCancel={() => setShowAuthScreen(false)}
        isDark={isDark}
        theme={theme}
        onThemeChange={setTheme}
      />
    );
  }

  return (
    <div className={isDark ? "dark" : ""}>
      <div className="min-w-[550px] min-h-[200px] p-4 font-sans text-gray-900 dark:text-white/85 bg-white dark:bg-[#242424]">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl leading-none">Pinned Tab Save & Sync</h1>
          <ThemeToggle theme={theme} onThemeChange={setTheme} />
        </div>

        <div className="flex gap-2 mb-6 items-start">
          <div className="flex-1 flex flex-col">
            <Input
              type="text"
              value={newGroupName}
              onChange={(e) => {
                setNewGroupName(e.target.value);
                setWarning(null);
              }}
              placeholder="Group name..."
            />
            <div className="min-h-6">{warning && <p className="text-red-500 text-xs mt-1 text-left">{warning}</p>}</div>
          </div>
          <Button
            variant="success"
            onClick={() => {
              setWarning(null);
              saveCurrentPinned(newGroupName);
            }}
          >
            Save
          </Button>
        </div>

        <div>
          <h2 className="text-lg text-left">Saved Groups</h2>
          {groupOrder.length === 0 ? (
            <p>No saved groups yet.</p>
          ) : (
            <SortableGroupList groupOrder={groupOrder} onReorder={reorderGroups}>
              {groupOrder.map((name) => {
                const urls = groups[name];
                if (!urls) return null;
                return (
                  <SortableGroupItem key={name} id={name} isActive={activeGroupName === name}>
                    <div className="flex flex-col items-start flex-1 overflow-hidden">
                      <span className="font-semibold whitespace-nowrap overflow-hidden text-ellipsis w-full">{name}</span>
                      <span className="text-sm text-gray-500 dark:text-gray-400">({urls.length} tabs)</span>
                    </div>
                    <div className="flex gap-1">
                      {activeGroupName === name && (
                        <Button
                          variant="success"
                          size="lg"
                          onClick={() => {
                            setWarning(null);
                            saveCurrentPinned(name);
                          }}
                          disabled={isLoadingGroup}
                        >
                          Update
                        </Button>
                      )}
                      <Button variant="secondary" size="lg" onClick={() => loadGroup(name)} disabled={isLoadingGroup}>
                        Load
                      </Button>
                      <Button variant="destructive" size="lg" onClick={() => handleDeleteGroup(name)} disabled={isLoadingGroup} aria-label="Delete">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                          <path
                            fillRule="evenodd"
                            d="M16.5 4.478v.227a48.816 48.816 0 0 1 3.878.512.75.75 0 1 1-.256 1.478l-.209-.035-1.005 13.07a3 3 0 0 1-2.991 2.77H8.084a3 3 0 0 1-2.991-2.77L4.087 6.66l-.209.035a.75.75 0 0 1-.256-1.478A48.567 48.567 0 0 1 7.5 4.705v-.227c0-1.564 1.213-2.9 2.816-2.951a52.662 52.662 0 0 1 3.369 0c1.603.051 2.815 1.387 2.815 2.951Zm-6.136-1.452a51.196 51.196 0 0 1 3.273 0C14.39 3.05 15 3.684 15 4.478v.113a49.488 49.488 0 0 0-6 0v-.113c0-.794.609-1.428 1.364-1.452Zm-.355 5.945a.75.75 0 1 0-1.5.058l.347 9a.75.75 0 1 0 1.499-.058l-.346-9Zm5.48.058a.75.75 0 1 0-1.498-.058l-.347 9a.75.75 0 0 0 1.5.058l.345-9Z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </Button>
                    </div>
                  </SortableGroupItem>
                );
              })}
            </SortableGroupList>
          )}
        </div>

        {isAuthenticated && user ? (
          <Header user={user} onLogout={logout} syncStatus={syncStatus} syncError={syncError} isOffline={isOffline} onRetry={loadGroupsFromApi} />
        ) : (
          <div className="mt-6 pt-4 border-t border-gray-300 dark:border-gray-600 text-center">
            <Button variant="ghost" onClick={() => setShowAuthScreen(true)}>
              Sign up to sync across browsers
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
