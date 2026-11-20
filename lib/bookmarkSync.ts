import { STORAGE_KEYS } from "./storage/keys";
import { isAllowedTabUrl } from "./tabUrl";
import type { TabGroups } from "./types";

/** The optional permission asked for when bookmark sync is first switched on. */
export const BOOKMARKS_PERMISSION: Browser.permissions.Permissions = { permissions: ["bookmarks"] };

/** The bookmark folder that holds one folder per tab group. */
export const BOOKMARK_FOLDER_TITLE = "Pinned Tabs";

type BookmarkNode = Browser.bookmarks.BookmarkTreeNode;

/** What a bookmark or folder inside a synced folder should be. */
interface WantedBookmark {
  title: string;
  /** Missing for a folder. */
  url?: string;
}

/** A URL in the form browsers store it (e.g. with a trailing slash on a bare origin), so the same page compares equal. */
function normaliseUrl(url: string): string {
  try {
    return new URL(url).href;
  } catch {
    return url;
  }
}

/** A readable bookmark title for a URL whose page title is not known: the address without its scheme. */
export function fallbackBookmarkTitle(url: string): string {
  try {
    const { protocol, host, pathname } = new URL(url);
    if (protocol !== "http:" && protocol !== "https:") {
      return url;
    }
    return `${host}${pathname.replace(/\/$/, "")}`;
  } catch {
    return url;
  }
}

/** Whether a bookmark node is a folder (Firefox also has separators, which have no URL either). */
function isFolder(node: BookmarkNode): boolean {
  return node.url === undefined && (node as { type?: string }).type !== "separator";
}

function matches(node: BookmarkNode, wanted: WantedBookmark): boolean {
  if (wanted.url === undefined) {
    return isFolder(node) && node.title === wanted.title;
  }
  return node.url !== undefined && normaliseUrl(node.url) === normaliseUrl(wanted.url);
}

async function removeNode(node: BookmarkNode): Promise<void> {
  if (isFolder(node)) {
    await browser.bookmarks.removeTree(node.id);
  } else {
    await browser.bookmarks.remove(node.id);
  }
}

/**
 * Make a folder's children exactly the wanted bookmarks, in order, changing as little as possible:
 * children that already match are kept (and moved into place), missing ones are created and
 * everything else is removed. Returns the node for each wanted item, or null where the browser
 * refused to create it (some browsers do not bookmark every URL).
 */
async function arrangeChildren(parentId: string, wanted: WantedBookmark[]): Promise<(BookmarkNode | null)[]> {
  // Mirrors the folder's children as changes are made, so indexes never have to be re-read
  const children = await browser.bookmarks.getChildren(parentId);
  const arranged: (BookmarkNode | null)[] = [];
  let position = 0;

  for (const item of wanted) {
    const foundAt = children.findIndex((node, index) => index >= position && matches(node, item));

    if (foundAt === -1) {
      try {
        const created = await browser.bookmarks.create({ parentId, index: position, title: item.title, url: item.url });
        children.splice(position, 0, created);
        arranged.push(created);
        position++;
      } catch (error) {
        console.warn("[Bookmarks] The browser refused a bookmark:", error);
        arranged.push(null);
      }
      continue;
    }

    const [node] = children.splice(foundAt, 1);
    if (!node) {
      continue;
    }
    if (foundAt !== position) {
      // Only ever moves a node towards the start, where every browser agrees on what the index means
      await browser.bookmarks.move(node.id, { parentId, index: position });
    }
    children.splice(position, 0, node);
    arranged.push(node);
    position++;
  }

  // Whatever is left after the wanted items is no longer part of the groups
  for (const node of children.slice(position)) {
    await removeNode(node);
  }

  return arranged;
}

/**
 * Whether a folder is one of the browser's own (the root, the bookmarks bar, "Other bookmarks"...).
 * Syncing empties whatever folder it is given, so a stored id that somehow points at one of these
 * must never be used.
 */
function isBrowserFolder(node: BookmarkNode): boolean {
  const details = node as { unmodifiable?: string; folderType?: string };
  const isTopLevel = node.parentId === undefined || node.parentId === "0" || node.parentId === "root________";
  return isTopLevel || details.unmodifiable !== undefined || details.folderType !== undefined;
}

/** The synced folder if it still exists (wherever the user has moved it), otherwise a new one. */
async function findOrCreateRootFolder(folderId: string | undefined): Promise<BookmarkNode> {
  if (folderId) {
    try {
      const [node] = await browser.bookmarks.get(folderId);
      if (node && isFolder(node) && !isBrowserFolder(node)) {
        return node;
      }
    } catch {
      // The folder was deleted; a new one is made below
    }
  }

  // No parent: browsers put it at the top of "Other bookmarks" ("Other favourites" in Edge)
  return browser.bookmarks.create({ title: BOOKMARK_FOLDER_TITLE });
}

