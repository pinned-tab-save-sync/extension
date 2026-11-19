import { defineConfig } from "wxt";
import type { ConfigEnv } from "wxt";
import { loadEnv } from "vite";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  // Firefox sources zip: leave out notes that are not needed to build the extension, and include .env (dotfiles are
  // left out by default) so a store reviewer's build is the one submitted, not the local-only default
  zip: { excludeSources: ["plans/**", "CLAUDE.md", "AGENTS.md", "CHROMEWEBSTORE.md"], includeSources: ["**/*", ".env"] },
  manifest: (env: ConfigEnv) => {
    const buildEnv = loadEnv(env.mode, process.cwd(), "VITE_");

    // Local-only builds (the default, same rule as lib/buildMode.ts) have no sign-in or sync, so their
    // manifest leaves out everything that exists for the website
    if (buildEnv.VITE_LOCAL_ONLY !== "false") {
      return {
        name: "Pinned Tab Save & Sync",
        description: "Save groups of pinned tabs and switch between them in one click.",
        permissions: ["tabs", "storage"],
        ...(env.browser === "firefox"
          ? {
              browser_specific_settings: {
                gecko: {
                  // Not the store add-on's id, so a local-only build installs alongside it; a fixed id keeps saved groups across reloads
                  id: "pinned-tab-save-and-sync-local@pinnedtabsaveandsync.com",
                  strict_min_version: "140.0",
                  data_collection_permissions: { required: ["none"] },
                },
              },
            }
          : { minimum_chrome_version: "111" }),
      };
    }

    // The website the extension signs in with (same default as lib/urls.ts)
    const authOrigin = new URL(buildEnv.VITE_AUTH_URL || "http://localhost:8000").origin;

    // A store package that trusts a local or plain-http website would let anything on that address
    // message the extension, so `npm run zip` refuses one. Plain builds for local testing are fine.
    if (process.argv.includes("zip")) {
      if (!authOrigin.startsWith("https://")) {
        throw new Error(`VITE_AUTH_URL must be https to package the extension for a store (got ${authOrigin}).`);
      }
      // Unset, the API client falls back to http://localhost, which would send the sign-in token nowhere useful
      if (!(buildEnv.VITE_API_URL ?? "").startsWith("https://")) {
        throw new Error(`VITE_API_URL must be https to package the extension for a store (got ${buildEnv.VITE_API_URL || "nothing"}).`);
      }
    }

    return {
      name: "Pinned Tab Save & Sync",
      // The store's short description (132 characters max); keep in step with CHROMEWEBSTORE.md
      description: "Save groups of pinned tabs, switch between them in one click and sync them across your browsers.",
      ...(env.browser === "firefox"
        ? {
            // Firefox signs in through browser.identity (its sign-in window works with password managers)
            permissions: ["tabs", "storage", "identity"],
            // gecko id is required for a stable Firefox identity origin
            browser_specific_settings: {
              gecko: {
                id: "pinned-tab-save-and-sync@pinnedtabsaveandsync.com",
                // data_collection_permissions (140); Tailwind 4's CSS needs 128
                strict_min_version: "140.0",
                // Shown at install: synced tab URLs, and the account sign-in token
                data_collection_permissions: { required: ["browsingActivity", "authenticationInfo"] },
              },
            },
          }
        : {
            // Chrome / Edge sign in from a normal tab; only the website may message the extension.
            // externally_connectable is not a permission, so it shows no install warning.
            permissions: ["tabs", "storage"],
            minimum_chrome_version: "111", // Tailwind 4's CSS (oklch, @property, color-mix)
            externally_connectable: { matches: [`${authOrigin}/*`] },
          }),
    };
  },
  vite: (env: ConfigEnv) => ({
    plugins: [tailwindcss()],
    // Release builds drop debug logging; console.error and console.warn are kept
    build: { rolldownOptions: { treeshake: { manualPureFunctions: env.mode === "production" ? ["console.log"] : [] } } },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./"),
      },
    },
  }),
});
