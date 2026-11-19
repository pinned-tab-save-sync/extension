import { getAuthToken, clearAuthToken, clearStoredUser } from "./storage/auth";
import { logout as apiLogout } from "./api/auth";
import { disableSync } from "./sync";

/**
 * Thrown by `deleteAllLocalData` when an auth token is still present in storage.
 * This is a hard gate: no local data is wiped while a session is still active.
 */
export class AuthTokenStillPresentError extends Error {
  constructor() {
    super("Cannot delete local data while an auth token is present. Call endSession() first.");
    this.name = "AuthTokenStillPresentError";
  }
}

/**
 * Ends the current session: disables sync, revokes the server token (best effort),
 * then removes the auth token and stored user from local storage.
 * Never touches tab data or any other local data.
 *
 * Step order:
 *   1. disableSync() - cancels the pending debounce timer; blocks new ones
 *   2. POST /logout (best effort, swallows failures - offline / 401 / timeout are all OK)
 *   3. clearAuthToken() + clearStoredUser()
 */
export async function endSession(): Promise<void> {
  // 1. Disable sync first so nothing new can start
  disableSync();

  // 2. Server-side revocation (best effort; failure is ignored)
  try {
    await apiLogout();
  } catch {
    // Offline, 401, 5xx, timeout - all ignored; local removal in step 3 is the guarantee
  }

  // 3. Remove token and user - these are the authoritative local session markers
  await clearAuthToken();
  await clearStoredUser();
}

/**
 * Wipes all data from browser.storage.local.
 * Throws `AuthTokenStillPresentError` if an auth token is still stored, so that
 * no caller (present or future) can accidentally wipe while a session is active.
 *
 * Step order:
 *   1. Hard gate: read token; throw if present
 *   2. disableSync() (idempotent; covers the logged-out caller)
 *   3. browser.storage.local.clear()
 */
export async function deleteAllLocalData(): Promise<void> {
  // Hard gate: refuse to wipe while a token is stored
  const token = await getAuthToken();
  if (token !== null) {
    throw new AuthTokenStillPresentError();
  }

  // Belt-and-suspenders: ensure sync is disabled even for the logged-out path
  disableSync();

  await browser.storage.local.clear();
  // An unfinished tab sign-in (Chrome / Edge) lives in session storage
  await browser.storage.session?.clear();
}

/**
 * Ends the session and then wipes all local data.
 * Ordering guarantee: endSession() completes (and the token is confirmed absent)
 * before any storage is cleared.
 * If endSession() throws and the token is still present, the error propagates
 * and nothing is deleted.
 */
export async function logOutAndDeleteAllLocalData(): Promise<void> {
  await endSession();
  await deleteAllLocalData();
}