/**
 * Titles of the open pinned tabs by URL, used to name bookmarks (the extension itself stores only
 * URLs). Only pinned tabs are read, as everywhere else in the extension.
 */
async function getPinnedTabTitles(): Promise<Map<string, string>> {
  const titles = new Map<string, string>();
  try {
    for (const tab of await browser.tabs.query({ pinned: true })) {
      if (tab.url && tab.title && tab.title !== tab.url) {
        titles.set(normaliseUrl(tab.url), tab.title);
      }
    }
  } catch (error) {
    console.warn("[Bookmarks] Could not read tab titles:", error);
  }
  return titles;
}

/**
 * Mirror the tab groups into the bookmark folder: one folder per group, in the groups' order, each
 * holding that group's URLs. One way only: changes made to the bookmarks are overwritten here.
 * Returns the folder's id, to keep for the next sync.
 *
 * @param onFolderReady Called with the folder's id before anything is put in it, so the id is kept
 *   even if the sync is then interrupted (otherwise the next sync would make a second folder).
 */
export async function syncGroupsToBookmarks(
  groups: TabGroups,
  groupOrder: string[],
  folderId: string | undefined,
  onFolderReady?: (folderId: string) => Promise<void>,
): Promise<string> {
  const root = await findOrCreateRootFolder(folderId);
  await onFolderReady?.(root.id);
  const tabTitles = await getPinnedTabTitles();

  // Ordered groups first, then any group the order does not list
  const orderedNames = new Set(groupOrder.filter((name) => Object.hasOwn(groups, name)));
  const names = [...orderedNames, ...Object.keys(groups).filter((name) => !orderedNames.has(name))];

  const groupFolders = await arrangeChildren(
    root.id,
    names.map((name) => ({ title: name })),
  );

  for (const [index, groupFolder] of groupFolders.entries()) {
    const name = names[index];
    if (!groupFolder || name === undefined) {
      continue;
    }

    const storedUrls: unknown = groups[name];
    // Same rule as opening a group: a compromised account must not be able to plant a javascript: or data: bookmark
    const urls = Array.isArray(storedUrls) ? storedUrls.filter((url): url is string => typeof url === "string" && isAllowedTabUrl(url)) : [];
    const bookmarks = await arrangeChildren(
      groupFolder.id,
      urls.map((url) => ({ url, title: tabTitles.get(normaliseUrl(url)) ?? fallbackBookmarkTitle(url) })),
    );

    // A bookmark made before its page title was known gets the title once a tab shows it
    for (const [urlIndex, bookmark] of bookmarks.entries()) {
      const url = urls[urlIndex];
      if (!bookmark || url === undefined) {
        continue;
      }

      const tabTitle = tabTitles.get(normaliseUrl(url));
      if (tabTitle && bookmark.title !== tabTitle && bookmark.title === fallbackBookmarkTitle(url)) {
        await browser.bookmarks.update(bookmark.id, { title: tabTitle });
      }
    }
  }

  return root.id;
}

/** Remove the synced folder and everything in it. A folder that is already gone is not an error. */
async function removeBookmarkFolder(folderId: string): Promise<void> {
  try {
    await browser.bookmarks.removeTree(folderId);
  } catch {
    // Already deleted by the user
  }
}

/** What set a bookmark sync off, where it changes what has to be done. */
interface BookmarkSyncTrigger {
  /** The folder id just removed from storage, when all local data was deleted. */
  previousFolderId?: string;
}

async function isBookmarkSyncEnabled(): Promise<boolean> {
  const stored = await browser.storage.local.get(STORAGE_KEYS.BOOKMARK_SYNC);
  return stored[STORAGE_KEYS.BOOKMARK_SYNC] === true;
}

/**
 * Bring the bookmarks in line with the setting and the saved groups. Switched on (and allowed by
 * the browser), the folder is synced. Switched off, the folder is removed. The permission is kept
 * once granted, so switching back on does not ask again.
 */
