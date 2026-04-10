import { setAuthToken, setStoredUser } from "@/lib/storage/auth";
import { STORAGE_KEYS } from "@/lib/storage/keys";
import type { User } from "@/lib/types";

const AUTH_BASE_URL = (import.meta.env.VITE_AUTH_URL || "http://localhost:8000").replace(/\/$/, "");
const AUTH_VERIFIED_PATH = `${AUTH_BASE_URL}/auth/extension/verified`;

interface AuthTokenMessage {
  type: "AUTH_TOKEN_RECEIVED";
  token: string;
  user: User;
}

export default defineBackground(() => {
  console.log("[Background] Service worker started");

  // On browser launch: restore only the startup group in one window
  browser.runtime.onStartup.addListener(handleStartup);

  // Prune stale window IDs from active group tracking on startup
  pruneStaleWindowEntries();

  // Clean up when a window is closed
  browser.windows.onRemoved.addListener((windowId) => {
    removeWindowActiveGroup(windowId);
  });

  // Listen for auth token messages from injected scripts
  browser.runtime.onMessage.addListener((message: AuthTokenMessage, sender) => {
    if (message.type === "AUTH_TOKEN_RECEIVED") {
      return handleAuthTokenReceived(message, sender);
    }
    return undefined;
  });

  // Listen for tab updates to detect when the verified page loads
  browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === "complete" && tab.url && tab.url.startsWith(AUTH_VERIFIED_PATH)) {
      console.log("[Background] Detected auth verified page:", tab.url);
      injectAuthScript(tabId);
    }
  });
});

async function injectAuthScript(tabId: number): Promise<void> {
  try {
    console.log("[Background] Injecting auth script into tab:", tabId);

    // Inject a script that extracts auth data from Inertia page props
    await browser.scripting.executeScript({
      target: { tabId },
      func: () => {
        console.log("[Injected Script] Looking for auth data...");

        // The Inertia page props are embedded in the #app element's data-page attribute
        const appElement = document.getElementById("app");
        if (!appElement) {
          console.error("[Injected Script] Could not find #app element");
          return;
        }

        const dataPage = appElement.getAttribute("data-page");
        if (!dataPage) {
          console.error("[Injected Script] Could not find data-page attribute");
          return;
        }

        try {
          const pageData = JSON.parse(dataPage);
          console.log("[Injected Script] Found page data for component:", pageData.component);

          if (pageData.props?.token && pageData.props?.user) {
            console.log("[Injected Script] Found auth data, sending to background...");
            // Use globalThis.chrome since this runs in injected script context
            (globalThis as unknown as { chrome: typeof browser }).chrome.runtime.sendMessage({
              type: "AUTH_TOKEN_RECEIVED",
              token: pageData.props.token,
              user: pageData.props.user,
            });
          } else {
            console.error("[Injected Script] Missing token or user in page props");
          }
        } catch (error) {
          console.error("[Injected Script] Failed to parse page data:", error);
        }
      },
    });

    console.log("[Background] Auth script injected successfully");
  } catch (error) {
    console.error("[Background] Failed to inject auth script:", error);
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
    if (windows.length === 0) return;

    // Pick the focused window, or fall back to the first
    const targetWindow = windows.find((w) => w.focused) ?? windows[0];
    const targetWindowId = targetWindow.id!;

    // Remove all pinned tabs from every window
    const allPinned = await browser.tabs.query({ pinned: true });
    if (allPinned.length > 0) {
      const ids = allPinned.map((t) => t.id).filter((id): id is number => id !== undefined);
      await browser.tabs.remove(ids);
    }

    // Open the startup group in the target window
    await Promise.all(urls.map((url) => browser.tabs.create({ url, pinned: true, active: false, windowId: targetWindowId })));

    // Update activeGroupsByWindow to reflect the clean state
    await browser.storage.local.set({
      [STORAGE_KEYS.ACTIVE_GROUPS_BY_WINDOW]: { [String(targetWindowId)]: startupGroupName },
    });

    console.log("[Background] Startup group restored successfully");
  } catch (error) {
    console.error("[Background] Failed to restore startup group:", error);
  }
}

async function pruneStaleWindowEntries(): Promise<void> {
  try {
    const result = await browser.storage.local.get(STORAGE_KEYS.ACTIVE_GROUPS_BY_WINDOW);
    const activeByWindow = result[STORAGE_KEYS.ACTIVE_GROUPS_BY_WINDOW] as Record<string, string | null> | undefined;
    if (!activeByWindow) return;

    const allWindows = await browser.windows.getAll();
    const openWindowIds = new Set(allWindows.map((w) => String(w.id)));
    const pruned: Record<string, string | null> = {};

    for (const [winId, groupName] of Object.entries(activeByWindow)) {
      if (openWindowIds.has(winId)) {
        pruned[winId] = groupName;
      }
    }

    await browser.storage.local.set({ [STORAGE_KEYS.ACTIVE_GROUPS_BY_WINDOW]: pruned });
  } catch (error) {
    console.error("[Background] Failed to prune stale window entries:", error);
  }
}

async function removeWindowActiveGroup(windowId: number): Promise<void> {
  try {
    const result = await browser.storage.local.get(STORAGE_KEYS.ACTIVE_GROUPS_BY_WINDOW);
    const activeByWindow = result[STORAGE_KEYS.ACTIVE_GROUPS_BY_WINDOW] as Record<string, string | null> | undefined;
    if (!activeByWindow) return;

    const { [String(windowId)]: _, ...remaining } = activeByWindow;
    await browser.storage.local.set({ [STORAGE_KEYS.ACTIVE_GROUPS_BY_WINDOW]: remaining });
  } catch (error) {
    console.error("[Background] Failed to remove window active group:", error);
  }
}

async function handleAuthTokenReceived(message: AuthTokenMessage, _sender: { tab?: { id?: number } }): Promise<{ success: boolean }> {
  try {
    console.log("[Background] Received auth token, storing...");

    // Store the auth token and user data
    await setAuthToken(message.token);
    await setStoredUser(message.user);

    console.log("[Background] Auth data stored successfully");

    // Don't auto-close the tab - let the user see the success message
    // and close it manually or navigate away

    return { success: true };
  } catch (error) {
    console.error("[Background] Failed to handle auth token:", error);
    return { success: false };
  }
}
