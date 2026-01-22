import {useEffect, useState} from 'react';
import './App.css';
import "@/assets/tailwind.css";

interface TabGroups {
  [name: string]: string[];
}

function App() {
  const [groups, setGroups] = useState<TabGroups>({});
  const [newGroupName, setNewGroupName] = useState('');
  const [activeGroupName, setActiveGroupName] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  // Load groups from storage when the popup opens
  useEffect(() => {
    browser.storage.local.get(['tabGroups', 'activeGroupName']).then((res) => {
      if (res.tabGroups) {
        setGroups(res.tabGroups as TabGroups);
      }
      if (res.activeGroupName) {
        setActiveGroupName(res.activeGroupName as string);
      }
    });
  }, []);

  const saveToStorage = async (updatedGroups: TabGroups) => {
    await browser.storage.local.set({tabGroups: updatedGroups});
    setGroups(updatedGroups);
  };

  const saveCurrentPinned = async (name: string) => {
    let nameToSave = name.trim();
    if (!nameToSave) {
      setWarning('Please enter a group name');
      return;
    }

    const pinnedTabs = await browser.tabs.query({pinned: true});
    if (pinnedTabs.length === 0) {
      setWarning('Please add some pinned tabs before saving');
      return;
    }
    const urls = pinnedTabs.map((tab) => tab.url).filter(Boolean) as string[];

    const updatedGroups = {...groups, [nameToSave]: urls};

    // Batch storage updates
    await browser.storage.local.set({
      tabGroups: updatedGroups,
      activeGroupName: nameToSave
    });

    setGroups(updatedGroups);
    setActiveGroupName(nameToSave);
    setNewGroupName('');
    setWarning(null);
    console.log('Saved group:', nameToSave, urls);
  };

  const loadGroup = async (name: string) => {
    const urls = groups[name];
    if (!urls || urls.length === 0) return;

    // Get current pinned tabs
    const currentPinned = await browser.tabs.query({pinned: true});
    const currentIds = currentPinned
      .map((tab) => tab.id)
      .filter((id): id is number => id !== undefined);

    // Open the new pinned tabs first to avoid closing the window
    // if all current tabs are pinned and being removed
    for (const url of urls) {
      await browser.tabs.create({url, pinned: true, active: false});
    }

    // Now safe to remove the old pinned tabs
    if (currentIds.length > 0) {
      await browser.tabs.remove(currentIds);
    }

    setActiveGroupName(name);
    await browser.storage.local.set({activeGroupName: name});
  };

  const deleteGroup = async (name: string) => {
    if (!confirm(`Are you sure you want to delete the group "${name}"?`)) {
      return;
    }

    const updatedGroups = {...groups};
    delete updatedGroups[name];

    const storageUpdates: any = {tabGroups: updatedGroups};
    if (activeGroupName === name) {
      storageUpdates.activeGroupName = null;
    }

    await browser.storage.local.set(storageUpdates);
    setGroups(updatedGroups);

    if (activeGroupName === name) {
      setActiveGroupName(null);
    }
  };

  return (
    <div className="container">
      <h1>Pinned Tab Manager</h1>

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
              <li key={name} className={activeGroupName === name ? 'active' : ''}>
                <div className="group-info">
                  <span className="group-name">{name}</span>
                  <span className="group-count">({urls.length} tabs)</span>
                </div>
                <div className="group-actions">
                  <button onClick={() => loadGroup(name)} className="load-btn">
                    Load
                  </button>
                  <button onClick={() => deleteGroup(name)} className="delete-btn">
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
    </div>
  );
}

export default App;
