# AGENTS.md

Guidance for AI coding agents and contributors working in this repository.

## Project Overview

Browser extension built with WXT (cross-browser extension framework) and React. It saves the pinned tabs in a window as a named group and restores any group on demand. This repository is the open source extension: the default build is **local only**, keeping everything in the browser with no account, sign-in or sync.

**Tech Stack:** WXT 0.21 (Vite 8), React 19, TypeScript, TailwindCSS 4, shadcn/ui (Radix + CVA), dnd-kit, lucide-react

## Supported Browsers

The extension must work in Chrome, Firefox **and Microsoft Edge**. Every change, especially anything touching the manifest or browser APIs, must be checked in all three. Edge is Chromium-based and uses the `chrome-mv3` build, but do not assume Chrome behaviour carries over.

## Common Commands

```bash
npm run dev              # Start dev server for Chrome
npm run dev:firefox      # Start dev server for Firefox
npm run build            # Build for Chrome and Edge (.output/chrome-mv3)
npm run build:firefox    # Build for Firefox (.output/firefox-mv2)
npm run compile          # Type-check without emitting files
npm test                 # Run Vitest unit tests
```

Formatting uses Prettier (`.prettierrc`, print width 150). Tests are in `lib/**/*.test.ts` and run with Vitest; keep them out of `entrypoints/`, where WXT would build them as entrypoints (`lib/background.test.ts` covers the background). In a test file, do not name a local variable `browser`: it shadows the auto-imported `browser` global for the whole file.

`vite`, `typescript` and `web-ext` are WXT peer dependencies and live in `devDependencies` (`web-ext` is what opens the browser in dev mode). The generated `.wxt/tsconfig.json` is strict (`verbatimModuleSyntax`, `noUncheckedIndexedAccess`): import types with `import type`, and handle `undefined` from index access.

## Build Mode

`IS_LOCAL_ONLY` (`lib/buildMode.ts`) is true unless the build sets `VITE_LOCAL_ONLY=false`, so a clone with no `.env` builds the local-only extension. A local-only build:

- never signs in and makes no network requests: no account, no sync, and no favicons loaded from sites (the save bar shows lettered circles instead)
- shows no sync status and no account footer; the settings view has only Appearance and Local data
- asks for only the `tabs` and `storage` permissions

The repository also holds the code for the hosted service's sign-in and sync (`lib/api/`, `lib/auth/`, `lib/sync.ts`, `lib/limits.ts`, parts of the popup hooks and components). It is switched on only by `VITE_LOCAL_ONLY=false`, needs that service's servers, and cannot be run from this repository alone. When working here:

- Keep local-only behaviour working with no configuration, and never make a local-only build contact a server.
- Gate anything that only makes sense with an account on `IS_LOCAL_ONLY`.
- Do not break the sync code paths: `npm run compile` and `npm test` cover both modes.
- This file documents the open source, local-only extension. Leave the hosted service's internals out of it and out of `README.md`.

## Architecture

### Entry Points (`entrypoints/`)

- **`popup/`** - The popup UI (React app)
  - `App.tsx` - Main component; composes the hooks and components below and switches to the settings view
  - `main.tsx` / `index.html` - React DOM initialization
  - `hooks/useGroups.ts` - Groups state, local storage persistence and the per-window active group
  - `hooks/useAuth.ts` - Account state; in a local-only build it is never loading and never signed in
  - `hooks/useTheme.ts` - Theme preference (`system` / `light` / `dark`) with system dark-mode detection; puts the `dark` class on `<html>` so portalled content (menus) is themed too
  - `hooks/useDensity.ts` - Layout preference (`comfortable` / `compact`); sets `data-density` on `<html>` for the `compact:` Tailwind variant
  - `hooks/usePinnedTabs.ts` - The popup window's pinned tabs, kept current while the popup is open
  - `components/` - `PopupHeader` (logo linking to the public website, `SettingsButton`), `SaveBar` (one-line save: pinned tab icons, name input, Save, and the warning line for anything that stops a save), `TabIcon` (a coloured circle with the site's first letter), `SortableGroupList` / `SortableGroupItem` (dnd-kit drag reorder; the row also renders the inline delete confirmation), `GroupRowContent` (name, tab count, "In this window" badge, Open or Update + Reset, and a menu with Delete), `UpdateGroupButton` (the row's Update: a spinner shown for at least 400ms, which turns into a tick on a green flash that fades back once saved), `SegmentedControl` (shared icon + label toggle), `ThemeToggle` and `LayoutToggle` (both in settings), `Logo` (theme-aware logo from `public/icon/`), `SettingsScreen` (appearance: theme and layout; delete all local data)
- **`background.ts`** - Background script (a service worker in Chromium). Restores the last-used tab group on browser launch via `runtime.onStartup`, forgets a window's active group when it closes, and moves data an older version stored on `runtime.onInstalled` (update).

### Shared Code (`lib/`)

