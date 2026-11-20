import { TriangleAlert } from "lucide-react";

/**
 * Inline amber notice shown when bookmark sync was switched on but the browser's permission prompt
 * was declined after the popup closed, so the setting has been switched back off.
 */
export function BookmarkSyncNotice() {
  return (
    <div
      role="status"
      className="mx-4 mb-2 flex shrink-0 gap-2.5 rounded-[10px] border border-warning-soft-border bg-warning-soft p-3 text-warning-soft-foreground"
    >
      <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <div className="flex flex-col gap-0.5">
        <p className="text-sm font-semibold">Bookmark sync is off</p>
        <p className="text-xs leading-relaxed">
          The browser was not given permission to change your bookmarks, so your groups are not being synced to them. Open the settings to switch it
          back on.
        </p>
      </div>
    </div>
  );
}
