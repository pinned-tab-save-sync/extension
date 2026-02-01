import type { User, SyncStatus } from "@/lib/types";
import { Button } from "./ui/Button";

interface HeaderProps {
  user: User;
  onLogout: () => void;
  syncStatus: SyncStatus;
  syncError: string | null;
  isOffline: boolean;
  onRetry: () => void;
}

export function Header({
  user,
  onLogout,
  syncStatus,
  syncError,
  isOffline,
  onRetry,
}: HeaderProps) {
  const getSyncIndicator = () => {
    if (syncStatus === "syncing") {
      return <span className="text-xs text-yellow-600 dark:text-yellow-500">Syncing...</span>;
    }

    if (syncStatus === "error" || isOffline) {
      return (
        <div className="flex items-center gap-2">
          <span
            className="text-xs text-orange-500 dark:text-orange-400"
            title={syncError || "Offline"}
          >
            Offline
          </span>
          <button
            onClick={onRetry}
            className="text-xs text-blue-500 dark:text-blue-400 hover:text-blue-600 dark:hover:text-blue-300 hover:underline"
          >
            Retry
          </button>
        </div>
      );
    }

    return <span className="text-xs text-green-600 dark:text-green-500">Synced</span>;
  };

  return (
    <header className="flex justify-between items-center pt-3 mt-3 border-t border-gray-300 dark:border-gray-600">
      <div className="flex flex-col gap-1 overflow-hidden">
        <span
          className="text-sm font-medium whitespace-nowrap overflow-hidden text-ellipsis max-w-[200px]"
          title={user.email}
        >
          {user.email}
        </span>
        {getSyncIndicator()}
      </div>
      <Button variant="outline" onClick={onLogout}>
        Logout
      </Button>
    </header>
  );
}
