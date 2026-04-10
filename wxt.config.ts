import { defineConfig } from "wxt";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: {
    permissions: ["tabs", "storage", "scripting"],
    name: "Pinned Tab Save & Sync",
    host_permissions: [
      "http://localhost:8000/*",
      "http://127.0.0.1:8000/*",
      "http://localhost:8001/*",
      "http://127.0.0.1:8001/*",
      "https://pinnedtabsaveandsync.com/*",
      "https://api.pinnedtabsaveandsync.com/*",
    ],
  },
  vite: () => ({
    plugins: [tailwindcss()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./"),
      },
    },
  }),
});
