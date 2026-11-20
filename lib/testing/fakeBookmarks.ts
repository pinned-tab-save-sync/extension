import { vi } from "vitest";

type BookmarkNode = Browser.bookmarks.BookmarkTreeNode;
type PermissionsListener = (permissions: Browser.permissions.Permissions) => void;

/** One bookmark or folder as the tests see it: a folder lists its children, a bookmark has a URL. */
export type BookmarkOutline = { title: string; url?: string; children?: BookmarkOutline[] };

/** What `installFakeBookmarks` hands back to a test. */
export interface FakeBookmarks {
  /** The id of the folder that stands in for "Other bookmarks". */
  otherBookmarksId: string;
  /** Everything under a folder ("Other bookmarks" by default), as titles and URLs. */
  outline: (folderId?: string) => BookmarkOutline[];
  /** Grant or take away the bookmarks permission, telling the extension's listeners as the browser would. */
  setPermission: (isGranted: boolean) => void;
  hasPermission: () => boolean;
}

/**
 * Give the fake browser an in-memory bookmarks tree and a bookmarks permission (the WXT fake
 * implements neither). Bare origins gain a trailing slash when bookmarked, as in real browsers.
 * Call from `beforeEach`, after `fakeBrowser.reset()`; `vi.restoreAllMocks()` removes it.
 */
export function installFakeBookmarks(options: { isPermissionGranted?: boolean } = {}): FakeBookmarks {
  const otherBookmarksId = "other";
  const nodes = new Map<string, { id: string; parentId?: string; title: string; url?: string }>([
    [otherBookmarksId, { id: otherBookmarksId, title: "Other bookmarks" }],
  ]);
  const childIds = new Map<string, string[]>([[otherBookmarksId, []]]);
  let nextId = 1;
  let isPermissionGranted = options.isPermissionGranted ?? false;
  const addedListeners: PermissionsListener[] = [];
  const removedListeners: PermissionsListener[] = [];

  const toNode = (id: string): BookmarkNode => {
    const node = nodes.get(id);
    if (!node) {
      throw new Error(`Can't find bookmark for id ${id}.`);
    }
    return { ...node, index: childIds.get(node.parentId ?? "")?.indexOf(id) ?? 0 } as BookmarkNode;
  };

  const childrenOf = (id: string): string[] => {
    const children = childIds.get(id);
    if (!children) {
      throw new Error(`Can't find parent bookmark for id ${id}.`);
    }
    return children;
  };

  const removeTree = (id: string): void => {
    const node = toNode(id);
    for (const childId of [...(childIds.get(id) ?? [])]) {
      removeTree(childId);
    }
    const siblings = childrenOf(node.parentId ?? "");
    siblings.splice(siblings.indexOf(id), 1);
    nodes.delete(id);
    childIds.delete(id);
  };

  vi.spyOn(browser.bookmarks, "create").mockImplementation((async (details: Browser.bookmarks.CreateDetails) => {
    if (details.url !== undefined && !URL.canParse(details.url)) {
      throw new Error("Invalid URL.");
    }
    const parentId = details.parentId ?? otherBookmarksId;
    const siblings = childrenOf(parentId);
    const id = String(nextId++);
    nodes.set(id, { id, parentId, title: details.title ?? "", url: details.url === undefined ? undefined : new URL(details.url).href });
    if (details.url === undefined) {
      childIds.set(id, []);
    }
    siblings.splice(details.index ?? siblings.length, 0, id);
    return toNode(id);
  }) as never);

  vi.spyOn(browser.bookmarks, "get").mockImplementation((async (id: string) => [toNode(id)]) as never);
  vi.spyOn(browser.bookmarks, "getChildren").mockImplementation((async (id: string) => childrenOf(id).map(toNode)) as never);

  vi.spyOn(browser.bookmarks, "move").mockImplementation((async (id: string, destination: { parentId?: string; index?: number }) => {
    const node = nodes.get(id);
    if (!node) {
      throw new Error(`Can't find bookmark for id ${id}.`);
    }
    const from = childrenOf(node.parentId ?? "");
    from.splice(from.indexOf(id), 1);
    const parentId = destination.parentId ?? node.parentId ?? otherBookmarksId;
    const to = childrenOf(parentId);
    to.splice(destination.index ?? to.length, 0, id);
    node.parentId = parentId;
    return toNode(id);
  }) as never);

  vi.spyOn(browser.bookmarks, "update").mockImplementation((async (id: string, changes: { title?: string; url?: string }) => {
    const node = nodes.get(id);
    if (!node) {
      throw new Error(`Can't find bookmark for id ${id}.`);
    }
    Object.assign(node, changes);
    return toNode(id);
  }) as never);

  vi.spyOn(browser.bookmarks, "remove").mockImplementation((async (id: string) => {
    if ((childIds.get(id) ?? []).length > 0) {
      throw new Error("Can't remove non-empty folder (use recursive to force).");
    }
    removeTree(id);
  }) as never);
  vi.spyOn(browser.bookmarks, "removeTree").mockImplementation((async (id: string) => removeTree(id)) as never);

  const setPermission = (isGranted: boolean): void => {
    if (isGranted === isPermissionGranted) {
      return;
    }
    isPermissionGranted = isGranted;
    for (const listener of isGranted ? addedListeners : removedListeners) {
      listener({ permissions: ["bookmarks"] });
    }
  };

  vi.spyOn(browser.permissions, "contains").mockImplementation((async () => isPermissionGranted) as never);
  vi.spyOn(browser.permissions, "remove").mockImplementation((async () => {
    setPermission(false);
    return true;
  }) as never);
  vi.spyOn(browser.permissions.onAdded, "addListener").mockImplementation(((listener: PermissionsListener) =>
    addedListeners.push(listener)) as never);
  vi.spyOn(browser.permissions.onRemoved, "addListener").mockImplementation(((listener: PermissionsListener) =>
    removedListeners.push(listener)) as never);

  const outline = (folderId: string = otherBookmarksId): BookmarkOutline[] =>
    childrenOf(folderId).map((id) => {
      const node = toNode(id);
      return node.url === undefined ? { title: node.title, children: outline(id) } : { title: node.title, url: node.url };
    });

  return { otherBookmarksId, outline, setPermission, hasPermission: () => isPermissionGranted };
}
