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
- **`background.ts`** - Background service worker (placeholder)
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

Two storage keys:
- `tabGroups` - All saved tab groups
- `activeGroupName` - Currently loaded group name

## Browser API Usage

Uses the WebExtension API via the `browser` global (WXT polyfills this for cross-browser compatibility):
- `browser.tabs.query({ pinned: true })` - Get current pinned tabs
- `browser.tabs.create({ url, pinned: true })` - Create pinned tab
- `browser.tabs.remove(tabId)` - Remove tab
- `browser.storage.local.get/set()` - Persist data

## Path Aliases

`@/*` resolves to the project root (configured in `tsconfig.json`).
