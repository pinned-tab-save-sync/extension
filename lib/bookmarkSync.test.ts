import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";
import {
  BOOKMARK_FOLDER_TITLE,
  fallbackBookmarkTitle,
  queueBookmarkSync,
  registerBookmarkSync,
  syncGroupsToBookmarks,
  whenBookmarkSyncIdle,
} from "./bookmarkSync";
import { STORAGE_KEYS } from "./storage/keys";
import { installFakeBookmarks, type FakeBookmarks } from "./testing/fakeBookmarks";
import type { TabGroups } from "./types";

let bookmarks: FakeBookmarks;

/** The group folders inside the synced "Pinned Tabs" folder. */
function syncedFolders() {
  const root = bookmarks.outline().find((node) => node.title === BOOKMARK_FOLDER_TITLE);
  return root?.children;
}

/** Wait for the bookmark work started by a storage or permission change to finish. */
async function settle(): Promise<void> {
  // Storage change events are delivered after the write resolves
  await new Promise((resolve) => setTimeout(resolve, 0));
  await whenBookmarkSyncIdle();
}

/** Start the background's bookmark sync in a browser that has, or has not yet, granted the permission. */
function startBackground(options: { isPermissionGranted: boolean } = { isPermissionGranted: true }): void {
  vi.restoreAllMocks();
  bookmarks = installFakeBookmarks(options);
  vi.spyOn(browser.tabs, "query").mockResolvedValue([] as never);
  registerBookmarkSync();
}

async function saveGroups(groups: TabGroups, order: string[] = Object.keys(groups)): Promise<void> {
  await browser.storage.local.set({ [STORAGE_KEYS.TAB_GROUPS]: groups, [STORAGE_KEYS.GROUP_ORDER]: order });
}

beforeEach(() => {
  fakeBrowser.reset();
  bookmarks = installFakeBookmarks({ isPermissionGranted: true });
  vi.spyOn(browser.tabs, "query").mockResolvedValue([] as never);
});

afterEach(async () => {
  await settle();
  vi.restoreAllMocks();
});

describe("fallbackBookmarkTitle", () => {
  it.each([
    ["https://example.com/", "example.com"],
    ["https://example.com/inbox/", "example.com/inbox"],
    ["http://localhost:3000/app?tab=1", "localhost:3000/app"],
    ["chrome://extensions/", "chrome://extensions/"],
    ["not a url", "not a url"],
  ])("names %s as %s", (url, title) => {
    expect(fallbackBookmarkTitle(url)).toBe(title);
  });
});

