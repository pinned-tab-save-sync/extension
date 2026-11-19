import { getAuthToken } from "./auth";

/**
 * Performs a browser.storage.local.set only when the load is still current
 * (generation unchanged) and an auth token is present.
 *
 * The token check comes first (it is async). The generation check is
 * synchronous and immediately precedes the write, so no JS event-loop turn
 * can intervene between that check and the `set` call. This makes it
 * impossible for a load that began before a delete-all wipe to write
 * account data back into storage once the generation has been bumped.
 *
 * @param data - The key/value pairs to write.
 * @param capturedGeneration - The generation value snapshotted when the load started.
 * @param getCurrentGeneration - Returns the current live generation counter.
 * @returns true if the write was performed, false if skipped as stale.
 */
export async function guardedStorageWrite(
  data: Record<string, unknown>,
  capturedGeneration: number,
  getCurrentGeneration: () => number,
): Promise<boolean> {
  // Async check first: verify the auth token is still present
  const token = await getAuthToken();
  // Synchronous check last: no await between this line and the set call, so
  // loadGeneration cannot be bumped in the window before the write starts
  if (token === null || getCurrentGeneration() !== capturedGeneration) {
    return false;
  }
  await browser.storage.local.set(data);
  return true;
}
