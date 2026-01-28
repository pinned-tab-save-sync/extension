import { defineConfig } from "wxt";
import tailwindcss from "@tailwindcss/vite";

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: {
    permissions: ["tabs", "storage", "scripting"],
    name: "Pinned Tab Save & Sync",
    host_permissions: [
      "http://localhost:8000/*",
      "http://127.0.0.1:8000/*",
      "https://pinnedtabsaveandsync.mou.me/*",
      "https://pinnedtabsaveandsync.com/*",
    ],
  },
  vite: () => ({
    plugins: [tailwindcss()],
  }),
});
