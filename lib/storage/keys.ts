export const STORAGE_KEYS = {
  TAB_GROUPS: "tabGroups",
  ACTIVE_GROUP: "activeGroupName",
  ACTIVE_GROUPS_BY_WINDOW: "activeGroupsByWindow",
  GROUP_ORDER: "groupOrder",
  AUTH_TOKEN: "authToken",
  STORED_USER: "storedUser",
  THEME: "theme",
} as const;

export type ThemePreference = "system" | "light" | "dark";
