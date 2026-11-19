import { setAuthToken } from "@/lib/storage/auth";
import { STORAGE_KEYS } from "@/lib/storage/keys";
import { AUTH_URL } from "@/lib/urls";
import { createPkcePair, randomUrlSafeString } from "./pkce";

/**
 * Signing in from a normal tab (Chrome, Edge), where password managers work. The extension opens the
 * website's sign-in with its ID, a PKCE challenge and a state; once signed in, the website's connect
 * page passes a one-time code to the extension (externally_connectable), which exchanges it with the
 * PKCE verifier for its token. Firefox signs in through browser.identity instead (see background.ts).
 */

/** How long a started sign-in can be finished. */
export const TAB_SIGN_IN_TTL_MS = 15 * 60 * 1000;

type PendingTabSignIn = { verifier: string; state: string; startedAt: number; tabId?: number };

export type TabSignInMessage = { type: "PTSAS_SIGN_IN"; code: string; state: string };

export type TabSignInResult = { success: true } | { success: false; error: string };

/**
 * Open the website's sign-in (or registration) in a new tab, remembering the PKCE verifier for when it
 * finishes. If a sign-in tab from a moment ago is still open, show that one instead: a second sign-in
 * would replace the first one's verifier and leave its tab unable to finish.
 */
export async function startTabSignIn(mode: "login" | "register"): Promise<void> {
  const pending = await getPendingTabSignIn();

  if (pending?.tabId !== undefined && Date.now() - pending.startedAt <= TAB_SIGN_IN_TTL_MS) {
    try {
      const tab = await browser.tabs.update(pending.tabId, { active: true });
      if (tab?.windowId !== undefined) {
        await browser.windows.update(tab.windowId, { focused: true });
      }

      return;
    } catch {
      // The tab was closed; start again below
    }
  }

  const { verifier, challenge } = await createPkcePair();
  const state = randomUrlSafeString(24);
  const query = new URLSearchParams({ extension_id: browser.runtime.id, code_challenge: challenge, state });
  const tab = await browser.tabs.create({ url: `${AUTH_URL}/auth/extension/${mode}?${query}`, active: true });

  // Session storage: kept while the browser runs, never written to disk
  await browser.storage.session.set({
    [STORAGE_KEYS.PENDING_TAB_SIGN_IN]: { verifier, state, startedAt: Date.now(), tabId: tab?.id } satisfies PendingTabSignIn,
  });
}

async function getPendingTabSignIn(): Promise<PendingTabSignIn | undefined> {
  const result = await browser.storage.session.get(STORAGE_KEYS.PENDING_TAB_SIGN_IN);

  return result[STORAGE_KEYS.PENDING_TAB_SIGN_IN] as PendingTabSignIn | undefined;
}

/**
 * Finish a tab sign-in from the website's connect page: check the message came from the website and
 * matches the sign-in this extension started, then exchange the code for the token and store it.
 */
export async function completeTabSignIn(message: unknown, senderOrigin: string | undefined): Promise<TabSignInResult> {
  if (senderOrigin !== new URL(AUTH_URL).origin || !isTabSignInMessage(message)) {
    return { success: false, error: "This message did not come from the Pinned Tab Save & Sync website." };
  }

  const pending = await getPendingTabSignIn();

  if (!pending || pending.state !== message.state || Date.now() - pending.startedAt > TAB_SIGN_IN_TTL_MS) {
    return { success: false, error: "This sign-in is no longer active. Open the extension and sign in again." };
  }

  try {
    const response = await fetch(`${AUTH_URL}/auth/extension/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ code: message.code, code_verifier: pending.verifier }),
      credentials: "omit",
    });
    const body = (await response.json().catch(() => ({}))) as { token?: unknown; message?: unknown };

    // The website has answered, so its code is used up either way; a network failure (below) keeps the
    // sign-in so the connect page's "Try again" can still finish it
    await browser.storage.session.remove(STORAGE_KEYS.PENDING_TAB_SIGN_IN);

    if (!response.ok || typeof body.token !== "string" || body.token === "") {
      return {
        success: false,
        error: typeof body.message === "string" ? body.message : "Signing in failed. Open the extension and sign in again.",
      };
    }

    await setAuthToken(body.token);

    return { success: true };
  } catch {
    return { success: false, error: "The extension couldn't reach the website. Check your connection and sign in again." };
  }
}

function isTabSignInMessage(message: unknown): message is TabSignInMessage {
  const candidate = message as Partial<TabSignInMessage> | null;

  return (
    typeof candidate === "object" &&
    candidate !== null &&
    candidate.type === "PTSAS_SIGN_IN" &&
    typeof candidate.code === "string" &&
    candidate.code !== "" &&
    typeof candidate.state === "string"
  );
}
