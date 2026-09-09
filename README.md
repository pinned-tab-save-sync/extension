# Pinned Tab Save & Sync

Browser extension that saves groups of pinned tabs and restores them on demand. Sign in to sync your groups across devices.

Part of a three-project setup:

- **extension** (this repo) - WXT + React browser extension
- **api** - Stores and syncs tab groups (not currently public)
- **website** - Handles extension sign-in and the user dashboard (not currently public)

## Features

- Save the current window's pinned tabs as a named group
- Load a group into the current window, replacing its pinned tabs
- Track a different active group per browser window
- Reorder groups by drag and drop
- Restore the last-used group on browser launch, cleaning up session-restored pinned tabs
- Sync groups to the API when signed in, with offline fallback to local storage
- Light, dark, and system theme

## Requirements

- Node.js 20+
- Chrome or Firefox
- The `api` and `website` projects running locally for sign-in and sync (optional for local-only use)

## Setup

```bash
npm install
cp .env.example .env
```

`.env` values:

```
VITE_AUTH_URL=http://localhost:8000    # Website URL - extension auth pages
VITE_API_URL=http://localhost:8001/v1  # API URL - all API calls
```

Both default to these values if unset.

## Development

```bash
npm run dev              # Chrome, with hot reload
npm run dev:firefox      # Firefox
npm run compile          # Type-check
```

WXT opens a browser with the extension loaded. To load a build manually, point Chrome's "Load unpacked" at `.output/chrome-mv3` or Firefox's "Load
Temporary Add-on" at `.output/firefox-mv2`.

## Building

```bash
npm run build            # Chrome build in .output/chrome-mv3
npm run build:firefox    # Firefox build in .output/firefox-mv2
npm run zip              # Chrome ZIP for store upload
npm run zip:firefox      # Firefox ZIP for store upload
```

## How It Works

**Storage.** Groups are kept in `browser.storage.local` as a map of group name to URL list, plus an ordering array and a per-window map of which group
is active.

**Sign-in.** The popup opens the website's extension login page. When the verified page loads, the background service worker reads the API token from
the page and stores it. The popup picks up the change and switches to the signed-in view.

**Sync.** On sign-in the extension loads groups from the API. If the API has data it becomes the source of truth. If the API is empty, local groups
are pushed up. After that, every change is sent to the API with a short debounce. Network failures switch the footer to "Working offline" and keep
changes locally.

**Startup.** On browser launch the background worker removes any pinned tabs the browser restored and reopens the last-used group in the focused
window.

## Project Layout

```
entrypoints/
  popup/                 # React popup (App, hooks, components)
  background.ts          # Service worker: auth capture, startup restore, window cleanup
  auth-bridge.content.ts # Content script forwarding auth messages from the website
lib/
  api/                   # Fetch client and API calls
  storage/               # Storage keys and auth helpers
  sync.ts                # Converters between local groups and API tabs
  types.ts
components/ui/           # shadcn/ui primitives
assets/tailwind.css      # Global styles
wxt.config.ts            # Manifest and permissions
```

## License

MIT. See [LICENSE](LICENSE).
