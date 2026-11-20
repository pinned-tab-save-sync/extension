export const STORAGE_KEYS = {
  TAB_GROUPS: "tabGroups",
  ACTIVE_GROUP_PREFIX: "activeGroup:", // session storage, one key per window
  GROUP_ORDER: "groupOrder",
  AUTH_TOKEN: "authToken",
  STORED_USER: "storedUser",
  THEME: "theme",
  DENSITY: "density",
  STARTUP_GROUP: "startupGroup",
  LAST_SYNCED_FINGERPRINT: "lastSyncedFingerprint",
  SYNC_PAUSED_OVER_LIMIT: "syncPausedOverLimit",
  PENDING_TAB_SIGN_IN: "pendingTabSignIn",
  BOOKMARK_SYNC: "bookmarkSync", // whether this browser mirrors its groups into a bookmark folder
  BOOKMARK_SYNC_FOLDER_ID: "bookmarkSyncFolderId",
} as const;

export type ThemePreference = "system" | "light" | "dark";

/** Popup layout: "comfortable" (the default spacing) or "compact" (tighter, more groups in view). */
export type DensityPreference = "comfortable" | "compact";