async function reconcileBookmarks({ previousFolderId }: BookmarkSyncTrigger = {}): Promise<void> {
  // Without the permission there is no bookmarks API: either sync was never switched on, or the
  // browser is still asking the user
  if (!(await browser.permissions.contains(BOOKMARKS_PERMISSION))) {
    return;
  }
  if (!browser.bookmarks) {
    console.warn("[Bookmarks] The bookmarks permission is granted but the browser has not made bookmarks available yet");
    return;
  }

  const stored = await browser.storage.local.get([
    STORAGE_KEYS.BOOKMARK_SYNC,
    STORAGE_KEYS.BOOKMARK_SYNC_FOLDER_ID,
    STORAGE_KEYS.TAB_GROUPS,
    STORAGE_KEYS.GROUP_ORDER,
  ]);
  const storedFolderId = stored[STORAGE_KEYS.BOOKMARK_SYNC_FOLDER_ID];
  const folderId = typeof storedFolderId === "string" ? storedFolderId : previousFolderId;

  if (stored[STORAGE_KEYS.BOOKMARK_SYNC] === true) {
    const storedGroups = stored[STORAGE_KEYS.TAB_GROUPS];
    const storedOrder = stored[STORAGE_KEYS.GROUP_ORDER];
    const groups = storedGroups && typeof storedGroups === "object" && !Array.isArray(storedGroups) ? (storedGroups as TabGroups) : {};
    const groupOrder = Array.isArray(storedOrder) ? storedOrder.filter((name): name is string => typeof name === "string") : [];

    await syncGroupsToBookmarks(groups, groupOrder, folderId, async (syncedFolderId) => {
      if (syncedFolderId !== storedFolderId) {
        await browser.storage.local.set({ [STORAGE_KEYS.BOOKMARK_SYNC_FOLDER_ID]: syncedFolderId });
      }
    });
    return;
  }

  if (folderId) {
    await removeBookmarkFolder(folderId);
    await browser.storage.local.remove(STORAGE_KEYS.BOOKMARK_SYNC_FOLDER_ID);
  }
}

/** Runs one at a time, so two changes in quick succession cannot both create the folder. */
let reconcileQueue: Promise<void> = Promise.resolve();

/** The run that is queued but has not started. Changes arriving meanwhile join it instead of queueing their own. */
let waitingTrigger: BookmarkSyncTrigger | null = null;

/** Queue a bookmark sync (or clean-up, when the setting is off). Never rejects. */
export function queueBookmarkSync(trigger: BookmarkSyncTrigger = {}): Promise<void> {
  if (waitingTrigger) {
    // Every run reads the latest groups and setting, so one waiting run covers this change too
    waitingTrigger.previousFolderId ??= trigger.previousFolderId;
    return reconcileQueue;
  }

  waitingTrigger = { ...trigger };
  reconcileQueue = reconcileQueue
    .then(() => {
      const startedTrigger = waitingTrigger ?? {};
      waitingTrigger = null;
      return reconcileBookmarks(startedTrigger);
    })
    .catch((error) => console.error("[Bookmarks] Failed to sync bookmarks:", error));
  return reconcileQueue;
}

/** Resolves once every queued bookmark sync has finished. Only the tests need to wait for that. */
export function whenBookmarkSyncIdle(): Promise<void> {
  return reconcileQueue;
}

/**
 * Keep the bookmarks in step from the background: after a change to the groups or the setting, once
 * the browser grants the permission, and on launch. Call synchronously when the background starts,
 * so the listeners can wake a stopped service worker.
 */
export function registerBookmarkSync(): void {
  browser.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") {
      return;
    }

    const isRelevant = [STORAGE_KEYS.BOOKMARK_SYNC, STORAGE_KEYS.TAB_GROUPS, STORAGE_KEYS.GROUP_ORDER].some((key) => key in changes);
    if (!isRelevant) {
      return;
    }

    // "Delete all local data" removes the folder id together with the setting, so take it from the change
    const folderChange = changes[STORAGE_KEYS.BOOKMARK_SYNC_FOLDER_ID];
    const previousFolderId = folderChange && typeof folderChange.oldValue === "string" ? folderChange.oldValue : undefined;

    void queueBookmarkSync({ previousFolderId });
  });

  // The popup often closes while the browser asks, so the first sync starts here, not in the popup
  browser.permissions.onAdded.addListener((permissions) => {
    if (permissions.permissions?.includes("bookmarks")) {
      void queueBookmarkSync();
    }
  });

  // Taken away in the browser's own settings: the folder can no longer be updated, so switch off
  browser.permissions.onRemoved.addListener((permissions) => {
    if (permissions.permissions?.includes("bookmarks")) {
      void isBookmarkSyncEnabled()
        .then((enabled) => (enabled ? browser.storage.local.set({ [STORAGE_KEYS.BOOKMARK_SYNC]: false }) : undefined))
        .catch((error) => console.error("[Bookmarks] Failed to switch bookmark sync off:", error));
    }
  });

  browser.runtime.onStartup.addListener(() => void queueBookmarkSync());
}
