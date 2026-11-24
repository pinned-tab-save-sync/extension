import { useMemo } from "react";
import type { User, UserLimits } from "@/lib/types";

/**
 * The signed-in user's sync limits, or null when logged out (local only, unlimited) or not known yet. Memoised on the
 * values, as the background user refresh replaces the user object on every open and would otherwise re-run the sync effect.
 */
export function useSyncLimits(user: User | null, isAuthenticated: boolean): UserLimits | null {
  const maxGroups = isAuthenticated ? user?.limits?.max_groups : undefined;
  const maxTabsPerGroup = isAuthenticated ? user?.limits?.max_tabs_per_group : undefined;

  return useMemo<UserLimits | null>(
    () => (maxGroups !== undefined && maxTabsPerGroup !== undefined ? { max_groups: maxGroups, max_tabs_per_group: maxTabsPerGroup } : null),
    [maxGroups, maxTabsPerGroup],
  );
}
