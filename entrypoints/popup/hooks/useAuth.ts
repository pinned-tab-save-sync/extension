import { useState, useEffect, useCallback } from "react";
import type { User, ValidationErrors } from "@/lib/types";
import {
  getAuthToken,
  setAuthToken,
  clearAuthToken,
  getStoredUser,
  setStoredUser,
  clearStoredUser,
} from "@/lib/storage/auth";
import {
  login as apiLogin,
  register as apiRegister,
  logout as apiLogout,
  getCurrentUser,
} from "@/lib/api/auth";
import { ApiClientError } from "@/lib/api/client";

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  validationErrors: ValidationErrors | null;
}

interface UseAuthReturn extends AuthState {
  login: (email: string, password: string) => Promise<boolean>;
  register: (
    email: string,
    password: string,
    passwordConfirmation: string
  ) => Promise<boolean>;
  logout: () => Promise<void>;
  clearError: () => void;
}

export function useAuth(): UseAuthReturn {
  const [state, setState] = useState<AuthState>({
    user: null,
    isAuthenticated: false,
    isLoading: true,
    error: null,
    validationErrors: null,
  });

  useEffect(() => {
    checkAuthStatus();
  }, []);

  const checkAuthStatus = async () => {
    try {
      const token = await getAuthToken();
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
          error: null,
          validationErrors: null,
        });
        return;
      }

      const user = await getCurrentUser();
      await setStoredUser(user);
      setState({
        user,
        isAuthenticated: true,
        isLoading: false,
        error: null,
        validationErrors: null,
      });
    } catch {
      await clearAuthToken();
      await clearStoredUser();
      setState({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: null,
        validationErrors: null,
      });
    }
  };

  const login = useCallback(
    async (email: string, password: string): Promise<boolean> => {
      setState((prev) => ({
        ...prev,
        isLoading: true,
        error: null,
        validationErrors: null,
      }));

      try {
        const response = await apiLogin(email, password);
        await setAuthToken(response.token);
        await setStoredUser(response.user);

        setState({
          user: response.user,
          isAuthenticated: true,
          isLoading: false,
          error: null,
          validationErrors: null,
        });
        return true;
      } catch (err) {
        const error =
          err instanceof ApiClientError ? err : new Error("Login failed");
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: error.message,
          validationErrors:
            err instanceof ApiClientError ? err.errors ?? null : null,
        }));
        return false;
      }
    },
    []
  );

  const register = useCallback(
    async (
      email: string,
      password: string,
      passwordConfirmation: string
    ): Promise<boolean> => {
      setState((prev) => ({
        ...prev,
        isLoading: true,
        error: null,
        validationErrors: null,
      }));

      try {
        // Derive name from email (part before @)
        const name = email.split("@")[0] || email;
        const response = await apiRegister(
          name,
          email,
          password,
          passwordConfirmation
        );
        await setAuthToken(response.token);
        await setStoredUser(response.user);

        setState({
          user: response.user,
          isAuthenticated: true,
          isLoading: false,
          error: null,
          validationErrors: null,
        });
        return true;
      } catch (err) {
        const error =
          err instanceof ApiClientError ? err : new Error("Registration failed");
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: error.message,
          validationErrors:
            err instanceof ApiClientError ? err.errors ?? null : null,
        }));
        return false;
      }
    },
    []
  );

  const logout = useCallback(async () => {
    try {
      await apiLogout();
    } catch {
      // Ignore errors, still clear local state
    } finally {
      await clearAuthToken();
      await clearStoredUser();
      // Clear local tab groups to prevent duplicate merge on next login
      await browser.storage.local.remove(["tabGroups", "activeGroupName"]);
      setState({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: null,
        validationErrors: null,
      });
    }
  }, []);

  const clearError = useCallback(() => {
    setState((prev) => ({ ...prev, error: null, validationErrors: null }));
  }, []);

  return {
    ...state,
    login,
    register,
    logout,
    clearError,
  };
}
