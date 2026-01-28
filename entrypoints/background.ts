import { setAuthToken, setStoredUser } from "@/lib/storage/auth";
import type { User } from "@/lib/types";

const AUTH_URL_PATTERN = /^https?:\/\/(localhost|127\.0\.0\.1):8000\/auth\/extension\/verified/;

interface AuthTokenMessage {
  type: "AUTH_TOKEN_RECEIVED";
  token: string;
  user: User;
}

export default defineBackground(() => {
  console.log("[Background] Service worker started");

  // Listen for auth token messages from injected scripts
  browser.runtime.onMessage.addListener(
    (message: AuthTokenMessage, sender) => {
      if (message.type === "AUTH_TOKEN_RECEIVED") {
        return handleAuthTokenReceived(message, sender);
      }
      return undefined;
    }
  );

  // Listen for tab updates to detect when the verified page loads
  browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === "complete" && tab.url && AUTH_URL_PATTERN.test(tab.url)) {
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
            chrome.runtime.sendMessage({
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

async function handleAuthTokenReceived(
  message: AuthTokenMessage,
  _sender: { tab?: { id?: number } }
): Promise<{ success: boolean }> {
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