describe("syncGroupsToBookmarks", () => {
  it("creates the folder with a folder per group, in order, holding the group's links", async () => {
    await syncGroupsToBookmarks({ Work: ["https://a.example/inbox", "https://b.example"], Home: ["https://c.example"] }, ["Home", "Work"], undefined);

    expect(bookmarks.outline()).toEqual([
      {
        title: "Pinned Tabs",
        children: [
          { title: "Home", children: [{ title: "c.example", url: "https://c.example/" }] },
          {
            title: "Work",
            children: [
              { title: "a.example/inbox", url: "https://a.example/inbox" },
              { title: "b.example", url: "https://b.example/" },
            ],
          },
        ],
      },
    ]);
  });

  it("adds groups the order does not list after the ordered ones", async () => {
    await syncGroupsToBookmarks({ Work: ["https://a.example"], Home: ["https://c.example"] }, ["Home"], undefined);

    expect(syncedFolders()?.map((folder) => folder.title)).toEqual(["Home", "Work"]);
  });

  it("updates the same folder on later syncs, keeping bookmarks that have not changed", async () => {
    const folderId = await syncGroupsToBookmarks(
      { Work: ["https://a.example", "https://b.example"], Home: ["https://c.example"] },
      ["Work", "Home"],
      undefined,
    );
    vi.mocked(browser.bookmarks.create).mockClear();

    const nextFolderId = await syncGroupsToBookmarks(
      { Home: ["https://c.example", "https://d.example"], Play: ["https://e.example"], Work: ["https://b.example", "https://a.example"] },
      ["Play", "Home", "Work"],
      folderId,
    );

    expect(nextFolderId).toBe(folderId);
    expect(syncedFolders()).toEqual([
      { title: "Play", children: [{ title: "e.example", url: "https://e.example/" }] },
      {
        title: "Home",
        children: [
          { title: "c.example", url: "https://c.example/" },
          { title: "d.example", url: "https://d.example/" },
        ],
      },
      {
        title: "Work",
        children: [
          { title: "b.example", url: "https://b.example/" },
          { title: "a.example", url: "https://a.example/" },
        ],
      },
    ]);
    // Only the new group, its link and Home's new link: nothing that already matched was recreated
    expect(browser.bookmarks.create).toHaveBeenCalledTimes(3);
  });

  it("removes groups, links and anything else that is no longer in the groups", async () => {
    const folderId = await syncGroupsToBookmarks(
      { Work: ["https://a.example", "https://b.example"], Home: ["https://c.example"] },
      ["Work", "Home"],
      undefined,
    );
    await browser.bookmarks.create({ parentId: folderId, title: "Added by hand", url: "https://stray.example" });

    await syncGroupsToBookmarks({ Work: ["https://b.example"] }, ["Work"], folderId);

    expect(syncedFolders()).toEqual([{ title: "Work", children: [{ title: "b.example", url: "https://b.example/" }] }]);
  });

  it("keeps a link that appears twice in a group twice", async () => {
    const folderId = await syncGroupsToBookmarks({ Work: ["https://a.example", "https://a.example"] }, ["Work"], undefined);
    await syncGroupsToBookmarks({ Work: ["https://a.example", "https://a.example"] }, ["Work"], folderId);

    expect(syncedFolders()?.[0]?.children).toHaveLength(2);
  });

  it("follows the folder when the user has moved or renamed it", async () => {
    const folderId = await syncGroupsToBookmarks({ Work: ["https://a.example"] }, ["Work"], undefined);
    const elsewhere = await browser.bookmarks.create({ title: "My folder" });
    await browser.bookmarks.move(folderId, { parentId: elsewhere.id });
    await browser.bookmarks.update(folderId, { title: "Tabs" });

    await syncGroupsToBookmarks({ Home: ["https://c.example"] }, ["Home"], folderId);

    expect(bookmarks.outline()).toEqual([
      {
        title: "My folder",
        children: [{ title: "Tabs", children: [{ title: "Home", children: [{ title: "c.example", url: "https://c.example/" }] }] }],
      },
    ]);
  });

  it("makes a new folder when the old one was deleted, leaving a folder of the same name alone", async () => {
    const folderId = await syncGroupsToBookmarks({ Work: ["https://a.example"] }, ["Work"], undefined);
    await browser.bookmarks.removeTree(folderId);
    const usersOwn = await browser.bookmarks.create({ title: BOOKMARK_FOLDER_TITLE });
    await browser.bookmarks.create({ parentId: usersOwn.id, title: "Mine", url: "https://mine.example" });

    const nextFolderId = await syncGroupsToBookmarks({ Work: ["https://a.example"] }, ["Work"], folderId);

    expect(nextFolderId).not.toBe(usersOwn.id);
    expect(bookmarks.outline(usersOwn.id)).toEqual([{ title: "Mine", url: "https://mine.example/" }]);
    expect(bookmarks.outline(nextFolderId)).toEqual([{ title: "Work", children: [{ title: "a.example", url: "https://a.example/" }] }]);
  });

  it("never uses one of the browser's own folders, even if its id was stored", async () => {
    await browser.bookmarks.create({ title: "Mine", url: "https://mine.example" });

    const folderId = await syncGroupsToBookmarks({ Work: ["https://a.example"] }, ["Work"], bookmarks.otherBookmarksId);

    expect(folderId).not.toBe(bookmarks.otherBookmarksId);
    expect(bookmarks.outline()[0]).toEqual({ title: "Mine", url: "https://mine.example/" });
  });

  it("names a bookmark after its open tab, and renames one made before the title was known", async () => {
    const folderId = await syncGroupsToBookmarks({ Work: ["https://a.example"] }, ["Work"], undefined);
    vi.mocked(browser.tabs.query).mockResolvedValue([
      { url: "https://a.example/", title: "Inbox" },
      { url: "https://b.example/", title: "Calendar" },
    ] as never);

    await syncGroupsToBookmarks({ Work: ["https://a.example", "https://b.example"] }, ["Work"], folderId);

    expect(syncedFolders()?.[0]?.children).toEqual([
      { title: "Inbox", url: "https://a.example/" },
      { title: "Calendar", url: "https://b.example/" },
    ]);
  });

  it("keeps a title the user gave a bookmark", async () => {
    const folderId = await syncGroupsToBookmarks({ Work: ["https://a.example"] }, ["Work"], undefined);
    const [workFolder] = await browser.bookmarks.getChildren(folderId);
    const [bookmark] = await browser.bookmarks.getChildren(workFolder!.id);
    await browser.bookmarks.update(bookmark!.id, { title: "My mail" });
    vi.mocked(browser.tabs.query).mockResolvedValue([{ url: "https://a.example/", title: "Inbox" }] as never);

    await syncGroupsToBookmarks({ Work: ["https://a.example"] }, ["Work"], folderId);

    expect(syncedFolders()?.[0]?.children).toEqual([{ title: "My mail", url: "https://a.example/" }]);
  });

  it("skips a link the browser refuses to bookmark and still adds the rest", async () => {
    await syncGroupsToBookmarks({ Work: ["not a url", "https://a.example"] }, ["Work"], undefined);

    expect(syncedFolders()?.[0]?.children).toEqual([{ title: "a.example", url: "https://a.example/" }]);
  });

  it.each(["javascript:alert(1)", "data:text/html,<script>alert(1)</script>", "vbscript:msgbox(1)"])("never bookmarks %s", async (unsafeUrl) => {
    await syncGroupsToBookmarks({ Work: [unsafeUrl, "https://a.example"] }, ["Work"], undefined);

    expect(syncedFolders()?.[0]?.children).toEqual([{ title: "a.example", url: "https://a.example/" }]);
  });

  it("treats group names like constructor as ordinary groups", async () => {
    const groups = Object.assign(Object.create(null) as TabGroups, { constructor: ["https://a.example"], ["__proto__"]: ["https://b.example"] });

    await syncGroupsToBookmarks(groups, ["constructor", "__proto__", "toString"], undefined);

    expect(syncedFolders()?.map((folder) => folder.title)).toEqual(["constructor", "__proto__"]);
  });
});

