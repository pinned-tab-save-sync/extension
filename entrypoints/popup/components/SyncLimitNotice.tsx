import { TriangleAlert } from "lucide-react";

interface SyncLimitNoticeProps {
  message: string;
}

/**
 * Inline amber notice shown while sync is paused because the tab groups are over the sync limits.
 * Local edits keep saving; sync resumes on its own once the groups fit.
 */
export function SyncLimitNotice({ message }: SyncLimitNoticeProps) {
  return (
    <div
      role="status"
      className="mx-4 mb-2 flex shrink-0 gap-2.5 rounded-[10px] border border-warning-soft-border bg-warning-soft p-3 text-warning-soft-foreground"
    >
      <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <div className="flex flex-col gap-0.5">
        <p className="text-sm font-semibold">Sync paused - over the sync limit</p>
        <p className="text-xs leading-relaxed">
          {message} Remove some groups or tabs to resume syncing. Your changes are still saved in this browser.
        </p>
      </div>
    </div>
  );
}
