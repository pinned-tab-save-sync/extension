# AGENTS.md

## Project Overview

Browser extension built with WXT (cross-browser extension framework) and React. The extension allows users to save and restore groups of pinned browser tabs, and syncs those groups to the API when the user is signed in.

**Tech Stack:** WXT, React 19, TypeScript, TailwindCSS 4, shadcn/ui (Radix + CVA), dnd-kit, lucide-react

## Common Commands

```bash
npm run dev              # Start dev server for Chrome
npm run dev:firefox      # Start dev server for Firefox
npm run build            # Build for Chrome
npm run build:firefox    # Build for Firefox
npm run zip              # Create Chrome extension ZIP for distribution
npm run zip:firefox      # Create Firefox extension ZIP
npm run compile          # Type-check without emitting files
```

There is no test suite or lint script. Formatting uses Prettier (`.prettierrc`, print width 150).

## Environment Variables

Copy `.env.example` to `.env`:

```
VITE_AUTH_URL=http://localhost:8000    # Website URL - used for extension auth pages
VITE_API_URL=http://localhost:8001/v1  # API URL - used for all API calls
```

Both default to the localhost values above if unset. Production hosts (`pinnedtabsaveandsync.com`, `api.pinnedtabsaveandsync.com`) are listed in `host_permissions` and the auth-bridge `matches` in addition to localhost.

## Architecture

### Entry Points (`entrypoints/`)

WXT organizes extension code by entry points:

- **`popup/`** - Extension popup UI (React app)
  - `App.tsx` - Main component; composes the hooks and components below
  - `main.tsx` / `index.html` - React DOM initialization
  - `hooks/useAuth.ts` - Auth state; opens website login/register tabs, watches `browser.storage.onChanged` for the token
  - `hooks/useGroups.ts` - Groups state, local storage persistence, per-window active group, API load + debounced sync
  - `hooks/useTheme.ts` - Theme preference (`system` / `light` / `dark`) with system dark-mode detection
  - `components/` - `AuthScreen`, `Footer` (user + sync status), `SortableGroupList` / `SortableGroupItem` (dnd-kit drag reorder), `ThemeToggle`
- **`background.ts`** - Background service worker. Handles auth token capture, per-window active group cleanup, and startup restoration of the last-used tab group via `runtime.onStartup`.
- **`auth-bridge.content.ts`** - Content script matched on `/auth/extension/*` pages of the website. Listens for `window.postMessage` events of type `EXTENSION_AUTH_SUCCESS` and forwards them to the background as `AUTH_TOKEN_RECEIVED`.

### Shared Code (`lib/`)

- `types.ts` - `User`, `PinnedTab`, `TabGroup`, `TabGroups`, `SyncStatus`, API error shapes
- `api/client.ts` - `ApiClient` (fetch wrapper). Adds the Bearer token, throws `ApiClientError` on non-2xx and `NetworkError` on fetch failure. A `401` clears the stored token and user.
- `api/auth.ts` - `logout()`, `getCurrentUser()`
- `api/tabs.ts` - `fetchTabs()` (`GET /pinned-tabs`), `syncTabs()` (`POST /pinned-tabs/sync`)
- `storage/keys.ts` - `STORAGE_KEYS` constants and `ThemePreference` type
- `storage/auth.ts` - Get/set/clear helpers for the auth token and stored user
- `sync.ts` - `groupsToTabs` / `tabsToGroups` converters between the local `TabGroups` shape and the API's flat tab list, plus `debouncedSync` (300ms)
- `utils.ts` - `cn()` class-name helper (shadcn)

### UI Components (`components/ui/`)

shadcn/ui primitives (`button.tsx`, `input.tsx`) configured via `components.json` (style `new-york`, base colour `neutral`, CSS variables). Add new primitives here rather than hand-rolling them. Global styles live in `assets/tailwind.css`.

### Extension Configuration (`wxt.config.ts`)

Defines manifest properties and permissions:
- `tabs` permission - Query and manipulate browser tabs
- `storage` permission - Persist tab groups to browser local storage
- `scripting` permission - Inject the token-extraction script into the verified page
- `host_permissions` - Localhost (8000/8001) and production website/API hosts

### Data Model

Tab groups are stored in `browser.storage.local`:
```typescript
type TabGroups = { [groupName: string]: string[] }  // name -> array of URLs
```

Storage keys (see `lib/storage/keys.ts`):
- `tabGroups` - All saved tab groups
- `groupOrder` - Ordered array of group names for display
- `activeGroupsByWindow` - Map of `windowId -> groupName` tracking which group is loaded per window
- `startupGroup` - The last group loaded in any window; restored on browser launch via `runtime.onStartup`
- `authToken` / `storedUser` - Auth credentials
- `theme` - UI theme preference
- `activeGroupName` - Legacy single-window key; only cleared on logout, no longer written

### Auth Flow

1. Popup opens `VITE_AUTH_URL/auth/extension/login` (or `/register`) in a new tab.
2. When a tab reaches `VITE_AUTH_URL/auth/extension/verified`, `background.ts` uses `browser.scripting.executeScript` to read the Inertia page props from `#app[data-page]` and send `{ token, user }` to the background as an `AUTH_TOKEN_RECEIVED` message.
3. `auth-bridge.content.ts` provides a second path: the website can `postMessage` an `EXTENSION_AUTH_SUCCESS` event, which the content script forwards as the same message.
4. The background stores the token and user in `browser.storage.local`. The popup's `useAuth` hook picks this up via `browser.storage.onChanged`.
5. Logout calls `POST /logout`, then clears the token, user, and local groups.

### Sync Behaviour

`useGroups` implements an API-first strategy on login:
- If the API returns groups, they replace local storage.
- If the API is empty but local groups exist, local groups are pushed to the API.
- After that initial load, any change to `groups` or `groupOrder` triggers a debounced `POST /pinned-tabs/sync` (bulk replace).

Sync never runs before the initial API load completes. A `NetworkError` sets `isOffline` and shows "Working offline" in the footer; other errors surface their message with a retry action.

### Startup Behaviour

On browser launch, `background.ts` reads `startupGroup` and restores that group's tabs in the focused window, removing any pinned tabs Chrome may have session-restored across multiple windows. This prevents tab sprawl after hard shutdowns. The `startupGroup` value is updated automatically whenever any group is loaded. The background also prunes `activeGroupsByWindow` entries for windows that no longer exist and removes an entry when its window closes.

## Browser API Usage

Uses the WebExtension API via the `browser` global (WXT polyfills this for cross-browser compatibility):
- `browser.tabs.query({ pinned: true })` - Get current pinned tabs
- `browser.tabs.create({ url, pinned: true })` - Create pinned tab
- `browser.tabs.remove(tabId)` - Remove tab
- `browser.tabs.onUpdated` - Detect the auth verified page loading
- `browser.scripting.executeScript` - Inject the token-extraction script
- `browser.storage.local.get/set()` / `browser.storage.onChanged` - Persist data and react to changes
- `browser.windows.getAll/getCurrent()` / `browser.windows.onRemoved` - Multi-window support
- `browser.runtime.onMessage` - Receive auth messages from injected/content scripts
- `browser.runtime.onStartup` - Fires once per browser launch (not on service worker restarts)

## Path Aliases

`@/*` resolves to the project root (configured in `tsconfig.json` and mirrored in `wxt.config.ts` for Vite).