describe("the background's bookmark sync", () => {
  it("does nothing while the setting is off", async () => {
    startBackground({ isPermissionGranted: false });
    await saveGroups({ Work: ["https://a.example"] });
    await settle();

    expect(bookmarks.outline()).toEqual([]);
  });

  it("waits for the browser to grant the permission, then syncs", async () => {
    startBackground({ isPermissionGranted: false });
    await saveGroups({ Work: ["https://a.example"] });

    await browser.storage.local.set({ [STORAGE_KEYS.BOOKMARK_SYNC]: true });
    await settle();
    expect(bookmarks.outline()).toEqual([]);

    bookmarks.setPermission(true);
    await settle();

    expect(syncedFolders()).toEqual([{ title: "Work", children: [{ title: "a.example", url: "https://a.example/" }] }]);
  });

  it("syncs every change to the groups into the same folder", async () => {
    startBackground();
    await browser.storage.local.set({ [STORAGE_KEYS.BOOKMARK_SYNC]: true });
    await saveGroups({ Work: ["https://a.example"] });
    await saveGroups({ Work: ["https://a.example"], Home: ["https://c.example"] }, ["Home", "Work"]);
    await settle();

    expect(bookmarks.outline()).toHaveLength(1);
    expect(syncedFolders()?.map((folder) => folder.title)).toEqual(["Home", "Work"]);
  });

  it("removes the folder but keeps the permission when switched off", async () => {
    startBackground();
    await browser.storage.local.set({ [STORAGE_KEYS.BOOKMARK_SYNC]: true });
    await saveGroups({ Work: ["https://a.example"] });
    await settle();
    expect(syncedFolders()).toHaveLength(1);

    await browser.storage.local.set({ [STORAGE_KEYS.BOOKMARK_SYNC]: false });
    await settle();

    expect(bookmarks.outline()).toEqual([]);
    expect(bookmarks.hasPermission()).toBe(true);
    expect(await browser.storage.local.get(STORAGE_KEYS.BOOKMARK_SYNC_FOLDER_ID)).toEqual({});
  });

  it("keeps a permission granted just before the setting is stored", async () => {
    startBackground({ isPermissionGranted: false });
    await saveGroups({ Work: ["https://a.example"] });

    bookmarks.setPermission(true);
    await settle();
    expect(bookmarks.hasPermission()).toBe(true);

    await browser.storage.local.set({ [STORAGE_KEYS.BOOKMARK_SYNC]: true });
    await settle();

    expect(syncedFolders()).toHaveLength(1);
  });

  it("reuses the folder after a sync that was interrupted, and still removes it when switched off", async () => {
    startBackground();
    vi.mocked(browser.bookmarks.getChildren).mockRejectedValueOnce(new Error("Bookmark changed underneath"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await browser.storage.local.set({ [STORAGE_KEYS.BOOKMARK_SYNC]: true });
    await saveGroups({ Work: ["https://a.example"] });
    await settle();

    await saveGroups({ Work: ["https://a.example"], Home: ["https://c.example"] });
    await settle();
    expect(bookmarks.outline()).toHaveLength(1);
    expect(syncedFolders()).toHaveLength(2);

    await browser.storage.local.set({ [STORAGE_KEYS.BOOKMARK_SYNC]: false });
    await settle();
    expect(bookmarks.outline()).toEqual([]);
  });

  it("removes the folder when all local data is deleted", async () => {
    startBackground();
    await browser.storage.local.set({ [STORAGE_KEYS.BOOKMARK_SYNC]: true });
    await saveGroups({ Work: ["https://a.example"] });
    await settle();
    expect(syncedFolders()).toHaveLength(1);

    await browser.storage.local.clear();
    await settle();

    expect(bookmarks.outline()).toEqual([]);
    expect(bookmarks.hasPermission()).toBe(true);
  });

  it("leaves other bookmarks alone when switched off", async () => {
    startBackground();
    await browser.bookmarks.create({ title: "Mine", url: "https://mine.example" });
    await browser.storage.local.set({ [STORAGE_KEYS.BOOKMARK_SYNC]: true });
    await saveGroups({ Work: ["https://a.example"] });
    await settle();
    expect(syncedFolders()).toHaveLength(1);

    await browser.storage.local.set({ [STORAGE_KEYS.BOOKMARK_SYNC]: false });
    await settle();

    expect(bookmarks.outline()).toEqual([{ title: "Mine", url: "https://mine.example/" }]);
  });

  it("switches the setting off when the permission is taken away in the browser's settings", async () => {
    startBackground();
    await browser.storage.local.set({ [STORAGE_KEYS.BOOKMARK_SYNC]: true });
    await settle();

    bookmarks.setPermission(false);

    await vi.waitFor(async () => {
      expect(await browser.storage.local.get(STORAGE_KEYS.BOOKMARK_SYNC)).toEqual({ [STORAGE_KEYS.BOOKMARK_SYNC]: false });
    });
  });

  it("leaves the folder in place when the permission is taken away, and picks it up again later", async () => {
    startBackground();
    await browser.storage.local.set({ [STORAGE_KEYS.BOOKMARK_SYNC]: true });
    await saveGroups({ Work: ["https://a.example"] });
    await settle();

    bookmarks.setPermission(false);
    await settle();
    expect(syncedFolders()).toHaveLength(1);

    await saveGroups({ Home: ["https://c.example"] });
    await browser.storage.local.set({ [STORAGE_KEYS.BOOKMARK_SYNC]: true });
    bookmarks.setPermission(true);
    await settle();

    expect(bookmarks.outline()).toHaveLength(1);
    expect(syncedFolders()?.map((folder) => folder.title)).toEqual(["Home"]);
  });

  it("covers several quick changes with one sync", async () => {
    startBackground();
    await browser.storage.local.set({ [STORAGE_KEYS.BOOKMARK_SYNC]: true });
    await settle();
    vi.mocked(browser.tabs.query).mockClear();

    void queueBookmarkSync();
    void queueBookmarkSync();
    void queueBookmarkSync();
    await settle();

    expect(browser.tabs.query).toHaveBeenCalledTimes(1);
  });

  it("ignores storage changes that are not the groups or the setting", async () => {
    startBackground();
    await browser.storage.local.set({ [STORAGE_KEYS.BOOKMARK_SYNC]: true });
    await settle();
    vi.mocked(browser.bookmarks.getChildren).mockClear();

    await browser.storage.local.set({ [STORAGE_KEYS.THEME]: "dark" });
    await settle();

    expect(browser.bookmarks.getChildren).not.toHaveBeenCalled();
  });
});
