import { useState, useEffect, useCallback } from "react";
import type { User } from "@/lib/types";
import { STORAGE_KEYS } from "@/lib/storage/keys";
import { getAuthToken, clearAuthToken, getStoredUser, setStoredUser, clearStoredUser } from "@/lib/storage/auth";
import { getCurrentUser } from "@/lib/api/auth";
import { endSession, deleteAllLocalData } from "@/lib/localData";
import { AUTH_URL } from "@/lib/urls";
import { IS_LOCAL_ONLY } from "@/lib/buildMode";

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  justLoggedIn: boolean;
}

interface UseAuthReturn extends AuthState {
  openLogin: () => void;
  openRegister: () => void;
  logout: () => Promise<void>;
  logoutAndDeleteAllLocalData: () => Promise<void>;
  clearJustLoggedIn: () => void;
}

/** Auth state for the popup. A local-only build has no sign-in: it is never loading and never authenticated. */
export function useAuth(): UseAuthReturn {
  const [state, setState] = useState<AuthState>({
    user: null,
    isAuthenticated: false,
    isLoading: !IS_LOCAL_ONLY,
    justLoggedIn: false,
  });

  // Check initial auth status
  useEffect(() => {
    if (IS_LOCAL_ONLY) return;
    checkAuthStatus();
  }, []);

  // Listen for storage changes (when auth completes via the background auth flow)
  useEffect(() => {
    if (IS_LOCAL_ONLY) return;

    const handleStorageChange = (changes: { [key: string]: { newValue?: unknown; oldValue?: unknown } }, areaName: string) => {
      console.log("[useAuth] Storage change detected:", areaName, Object.keys(changes));
      if (areaName !== "local") return;

      if (STORAGE_KEYS.AUTH_TOKEN in changes) {
        if (changes[STORAGE_KEYS.AUTH_TOKEN]?.newValue) {
          // Token added - re-check auth status to fetch the user
          console.log("[useAuth] Auth token added, calling checkAuthStatus(true)");
          checkAuthStatus(true);
        } else {
          // Token removed (by 401 handler, endSession, or another context)
          console.log("[useAuth] Auth token removed, clearing auth state");
          setState({
            user: null,
            isAuthenticated: false,
            isLoading: false,
            justLoggedIn: false,
          });
        }
      }
    };

    browser.storage.onChanged.addListener(handleStorageChange);
    return () => {
      browser.storage.onChanged.removeListener(handleStorageChange);
    };
  }, []);

  const checkAuthStatus = async (justLoggedIn = false) => {
    console.log("[useAuth] checkAuthStatus called, justLoggedIn:", justLoggedIn);
    try {
      const token = await getAuthToken();
      console.log("[useAuth] Token present:", !!token);
      if (!token) {
        setState((prev) => ({ ...prev, isLoading: false }));
        return;
      }

      const storedUser = await getStoredUser();
      if (storedUser) {
        setState({
          user: storedUser,
          isAuthenticated: true,
          isLoading: false,
          justLoggedIn,
        });
        refreshStoredUser();
        return;
      }

      const user = await getCurrentUser();
      await setStoredUser(user);
      setState({
        user,
        isAuthenticated: true,
        isLoading: false,
        justLoggedIn,
      });
    } catch {
      await clearAuthToken();
      await clearStoredUser();
      setState({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        justLoggedIn: false,
      });
    }
  };

  /**
   * Re-fetch the user in the background so server-side changes (e.g. tier and limits)
   * reach a cached user. Failures are ignored; a 401 is handled by the API client.
   */
  const refreshStoredUser = async () => {
    try {
      const user = await getCurrentUser();
      if ((await getAuthToken()) === null) {
        return;
      }
      await setStoredUser(user);
      setState((prev) => (prev.isAuthenticated ? { ...prev, user } : prev));
    } catch (error) {
      console.warn("[useAuth] Background user refresh failed:", error);
    }
  };

  const openLogin = useCallback(() => {
    browser.runtime.sendMessage({ type: "START_AUTH_FLOW", mode: "login" }).catch((err) => {
      console.error("[useAuth] Failed to send START_AUTH_FLOW (login):", err);
    });
  }, []);

  const openRegister = useCallback(() => {
    browser.runtime.sendMessage({ type: "START_AUTH_FLOW", mode: "register" }).catch((err) => {
      console.error("[useAuth] Failed to send START_AUTH_FLOW (register):", err);
    });
  }, []);

  /** Ends the session and resets auth state. Local tab groups are kept. */
  const logout = useCallback(async () => {
    try {
      await endSession();
    } finally {
      setState({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        justLoggedIn: false,
      });

      // Open the web logout page to clear the web session
      browser.tabs.create({
        url: `${AUTH_URL}/auth/extension/logout`,
        active: false,
      });
    }
  }, []);

  /**
   * Ends the session, sets unauthenticated state (BEFORE the wipe), then
   * wipes all local storage. Ordering is guaranteed by `localData.ts`.
   * If the session could not be ended (token still present), throws and
   * leaves everything intact.
   */
  const logoutAndDeleteAllLocalData = useCallback(async () => {
    try {
      await endSession();
    } catch (error) {
      // If endSession threw but the token is actually gone (e.g. removed by a
      // 401 handler racing with logout), we can still proceed with the wipe.
      const token = await getAuthToken();
      if (token !== null) {
        // Token still present - cannot safely wipe; propagate to the UI
        throw error;
      }
      // Token is gone - fall through
    }

    // L4: Set unauthenticated state BEFORE the wipe so the sync effect can
    // never observe groups === {} with isAuthenticated === true
    setState({ user: null, isAuthenticated: false, isLoading: false, justLoggedIn: false });

    // Wipe everything; throws AuthTokenStillPresentError if the gate fails
    await deleteAllLocalData();

    // Open the web logout page to clear the web session
    browser.tabs.create({
      url: `${AUTH_URL}/auth/extension/logout`,
      active: false,
    });
  }, []);

  const clearJustLoggedIn = useCallback(() => {
    setState((prev) => ({ ...prev, justLoggedIn: false }));
  }, []);

  return {
    ...state,
    openLogin,
    openRegister,
    logout,
    logoutAndDeleteAllLocalData,
    clearJustLoggedIn,
  };
}
