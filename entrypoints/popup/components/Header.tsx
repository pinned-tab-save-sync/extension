import type { User, SyncStatus } from "@/lib/types";
import { Button } from "./ui/Button";

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
        return <span className="text-xs text-yellow-500">Syncing...</span>;
      case "error":
        return (
          <span className="text-xs text-red-500" title={syncError || "Sync error"}>
            Sync error
          </span>
        );
      default:
        return <span className="text-xs text-green-500">Synced</span>;
    }
  };

  return (
    <header className="flex justify-between items-center pb-3 mb-3 border-b border-gray-600">
      <div className="flex flex-col gap-1 overflow-hidden">
        <span className="text-sm font-medium whitespace-nowrap overflow-hidden text-ellipsis max-w-[200px]" title={user.email}>
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
