import { useState, useEffect, useCallback } from "react";
import { STORAGE_KEYS, type ThemePreference } from "@/lib/storage/keys";

interface UseThemeReturn {
  theme: ThemePreference;
  setTheme: (theme: ThemePreference) => void;
  /** Resets the in-memory theme to "system" WITHOUT writing to storage.
   *  Used after "delete all local data" so the key is not re-written after clear(). */
  resetTheme: () => void;
  isDark: boolean;
}

export function useTheme(): UseThemeReturn {
  const [theme, setThemeState] = useState<ThemePreference>("system");
  const [systemPrefersDark, setSystemPrefersDark] = useState(false);

  // Load saved theme preference on mount
  useEffect(() => {
    browser.storage.local.get(STORAGE_KEYS.THEME).then((result) => {
      const savedTheme = result[STORAGE_KEYS.THEME] as ThemePreference | undefined;
      if (savedTheme && ["system", "light", "dark"].includes(savedTheme)) {
        setThemeState(savedTheme);
      }
    });
  }, []);

  // Detect system preference
  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    setSystemPrefersDark(mediaQuery.matches);

    const handleChange = (e: MediaQueryListEvent) => {
      setSystemPrefersDark(e.matches);
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  const setTheme = useCallback((newTheme: ThemePreference) => {
    setThemeState(newTheme);
    browser.storage.local.set({ [STORAGE_KEYS.THEME]: newTheme });
  }, []);

  /** Resets only the in-memory theme state; does not write to storage. */
  const resetTheme = useCallback(() => {
    setThemeState("system");
  }, []);

  // Resolve actual dark mode state
  const isDark = theme === "dark" || (theme === "system" && systemPrefersDark);

  // On the root element so portalled content (menus) picks up the dark tokens too
  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
  }, [isDark]);

  return { theme, setTheme, resetTheme, isDark };
}
