# Changelog

All notable changes to Pinned Tab Save & Sync are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and the project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-11-20

### Added

- Optional "Sync pinned tab groups to browser bookmarks" setting (Settings > Bookmarks): keeps a "Pinned Tabs" bookmark folder with one
  folder per group, in the groups' order. Off by default, set per browser, and the bookmarks permission is only asked for when the
  setting is switched on

## [1.0.0] - 2026-11-20

First public release, for Chrome, Microsoft Edge and Firefox.

### Added

- Save a window's pinned tabs as a named group and load any group back into the window in one click
- A different group can be loaded in each browser window
- Update a group from the window's current pinned tabs, or reset the window back to the saved tabs
- Drag and drop groups into the order you want
- Reopens the group you last used when the browser starts
- Light, dark and system themes, plus a compact layout
- Optional free account to sync groups across browsers and devices (official store release only); keeps working offline and asks which
  side to keep, or merges both, when two browsers disagree
- Local-only build by default when building from source: no sign-in, no sync and nothing leaves the browser

[1.1.0]: https://github.com/pinned-tab-save-sync/extension/releases/tag/v1.1.0
[1.0.0]: https://github.com/pinned-tab-save-sync/extension/releases/tag/v1.0.0
