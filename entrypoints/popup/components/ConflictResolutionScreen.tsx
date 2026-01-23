import type { ConflictData } from "../hooks/useGroups";

interface ConflictResolutionScreenProps {
  conflict: ConflictData;
  onResolve: (choice: "discard" | "merge") => Promise<void>;
  isLoading: boolean;
}

export function ConflictResolutionScreen({
  conflict,
  onResolve,
  isLoading,
}: ConflictResolutionScreenProps) {
  const localCount = Object.keys(conflict.localGroups).length;
  const apiCount = Object.keys(conflict.apiGroups).length;

  return (
    <div className="conflict-screen">
      <h1>Sync Conflict</h1>
      <p className="conflict-description">
        You have <strong>{localCount}</strong> local tab group
        {localCount !== 1 ? "s" : ""} and <strong>{apiCount}</strong> synced
        group{apiCount !== 1 ? "s" : ""} from your account.
      </p>

      <div className="conflict-details">
        <div className="conflict-section">
          <h3>Local Groups</h3>
          <ul className="conflict-list">
            {Object.entries(conflict.localGroups).map(([name, urls]) => (
              <li key={name}>
                {name} ({urls.length} tabs)
              </li>
            ))}
          </ul>
        </div>

        <div className="conflict-section">
          <h3>Synced Groups</h3>
          <ul className="conflict-list">
            {Object.entries(conflict.apiGroups).map(([name, urls]) => (
              <li key={name}>
                {name} ({urls.length} tabs)
              </li>
            ))}
          </ul>
        </div>
      </div>

      <p className="conflict-note">
        Note: If both have a group with the same name, the synced version will
        be kept.
      </p>

      <div className="conflict-actions">
        <button
          onClick={() => onResolve("merge")}
          disabled={isLoading}
          className="submit-btn"
        >
          {isLoading ? "Merging..." : "Merge All Groups"}
        </button>
        <button
          onClick={() => onResolve("discard")}
          disabled={isLoading}
          className="discard-btn"
        >
          {isLoading ? "Discarding..." : "Discard Local Groups"}
        </button>
      </div>
    </div>
  );
}
