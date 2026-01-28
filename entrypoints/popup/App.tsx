import { useEffect, useState } from "react";
import "@/assets/tailwind.css";
import { useAuth } from "./hooks/useAuth";
import { useGroups } from "./hooks/useGroups";
import { AuthScreen } from "./components/AuthScreen";
import { ConflictResolutionScreen } from "./components/ConflictResolutionScreen";
import { Header } from "./components/Header";
import { Button } from "./components/ui/Button";

function App() {
  const {
    user,
    isAuthenticated,
    isLoading: authLoading,
    justLoggedIn,
    openLogin,
    openRegister,
    logout,
    clearJustLoggedIn,
  } = useAuth();

  const {
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
  } = useGroups(isAuthenticated);

  const [newGroupName, setNewGroupName] = useState("");
  const [warning, setWarning] = useState<string | null>(null);
  const [showAuthScreen, setShowAuthScreen] = useState(false);
  const [isLoadingGroup, setIsLoadingGroup] = useState(false);

  // Load groups from API only when user just logged in (not on extension reopen)
  useEffect(() => {
    if (isAuthenticated && justLoggedIn) {
      loadGroupsFromApi();
      setShowAuthScreen(false);
      clearJustLoggedIn();
    }
  }, [isAuthenticated, justLoggedIn, loadGroupsFromApi, clearJustLoggedIn]);

  const saveCurrentPinned = async (name: string) => {
    const nameToSave = name.trim();
    if (!nameToSave) {
      setWarning("Please enter a group name");
      return;
    }

    const pinnedTabs = await browser.tabs.query({ pinned: true });
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

    setIsLoadingGroup(true);
    try {
      const currentPinned = await browser.tabs.query({ pinned: true });
      const currentIds = currentPinned
        .map((tab) => tab.id)
        .filter((id): id is number => id !== undefined);

      await Promise.all(
        urls.map((url) => browser.tabs.create({ url, pinned: true, active: false }))
      );

      if (currentIds.length > 0) {
        await browser.tabs.remove(currentIds);
      }

      await setActiveGroupName(name);
    } catch (error) {
      setWarning(
        error instanceof Error ? error.message : "Failed to load group"
      );
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
      <div className="min-w-[350px] min-h-[200px] p-4 flex items-center justify-center">
        <p>Loading...</p>
      </div>
    );
  }

  if (showAuthScreen && !isAuthenticated) {
    return (
      <AuthScreen
        onOpenLogin={openLogin}
        onOpenRegister={openRegister}
        onCancel={() => setShowAuthScreen(false)}
      />
    );
  }

  if (pendingConflict) {
    return (
      <ConflictResolutionScreen
        conflict={pendingConflict}
        onResolve={resolveConflict}
        isLoading={syncStatus === "syncing"}
      />
    );
  }

  return (
    <div className="min-w-[350px] min-h-[200px] p-4 font-sans text-white/85 bg-[#242424]">
      {isAuthenticated && user ? (
        <Header
          user={user}
          onLogout={logout}
          syncStatus={syncStatus}
          syncError={syncError}
        />
      ) : null}

      <h1 className="text-4xl leading-none mb-6">Pinned Tab Save & Sync</h1>

      <div className="flex gap-2 mb-6 items-start">
        <div className="flex-1 flex flex-col">
          <input
            type="text"
            value={newGroupName}
            onChange={(e) => {
              setNewGroupName(e.target.value);
              setWarning(null);
            }}
            placeholder="Group name..."
            className="w-full p-2 rounded border border-gray-300 bg-gray-100 text-gray-800 box-border"
          />
          <div className="min-h-6">
            {warning && <p className="text-red-500 text-xs mt-1 text-left">{warning}</p>}
          </div>
        </div>
        <Button
          variant="success"
          onClick={() => {
            setWarning(null);
            saveCurrentPinned(newGroupName);
          }}
          className="px-3 py-2"
        >
          Save
        </Button>
      </div>

      <div>
        <h2 className="text-lg text-left">Saved Groups</h2>
        {Object.keys(groups).length === 0 ? (
          <p>No saved groups yet.</p>
        ) : (
          <ul className="list-none p-0 m-0">
            {Object.entries(groups).map(([name, urls]) => (
              <li
                key={name}
                className={`flex justify-between items-center p-3 border-b border-gray-700 gap-2 ${
                  activeGroupName === name ? "bg-indigo-500/10 rounded" : ""
                }`}
              >
                <div className="flex flex-col items-start flex-1 overflow-hidden">
                  <span className="font-semibold whitespace-nowrap overflow-hidden text-ellipsis w-full">{name}</span>
                  <span className="text-sm text-gray-400">({urls.length} tabs)</span>
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="primary"
                    onClick={() => loadGroup(name)}
                    disabled={isLoadingGroup}
                  >
                    {isLoadingGroup ? "Loading..." : "Load"}
                  </Button>
                  <Button
                    variant="danger"
                    onClick={() => handleDeleteGroup(name)}
                    disabled={isLoadingGroup}
                  >
                    Delete
                  </Button>
                  {activeGroupName === name && (
                    <Button
                      variant="success"
                      onClick={() => {
                        setWarning(null);
                        saveCurrentPinned(name);
                      }}
                      disabled={isLoadingGroup}
                    >
                      Save
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {!isAuthenticated && (
        <div className="mt-6 pt-4 border-t border-gray-600 text-center">
          <Button variant="ghost" onClick={() => setShowAuthScreen(true)}>
            Sign up to sync across browsers
          </Button>
        </div>
      )}
    </div>
  );
}

export default App;
