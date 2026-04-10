export default defineContentScript({
  matches: [
    "http://localhost:8000/auth/extension/*",
    "http://127.0.0.1:8000/auth/extension/*",
    "https://pinnedtabsaveandsync.com/auth/extension/*",
  ],
  runAt: "document_start",
  main() {
    console.log(
      "[Auth Bridge] Content script loaded on:",
      window.location.href,
    );

    window.addEventListener("message", (event) => {
      // Log all messages for debugging
      if (event.data?.type) {
        console.log(
          "[Auth Bridge] Received message:",
          event.data.type,
          "from origin:",
          event.origin,
        );
      }

      // Verify this is our auth success message
      if (event.data?.type !== "EXTENSION_AUTH_SUCCESS") {
        return;
      }

      console.log("[Auth Bridge] Processing auth success message");

      // Validate the message has required data
      if (!event.data.token || !event.data.user) {
        console.error("[Auth Bridge] Missing token or user data");
        return;
      }

      console.log("[Auth Bridge] Sending to background script...");

      // Forward the auth data to the background script
      browser.runtime
        .sendMessage({
          type: "AUTH_TOKEN_RECEIVED",
          token: event.data.token,
          user: event.data.user,
        })
        .then(() => {
          console.log(
            "[Auth Bridge] Successfully sent auth data to background",
          );
        })
        .catch((error) => {
          console.error(
            "[Auth Bridge] Failed to send message to background",
            error,
          );
        });
    });
  },
});
