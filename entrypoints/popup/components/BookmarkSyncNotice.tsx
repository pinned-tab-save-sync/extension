import { TriangleAlert } from "lucide-react";

/** Mozilla's guide to switching an extension's optional permissions on, as Firefox does not ask again once the prompt was blocked. */
const FIREFOX_PERMISSIONS_HELP_URL = "https://support.mozilla.org/kb/manage-optional-permissions-extensions";

/**
 * Inline amber notice shown when bookmark sync was switched on but the browser's permission prompt
 * was blocked, so the setting has been switched back off.
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
          Permission to manage bookmarks was blocked by the browser, so bookmark syncing is disabled.{" "}
          {import.meta.env.BROWSER === "firefox" ? (
            <>
              You'll need to reset permissions to enable it:{" "}
              <a href={FIREFOX_PERMISSIONS_HELP_URL} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
                how to manage extension permissions
              </a>
            </>
          ) : (
            "Try enabling it again from settings using the toggle."
          )}
        </p>
      </div>
    </div>
  );
}
