export interface UserLimits {
  max_groups: number;
  max_tabs_per_group: number;
}

export interface User {
  id: number;
  name: string;
  email: string;
  /** Missing on users stored before limits were added to `GET /user`, until the next refresh. */
  tier?: string;
  limits?: UserLimits;
  created_at: string;
  updated_at: string;
}

export interface AuthResponse {
  user: User;
  token: string;
}

export interface TabGroup {
  id: string;
  name: string;
  position: number;
}

export interface PinnedTab {
  id: string;
  url: string;
  title: string | null;
  favicon_url: string | null;
  group: TabGroup | null;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface TabGroups {
  [name: string]: string[];
}

/** How many groups, and tabs across them, a set of tab groups holds. */
export interface TabGroupsSummary {
  groups: number;
  tabs: number;
}

export interface ApiError {
  message: string;
  errors?: Record<string, string[]>;
}

export interface ValidationErrors {
  [field: string]: string[];
}

export type SyncStatus = "idle" | "syncing" | "error" | "conflict" | "overLimit";

export type SyncConflictChoice = "account" | "browser" | "merge";

export type StartAuthFlowMessage = {
  type: "START_AUTH_FLOW";
  mode: "login" | "register";
};