- `buildMode.ts` - `IS_LOCAL_ONLY` (see Build Mode)
- `types.ts` - Shared types (`TabGroups` and others)
- `groupName.ts` - `validateGroupName` and `MAX_GROUP_NAME_LENGTH`: a new group's name is at most 50 characters with no control characters or line breaks
- `tabUrl.ts` - `isAllowedTabUrl`: only web addresses (http, https) and browser pages (`about:`, `chrome:`, `file:`...) are saved in a group or opened from one; `javascript:`, `data:` and anything else is refused
- `tabs.ts` - `replacePinnedTabs()`: opens a group's URLs as pinned tabs, then closes the tabs they replace (new tabs first, URLs refused by the browser or by `isAllowedTabUrl` skipped, old tabs closed one at a time and kept when every URL is refused); shared by the popup and the startup restore
- `dragModifiers.ts` - `keepWithinList`: dnd-kit modifier that stops a dragged group row leaving the list sideways or past its first and last positions
- `limits.ts` - `isSameGroupName` / `findMatchingGroupName`: group names are compared ignoring case, accents and trailing spaces, so saving as `work` when `Work` exists updates `Work`
- `storage/keys.ts` - `STORAGE_KEYS` constants and the preference types
- `storage/activeGroups.ts` - `getActiveGroupForWindow` / `setActiveGroupForWindow`: the group loaded in each window, one `browser.storage.session` key per window
- `localData.ts` - `deleteAllLocalData()`: clears all local and session storage
- `urls.ts` - `WEBSITE_HOME_URL` (opened from the popup logo)
- `utils.ts` - `cn()` class-name helper (shadcn)

### UI Components (`components/ui/`)

shadcn/ui primitives (`button.tsx`, `input.tsx`, `dropdown-menu.tsx`) configured via `components.json` (style `new-york`, CSS variables). Add new primitives here rather than hand-rolling them. Global styles live in `assets/tailwind.css`.

**Design tokens** (`assets/tailwind.css`): the popup's colours are CSS variables on `:root` and `.dark`, exposed to Tailwind through `@theme inline`. Beyond the shadcn set (`background`, `muted`, `primary` = brand blue, `destructive`, `border`, `input`...) there are `faint` (drag handles), `selected` / `selected-border` (the group loaded in this window), `badge` / `badge-foreground`, `tab-icon` / `tab-icon-border`, and soft status tints `success-soft`, `warning-soft` and `danger-soft` (each with `-foreground`, warning and danger also `-border`). `--scrollbar-thumb` colours the thin scrollbars, and `color-scheme` follows the theme so native controls match. Use these tokens rather than raw Tailwind palette colours so light and dark stay in step.

**Compact layout:** Settings > Layout switches between Comfortable (default) and Compact. Compact is styled with the `compact:` variant (e.g. `py-2 compact:py-1`). Add a `compact:` counterpart when adding spacing that should tighten.

The popup is 480px wide (`html, body` width) and at most 600px tall: the header and save bar stay put and the group list scrolls.

### Extension Configuration (`wxt.config.ts`)

Defines the manifest (a function of the build env, so each browser and build mode gets its own):

- `tabs` permission - Query and manipulate browser tabs
- `storage` permission - Persist tab groups to browser storage
- `minimum_chrome_version` 111 and gecko `strict_min_version` 140.0: Tailwind 4's CSS (`oklch`, `@property`, `color-mix`) needs Chrome 111 / Firefox 128, and `data_collection_permissions` needs Firefox 140
- `browser_specific_settings.gecko` (Firefox only) - A fixed add-on id, so saved groups survive reloads, and `data_collection_permissions` of `none`

Production builds drop `console.log` calls (Rolldown `treeshake.manualPureFunctions`); `console.error` and `console.warn` are kept, so use those for anything worth seeing in a release build.

### Data Model

Tab groups are stored in `browser.storage.local`:

```typescript
type TabGroups = { [groupName: string]: string[] }; // name -> array of URLs
```

A group can have any name, including `constructor` or `__proto__`: look names up with `Object.hasOwn`, or in a map made with `Object.create(null)`, never with a bare `groups[name]` truthiness check.

Storage keys (see `lib/storage/keys.ts`):

- `tabGroups` - All saved tab groups
- `groupOrder` - Ordered array of group names for display
- `startupGroup` - The last group loaded in any window; restored on browser launch
- `theme` - UI theme preference
- `density` - Popup layout preference (`comfortable` or `compact`)

Kept in `browser.storage.session` (cleared when the browser closes, or the extension is reloaded or updated):

- `activeGroup:<windowId>` - The group loaded in that window. One key per window, so the popup and the background never overwrite each other's windows

### Startup Behaviour

On browser launch, `background.ts` reads `startupGroup` and restores that group's tabs in the focused window, removing any pinned tabs the browser session-restored across its windows. The group's tabs are opened before the old pinned tabs are removed (`replacePinnedTabs`), and a URL the browser refuses to open does not stop the rest; if it refuses every URL, the restored tabs are kept and no group is marked active. `startupGroup` is updated whenever any group is loaded.

### Saving and Errors

A save checks the name (`validateGroupName`, new names only) and leaves out pinned tabs whose URL `isAllowedTabUrl` refuses, saying how many were left out. Saving, updating, deleting and reordering write to `browser.storage.local` first and update React state after. If the browser refuses a write (for example its storage is full), the reason is shown in the save bar's warning line.

### Settings Screen

The settings button in the popup header opens an inline settings view with the theme and layout toggles and a "Delete all local data" action, which asks for confirmation and then clears every saved group and setting. Open tabs are not closed.

## Browser API Usage

Uses the WebExtension API via the `browser` global (WXT polyfills this for cross-browser compatibility):

- `browser.tabs.query({ pinned: true })` - Get current pinned tabs
- `browser.tabs.create({ url, pinned: true })` - Create pinned tab
- `browser.tabs.remove(tabId)` - Remove tab
- `browser.storage.local.get/set()` / `browser.storage.onChanged` - Persist data and react to changes
- `browser.storage.session` - Per-window active groups
- `browser.windows.getAll/getCurrent()` / `browser.windows.onRemoved` - Multi-window support
- `browser.runtime.onStartup` - Fires once per browser launch (not on service worker restarts)
- `browser.runtime.onInstalled` - Runs the storage migration after an extension update

## Path Aliases

`@/*` resolves to the project root (configured in `tsconfig.json` and mirrored in `wxt.config.ts` for Vite).
