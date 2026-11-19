import { useState, useEffect, useCallback } from "react";
import { STORAGE_KEYS, type DensityPreference } from "@/lib/storage/keys";

interface UseDensityReturn {
  density: DensityPreference;
  setDensity: (density: DensityPreference) => void;
  /** Resets the in-memory layout to "comfortable" WITHOUT writing to storage.
   *  Used after "delete all local data" so the key is not re-written after clear(). */
  resetDensity: () => void;
}

/** The popup's layout preference, applied as `data-density` on `<html>` for the `compact:` Tailwind variant. */
export function useDensity(): UseDensityReturn {
  const [density, setDensityState] = useState<DensityPreference>("comfortable");

  // Load saved layout preference on mount
  useEffect(() => {
    browser.storage.local.get(STORAGE_KEYS.DENSITY).then((result) => {
      const savedDensity = result[STORAGE_KEYS.DENSITY];
      if (savedDensity === "comfortable" || savedDensity === "compact") {
        setDensityState(savedDensity);
      }
    });
  }, []);

  useEffect(() => {
    document.documentElement.dataset.density = density;
  }, [density]);

  const setDensity = useCallback((newDensity: DensityPreference) => {
    setDensityState(newDensity);
    browser.storage.local.set({ [STORAGE_KEYS.DENSITY]: newDensity });
  }, []);

  const resetDensity = useCallback(() => {
    setDensityState("comfortable");
  }, []);

  return { density, setDensity, resetDensity };
}
