# Pinned Tab Save & Sync

Pinned Tab Save & Sync saves your pinned tabs into named groups so you can reopen them anytime with one click.

You can grab the official release for Chrome, Firefox, or Edge via [pinnedtabsaveandsync.com](https://pinnedtabsaveandsync.com/). Out of 
the box, it works locally in one browser, or you can create an account to sync your tabs across multiple browsers.

Prefer to keep things strictly on-site? Building the open-source extension from this repo gives you a completely offline version. Your 
data stays in your browser - no syncing, no favicons, and no sign-up needed.

## Features

- **Save & Switch:** Capture a window's pinned tabs as a named group and swap between them in one click.
- **Multi-Window Support:** Open separate browser windows and load a different group into each.
- **Two-Way Updates:** Save your current tab changes back to the group, or discard them to reset your window.
- **Drag-and-Drop Organization:** Easily reorder your groups however you like.
- **Auto-Restore on Startup:** Automatically load the last group you were using when you open your browser.
- **Flexible UI:** Choose between light, dark, or system themes, and toggle a compact layout to save space.

## Requirements

- Node.js 22 or later
- Chrome 111+, Microsoft Edge, or Firefox 140+

## Build it

```bash
git clone https://github.com/pinned-tab-save-sync/extension.git
cd extension
npm install
npm run build            # Chrome and Edge: .output/chrome-mv3
npm run build:firefox    # Firefox: .output/firefox-mv2
```

No configuration is needed. The build is local only by default: nothing leaves your browser, and the extension has no sign-in or sync.

## Install it

### Chrome

1. Open `chrome://extensions`
2. Switch on **Developer mode** (top right)
3. Click **Load unpacked** and choose the `.output/chrome-mv3` folder
4. Pin the extension to the toolbar from the puzzle-piece menu

After rebuilding, click the reload icon on the extension's card to pick up the changes.

### Microsoft Edge

The same build works in Edge: open `edge://extensions`, switch on **Developer mode**, click **Load unpacked** and choose `.output/chrome-mv3`.

### Firefox

1. Open `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on...** and choose `.output/firefox-mv2/manifest.json`

Firefox removes temporary add-ons when it closes, so load it again after a restart. Your saved groups are kept.

## Use it

1. Pin the tabs you want to keep together
2. Click the extension icon, type a name and save the group
3. Click **Open** on a saved group to swap the window's pinned tabs for that group
4. On the group loaded in a window, **Update** saves the window's current pinned tabs to it and the reset button puts the saved tabs back

## Development

```bash
npm run dev              # Chrome with hot reload
npm run dev:firefox      # Firefox with hot reload
npm run compile          # Type-check
npm test                 # Unit tests (Vitest)
```

`npm run dev` opens a browser with the extension already loaded and reloads it as you edit.

### Project layout

```
entrypoints/
  popup/                 # The popup: App, hooks and components (React)
  background.ts          # Service worker: restores the last-used group on browser start
lib/                     # Shared code and its tests (storage, tabs, limits, build mode)
components/ui/           # shadcn/ui primitives
assets/tailwind.css      # Global styles and design tokens
public/icon/             # Icons and logos
wxt.config.ts            # Manifest, permissions and build settings
```

The extension is built with [WXT](https://wxt.dev), React, TypeScript and Tailwind CSS.

## How it works

Groups are kept in `browser.storage.local` as a map of group name to a list of URLs, plus the order they are shown in. Which group is loaded in
each window is kept in `browser.storage.session`, so it is forgotten when the browser closes. On browser start the background script
reopens the last-used group in the focused window and removes the pinned tabs the browser restored itself.

The extension asks for two permissions: `tabs`, to read the addresses of your pinned tabs and to open and close pinned tabs, and `storage`, to
keep your groups.

## Contributing

Bug reports and pull requests are welcome.

- **Found a bug or have an idea?** Open an [issue](https://github.com/pinned-tab-save-sync/extension/issues). For a bug, say which browser and
  version you use and the steps that lead to it.
- **Sending a pull request?** For anything larger than a small fix, open an issue first so we can agree on the approach.
  - Branch from `main` and keep the change focused on one thing
  - Follow the existing code style; format the files you change with Prettier (`npx prettier --write <file>`)
  - Add or update tests in `lib/` for logic changes
  - Make sure `npm run compile` and `npm test` pass
  - Check the change in Chrome, Edge and Firefox - all three are supported, and they do not always behave the same
- AI led PRs are welcome, especially if you're using it to ensure you include good quality tests with good coverage. But try to understand what you're
  submitting, submissions that don't follow repo standards or include poor or no tests are likely to be rejected.

## License

AGPL 3.0. See [LICENSE](LICENSE).
