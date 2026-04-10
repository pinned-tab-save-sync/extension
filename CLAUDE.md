# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Browser extension built with WXT (cross-browser extension framework) and React. The extension allows users to save and restore groups of pinned browser tabs.

**Tech Stack:** WXT, React 19, TypeScript, TailwindCSS 4

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

## Architecture

### Entry Points (`entrypoints/`)

WXT organizes extension code by entry points:

- **`popup/`** - Extension popup UI (React app)
  - `App.tsx` - Main component with all current functionality
  - `main.tsx` - React DOM initialization
  - `index.html` - HTML template
- **`background.ts`** - Background service worker. Handles auth token injection, window cleanup, and startup restoration of the last-used tab group via `runtime.onStartup`.
- **`content.ts`** - Content script injected into pages (placeholder)

### Extension Configuration (`wxt.config.ts`)

Defines manifest properties and permissions:
- `tabs` permission - Query and manipulate browser tabs
- `storage` permission - Persist tab groups to browser local storage

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

### Startup Behaviour

On browser launch, `background.ts` reads `startupGroup` and restores that group's tabs in the focused window, removing any pinned tabs Chrome may have session-restored across multiple windows. This prevents tab sprawl after hard shutdowns. The `startupGroup` value is updated automatically whenever any group is loaded.

## Browser API Usage

Uses the WebExtension API via the `browser` global (WXT polyfills this for cross-browser compatibility):
- `browser.tabs.query({ pinned: true })` - Get current pinned tabs
- `browser.tabs.create({ url, pinned: true })` - Create pinned tab
- `browser.tabs.remove(tabId)` - Remove tab
- `browser.storage.local.get/set()` - Persist data
- `browser.windows.getAll/getCurrent()` - Multi-window support
- `browser.runtime.onStartup` - Fires once per browser launch (not on service worker restarts)

## Path Aliases

`@/*` resolves to the project root (configured in `tsconfig.json`).
