import type { User } from "@/lib/types";

type SyncStatus = "idle" | "syncing" | "error";

interface HeaderProps {
  user: User;
  onLogout: () => void;
  syncStatus: SyncStatus;
  syncError: string | null;
}

export function Header({ user, onLogout, syncStatus, syncError }: HeaderProps) {
  const getSyncIndicator = () => {
    switch (syncStatus) {
      case "syncing":
        return <span className="sync-indicator syncing">Syncing...</span>;
      case "error":
        return (
          <span className="sync-indicator error" title={syncError || "Sync error"}>
            Sync error
          </span>
        );
      default:
        return <span className="sync-indicator idle">Synced</span>;
    }
  };

  return (
    <header className="app-header">
      <div className="header-left">
        <span className="user-email" title={user.email}>
          {user.email}
        </span>
        {getSyncIndicator()}
      </div>
      <button onClick={onLogout} className="logout-btn">
        Logout
      </button>
    </header>
  );
}
