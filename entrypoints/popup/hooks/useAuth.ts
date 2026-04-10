import { useState, useEffect, useCallback } from "react";
import type { User } from "@/lib/types";
import { STORAGE_KEYS } from "@/lib/storage/keys";
import { getAuthToken, clearAuthToken, getStoredUser, setStoredUser, clearStoredUser } from "@/lib/storage/auth";
import { logout as apiLogout, getCurrentUser } from "@/lib/api/auth";

// Auth server URL for auth pages (website, not API)
const AUTH_URL = (import.meta.env.VITE_AUTH_URL || "http://localhost:8000").replace(/\/$/, "");

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
  clearJustLoggedIn: () => void;
}

export function useAuth(): UseAuthReturn {
  const [state, setState] = useState<AuthState>({
    user: null,
    isAuthenticated: false,
    isLoading: true,
    justLoggedIn: false,
  });

  // Check initial auth status
  useEffect(() => {
    checkAuthStatus();
  }, []);

  // Listen for storage changes (when auth completes via content script)
  useEffect(() => {
    const handleStorageChange = (changes: { [key: string]: { newValue?: unknown; oldValue?: unknown } }, areaName: string) => {
      console.log("[useAuth] Storage change detected:", areaName, Object.keys(changes));
      if (areaName !== "local") return;

      // Check if auth token was added
      if (changes[STORAGE_KEYS.AUTH_TOKEN]?.newValue) {
        console.log("[useAuth] Auth token added, calling checkAuthStatus(true)");
        // Re-check auth status to update the UI
        checkAuthStatus(true);
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

  const openLogin = useCallback(() => {
    browser.tabs.create({
      url: `${AUTH_URL}/auth/extension/login`,
      active: true,
    });
  }, []);

  const openRegister = useCallback(() => {
    browser.tabs.create({
      url: `${AUTH_URL}/auth/extension/register`,
      active: true,
    });
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiLogout();
    } catch {
      // Ignore errors, still clear local state
    } finally {
      await clearAuthToken();
      await clearStoredUser();
      // Clear local tab groups to prevent duplicate merge on next login
      await browser.storage.local.remove([STORAGE_KEYS.TAB_GROUPS, STORAGE_KEYS.ACTIVE_GROUP]);
      setState({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        justLoggedIn: false,
      });

      // Open the web logout page to clear the web session
      // This prevents auto-login when clicking login again
      browser.tabs.create({
        url: `${AUTH_URL}/auth/extension/logout`,
        active: false,
      });
    }
  }, []);

  const clearJustLoggedIn = useCallback(() => {
    setState((prev) => ({ ...prev, justLoggedIn: false }));
  }, []);

  return {
    ...state,
    openLogin,
    openRegister,
    logout,
    clearJustLoggedIn,
  };
}
