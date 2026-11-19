import { STORAGE_KEYS } from "./keys";

/** Returns the persisted last-synced fingerprint hash, or null if not set. */
export async function getLastSyncedFingerprint(): Promise<string | null> {
  const result = await browser.storage.local.get(STORAGE_KEYS.LAST_SYNCED_FINGERPRINT);
  const value = result[STORAGE_KEYS.LAST_SYNCED_FINGERPRINT];
  return typeof value === "string" ? value : null;
}

/** Persists the last-synced fingerprint hash. */
export async function setLastSyncedFingerprint(hash: string): Promise<void> {
  await browser.storage.local.set({ [STORAGE_KEYS.LAST_SYNCED_FINGERPRINT]: hash });
}
