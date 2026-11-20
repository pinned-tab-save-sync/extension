import { useState, useEffect, useCallback, useRef } from "react";
import { BOOKMARKS_PERMISSION } from "@/lib/bookmarkSync";
import { STORAGE_KEYS } from "@/lib/storage/keys";

/** Why switching bookmark sync on did not work: the browser's permission prompt was blocked, or the request itself failed. */
export type BookmarkSyncError = "blocked" | "failed";

interface UseBookmarkSyncReturn {
  /** Whether this browser mirrors its groups into the "Pinned Tabs" bookmark folder. */
  isBookmarkSyncEnabled: boolean;
  /** Why switching on did not work, or null. "blocked" is shown as a notice on the main screen, "failed" under the setting. */
  bookmarkSyncError: BookmarkSyncError | null;
  /** Must be called straight from a click: switching on asks the browser for the bookmarks permission. */
  setBookmarkSyncEnabled: (enabled: boolean) => void;
  /** Resets the in-memory setting WITHOUT writing to storage, after "delete all local data". */
  resetBookmarkSync: () => void;
}

/** Store the setting. The background acts on the change; a failed write is logged, not thrown. */
function storeBookmarkSyncSetting(isEnabled: boolean): void {
  browser.storage.local
    .set({ [STORAGE_KEYS.BOOKMARK_SYNC]: isEnabled })
    .catch((error) => console.error("[Bookmarks] Failed to store the bookmark sync setting:", error));
}

/**
 * The per-browser "sync groups to bookmarks" setting. The popup only stores the setting and asks
 * for the permission; the background does the syncing (see `lib/bookmarkSync.ts`), as the popup
 * usually closes while the browser shows its permission prompt.
 */
export function useBookmarkSync(): UseBookmarkSyncReturn {
  const [isBookmarkSyncEnabled, setEnabledState] = useState(false);
  const [bookmarkSyncError, setBookmarkSyncError] = useState<BookmarkSyncError | null>(null);
  const latestRequestNumber = useRef(0);

  // Load the setting on mount. It only counts while the browser still grants the permission
  useEffect(() => {
    let isCurrent = true;

    Promise.all([browser.storage.local.get(STORAGE_KEYS.BOOKMARK_SYNC), browser.permissions.contains(BOOKMARKS_PERMISSION)])
      .then(([stored, hasPermission]) => {
        const isStoredOn = stored[STORAGE_KEYS.BOOKMARK_SYNC] === true;
        if (isStoredOn && !hasPermission) {
          // Switched on, but the prompt was declined after the popup closed: nothing is syncing,
          // so switch off and say why
          storeBookmarkSyncSetting(false);
          if (isCurrent) {
            setBookmarkSyncError("blocked");
          }
          return;
        }
        if (isCurrent) {
          setEnabledState(isStoredOn);
        }
      })
      .catch((error) => console.error("[Bookmarks] Failed to load the bookmark sync setting:", error));

    return () => {
      isCurrent = false;
    };
  }, []);

  // The background switches the setting off when the permission is taken away, so follow the stored value
  useEffect(() => {
    const handleStorageChange = (changes: Record<string, { newValue?: unknown }>, areaName: string) => {
      const settingChange = changes[STORAGE_KEYS.BOOKMARK_SYNC];
      if (areaName === "local" && settingChange) {
        setEnabledState(settingChange.newValue === true);
      }
    };

    browser.storage.onChanged.addListener(handleStorageChange);
    return () => browser.storage.onChanged.removeListener(handleStorageChange);
  }, []);

  const setBookmarkSyncEnabled = useCallback((enabled: boolean) => {
    // A newer click makes the answer to an older permission request stale
    const requestNumber = ++latestRequestNumber.current;
    setBookmarkSyncError(null);

    if (!enabled) {
      // The background removes the bookmark folder. The permission is kept, so switching back on does not ask again
      setEnabledState(false);
      storeBookmarkSyncSetting(false);
      return;
    }

    // Stored first: if the popup closes while the browser asks, the background still starts syncing
    // once the permission is granted. Not awaited, as Firefox only allows the request directly
    // inside the click
    setEnabledState(true);
    storeBookmarkSyncSetting(true);

    let permissionRequest: Promise<boolean>;
    try {
      permissionRequest = browser.permissions.request(BOOKMARKS_PERMISSION);
    } catch (error) {
      permissionRequest = Promise.reject(error);
    }

    const switchBackOff = (error: BookmarkSyncError) => {
      setEnabledState(false);
      setBookmarkSyncError(error);
      storeBookmarkSyncSetting(false);
    };

    permissionRequest
      .then((isGranted) => {
        // Only the latest click counts: an older request's answer must not undo it
        if (requestNumber === latestRequestNumber.current && !isGranted) {
          switchBackOff("blocked");
        }
      })
      .catch((error) => {
        console.warn("[Bookmarks] Could not ask for the bookmarks permission:", error);
        if (requestNumber === latestRequestNumber.current) {
          switchBackOff("failed");
        }
      });
  }, []);

  const resetBookmarkSync = useCallback(() => {
    setEnabledState(false);
    setBookmarkSyncError(null);
  }, []);

  return { isBookmarkSyncEnabled, bookmarkSyncError, setBookmarkSyncEnabled, resetBookmarkSync };
}
