import { useEffect, useState } from "react";
import "./App.css";
import "@/assets/tailwind.css";
import { useAuth } from "./hooks/useAuth";
import { useGroups } from "./hooks/useGroups";
import { AuthScreen } from "./components/AuthScreen";
import { Header } from "./components/Header";

function App() {
  const {
    user,
    isAuthenticated,
    isLoading: authLoading,
    error: authError,
    validationErrors,
    login,
    register,
    logout,
    clearError,
  } = useAuth();

  const {
    groups,
    activeGroupName,
    syncStatus,
    syncError,
    setActiveGroupName,
    saveGroup,
    deleteGroup,
    loadGroupsFromApi,
  } = useGroups(isAuthenticated);

  const [newGroupName, setNewGroupName] = useState("");
  const [warning, setWarning] = useState<string | null>(null);
  const [showAuthScreen, setShowAuthScreen] = useState(false);

  // Load groups from API when user authenticates
  useEffect(() => {
    if (isAuthenticated) {
      loadGroupsFromApi();
      setShowAuthScreen(false);
    }
  }, [isAuthenticated, loadGroupsFromApi]);

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

    const currentPinned = await browser.tabs.query({ pinned: true });
    const currentIds = currentPinned
      .map((tab) => tab.id)
      .filter((id): id is number => id !== undefined);

    for (const url of urls) {
      await browser.tabs.create({ url, pinned: true, active: false });
    }

    if (currentIds.length > 0) {
      await browser.tabs.remove(currentIds);
    }

    await setActiveGroupName(name);
  };

  const handleDeleteGroup = async (name: string) => {
    if (!confirm(`Are you sure you want to delete the group "${name}"?`)) {
      return;
    }
    await deleteGroup(name);
  };

  if (authLoading) {
    return (
      <div className="container loading">
        <p>Loading...</p>
      </div>
    );
  }

  if (showAuthScreen && !isAuthenticated) {
    return (
      <AuthScreen
        onLogin={login}
        onRegister={register}
        isLoading={authLoading}
        error={authError}
        validationErrors={validationErrors}
        onClearError={clearError}
        onCancel={() => setShowAuthScreen(false)}
      />
    );
  }

  return (
    <div className="container">
      {isAuthenticated && user ? (
        <Header
          user={user}
          onLogout={logout}
          syncStatus={syncStatus}
          syncError={syncError}
        />
      ) : null}

      <h1>Pinned Tab Save & Sync</h1>

      <div className="save-section">
        <div className="input-group">
          <input
            type="text"
            value={newGroupName}
            onChange={(e) => {
              setNewGroupName(e.target.value);
              setWarning(null);
            }}
            placeholder="Group name..."
          />
          <div className="warning-container">
            {warning && <p className="warning-text">{warning}</p>}
          </div>
        </div>
        <button
          onClick={() => {
            setWarning(null);
            saveCurrentPinned(newGroupName);
          }}
          className="save-btn"
        >
          Save
        </button>
      </div>

      <div className="groups-section">
        <h2>Saved Groups</h2>
        {Object.keys(groups).length === 0 ? (
          <p>No saved groups yet.</p>
        ) : (
          <ul className="groups-list">
            {Object.entries(groups).map(([name, urls]) => (
              <li
                key={name}
                className={activeGroupName === name ? "active" : ""}
              >
                <div className="group-info">
                  <span className="group-name">{name}</span>
                  <span className="group-count">({urls.length} tabs)</span>
                </div>
                <div className="group-actions">
                  <button onClick={() => loadGroup(name)} className="load-btn">
                    Load
                  </button>
                  <button
                    onClick={() => handleDeleteGroup(name)}
                    className="delete-btn"
                  >
                    Delete
                  </button>
                  {activeGroupName === name && (
                    <button
                      onClick={() => {
                        setWarning(null);
                        saveCurrentPinned(name);
                      }}
                      className="save-btn"
                    >
                      Save
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {!isAuthenticated && (
        <div className="sync-promo">
          <button
            onClick={() => setShowAuthScreen(true)}
            className="link-btn sync-link"
          >
            Sign up to sync across browsers
          </button>
        </div>
      )}
    </div>
  );
}

export default App;
