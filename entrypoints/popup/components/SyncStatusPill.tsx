import { Check, Laptop, LoaderCircle, Pause, RotateCw } from "lucide-react";
import type { SyncStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

interface SyncStatusPillProps {
  isAuthenticated: boolean;
  syncStatus: SyncStatus;
  syncError: string | null;
  isOffline: boolean;
  onRetry: () => void;
}

const pillClasses =
  "inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs compact:h-6 compact:px-2 font-semibold whitespace-nowrap [&_svg]:size-3.5 [&_svg]:shrink-0";

/** Header pill showing where the groups are kept and how sync is doing; a failed sync can be retried from it. */
export function SyncStatusPill({ isAuthenticated, syncStatus, syncError, isOffline, onRetry }: SyncStatusPillProps) {
  if (!isAuthenticated) {
    return (
      <span className={cn(pillClasses, "bg-secondary text-muted-foreground")}>
        <Laptop aria-hidden="true" />
        This browser only
      </span>
    );
  }

  if (syncStatus === "syncing") {
    return (
      <span className={cn(pillClasses, "bg-secondary text-muted-foreground")} role="status">
        <LoaderCircle aria-hidden="true" className="animate-spin" />
        Syncing...
      </span>
    );
  }

  if (syncStatus === "conflict" || syncStatus === "overLimit") {
    return (
      <span className={cn(pillClasses, "bg-warning-soft text-warning-soft-foreground")}>
        <Pause aria-hidden="true" />
        Sync paused
      </span>
    );
  }

  if (syncStatus === "error" || isOffline) {
    // Only a genuine connection failure is "Offline" - a rejected sync is a server-side error
    const label = isOffline ? "Offline" : "Sync failed";

    return (
      <button
        type="button"
        onClick={onRetry}
        title={syncError || label}
        aria-label={`${label}. Retry sync`}
        className={cn(pillClasses, "cursor-pointer bg-warning-soft text-warning-soft-foreground hover:brightness-95 dark:hover:brightness-125")}
      >
        <RotateCw aria-hidden="true" />
        {label} - Retry
      </button>
    );
  }

  return (
    <span className={cn(pillClasses, "bg-success-soft text-success-soft-foreground")}>
      <Check aria-hidden="true" strokeWidth={2.5} />
      Synced
    </span>
  );
}
