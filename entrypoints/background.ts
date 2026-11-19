import { completeTabSignIn, startTabSignIn } from "@/lib/auth/tabSignIn";
import { migrateLegacyActiveGroups, setActiveGroupForWindow } from "@/lib/storage/activeGroups";
import { setAuthToken } from "@/lib/storage/auth";
import { IS_LOCAL_ONLY } from "@/lib/buildMode";
import { STORAGE_KEYS } from "@/lib/storage/keys";
import { replacePinnedTabs } from "@/lib/tabs";
import type { StartAuthFlowMessage } from "@/lib/types";
import { AUTH_URL as AUTH_BASE_URL } from "@/lib/urls";

/** Prevents double-triggering if the user clicks Sign In twice quickly. */
let authFlowInProgress = false;

export default defineBackground(() => {
  console.log("[Background] Service worker started");

  // On browser launch: restore only the startup group in one window
  browser.runtime.onStartup.addListener(handleStartup);

  // After an update: move data an older version stored into its current place
  browser.runtime.onInstalled.addListener(({ reason }) => {
    if (reason === "update") {
      migrateLegacyActiveGroups().catch((error) => console.error("[Background] Failed to migrate active groups:", error));
    }
  });

  // Forget a window's active group when it closes
  browser.windows.onRemoved.addListener((windowId) => {
    setActiveGroupForWindow(windowId, null).catch((error) => console.error("[Background] Failed to forget window active group:", error));
  });

  // Local-only builds have no sign-in, so nothing below is registered
  if (IS_LOCAL_ONLY) {
    return;
  }

  // Handle messages from the popup (e.g. START_AUTH_FLOW)
  browser.runtime.onMessage.addListener((message: StartAuthFlowMessage) => {
    if (message.type === "START_AUTH_FLOW") {
      if (import.meta.env.BROWSER === "firefox") {
        startIdentityAuthFlow(message.mode);
      } else {
        startTabSignIn(message.mode).catch((error) => console.error("[Background] Could not start sign-in:", error));
      }
    }
    return undefined;
  });

  // Chrome / Edge: the website's connect page hands over a one-time code (externally_connectable)
  if (import.meta.env.BROWSER !== "firefox") {
    browser.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
      completeTabSignIn(message, senderOrigin(sender))
        .then((result) => {
          sendResponse(result);

          // Close the sign-in tab once the page has shown that it worked
          const tabId = sender.tab?.id;
          if (result.success && tabId !== undefined) {
            setTimeout(() => browser.tabs.remove(tabId).catch(() => undefined), 1500);
          }
        })
        .catch((error) => {
          // Always answer, or the page waits on "Connecting..." for ever
          console.error("[Background] Tab sign-in failed:", error);
          sendResponse({ success: false, error: "Signing in failed. Open the extension and sign in again." });
        });

      return true; // responds asynchronously
    });
  }
});

/** The origin a message came from, or undefined when the browser gives nothing usable. */
function senderOrigin(sender: { origin?: string; url?: string }): string | undefined {
  if (sender.origin) {
    return sender.origin;
  }

  try {
    return sender.url ? new URL(sender.url).origin : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Firefox: sign in through browser.identity's sign-in window, where 1Password still works. The token
 * comes back in the redirect URL's fragment.
 */
async function startIdentityAuthFlow(mode: "login" | "register"): Promise<void> {
  if (authFlowInProgress) {
    console.log("[Background] Auth flow already in progress, ignoring.");
    return;
  }

  authFlowInProgress = true;

  try {
    const redirectUrl = browser.identity.getRedirectURL();
    const url = `${AUTH_BASE_URL}/auth/extension/${mode}?redirect_uri=${encodeURIComponent(redirectUrl)}`;

    console.log("[Background] Starting launchWebAuthFlow for mode:", mode);

    const responseUrl = await browser.identity.launchWebAuthFlow({ url, interactive: true });

    if (!responseUrl) {
      console.log("[Background] No response URL returned (user may have cancelled).");
      return;
    }

    // Token is in the URL fragment: #token=<rawurlencoded plainTextToken>
    const hash = new URL(responseUrl).hash.slice(1);
    const token = new URLSearchParams(hash).get("token");

    if (!token) {
      console.error("[Background] No token found in response URL fragment.");
      return;
    }

    await setAuthToken(token);
    console.log("[Background] Auth token stored successfully. User will be fetched on next popup open.");
  } catch (error) {
    // Chrome rejects with "The user did not approve access." on cancel; log and swallow.
    console.warn("[Background] Auth flow ended:", error instanceof Error ? error.message : error);
  } finally {
    authFlowInProgress = false;
  }
}

async function handleStartup(): Promise<void> {
  console.log("[Background] Browser startup detected, restoring startup group");
  try {
    const result = await browser.storage.local.get([STORAGE_KEYS.STARTUP_GROUP, STORAGE_KEYS.TAB_GROUPS]);

    const startupGroupName = result[STORAGE_KEYS.STARTUP_GROUP];
    if (typeof startupGroupName !== "string" || !startupGroupName) {
      console.log("[Background] No startup group set, skipping cleanup");
      return;
    }

    const tabGroups = result[STORAGE_KEYS.TAB_GROUPS] as Record<string, string[]> | undefined;
    const urls = tabGroups?.[startupGroupName];
    if (!Array.isArray(urls) || urls.length === 0) {
      console.log("[Background] Startup group not found or empty, skipping cleanup");
      return;
    }

    console.log(`[Background] Restoring startup group: "${startupGroupName}" (${urls.length} tabs)`);

    // Get all normal windows
    const windows = await browser.windows.getAll({ windowTypes: ["normal"] });
    // Pick the focused window, or fall back to the first
    const targetWindowId = (windows.find((w) => w.focused) ?? windows[0])?.id;
    if (targetWindowId === undefined) return;

    // Open the startup group in the target window, then remove the pinned tabs every window had
    const allPinned = await browser.tabs.query({ pinned: true });
    const pinnedTabIds = allPinned.map((t) => t.id).filter((id): id is number => id !== undefined);
    const refusedCount = await replacePinnedTabs(urls, targetWindowId, pinnedTabIds);

    if (refusedCount === urls.length) {
      console.warn(`[Background] The browser refused every tab in the startup group "${startupGroupName}"; kept the restored tabs`);
      return;
    }

    // Session storage starts empty on launch, so this is the only window with an active group
    await setActiveGroupForWindow(targetWindowId, startupGroupName);

    console.log(`[Background] Startup group restored (${refusedCount} of ${urls.length} tabs refused by the browser)`);
  } catch (error) {
    console.error("[Background] Failed to restore startup group:", error);
  }
}
