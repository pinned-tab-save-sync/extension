import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";
import {
  debouncedSync,
  groupsToTabs,
  tabsToGroups,
  cancelPendingSync,
  enableSync,
  disableSync,
  isSyncEnabled,
  markAsSynced,
  resetSyncFingerprint,
  buildSyncFingerprint,
  hashSyncFingerprint,
  decideLoadAction,
  mergeTabGroups,
  summariseTabGroups,
  markSyncPausedOverLimit,
  clearSyncPausedOverLimit,
  wasSyncPausedOverLimit,
  type LoadAction,
} from "./sync";
import { STORAGE_KEYS } from "./storage/keys";
import type { PinnedTab, TabGroups } from "./types";

const GROUPS_A: TabGroups = { Work: ["https://example.com"] };
const ORDER_A = ["Work"];
const GROUPS_EMPTY: TabGroups = {};
const ORDER_EMPTY: string[] = [];

/** Helper: compute a hash for a groups/order state. */
async function hash(groups: TabGroups, order: string[]): Promise<string> {
  return hashSyncFingerprint(buildSyncFingerprint(groups, order));
}

beforeEach(async () => {
  fakeBrowser.reset();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
  cancelPendingSync();
  disableSync();
  resetSyncFingerprint();
  // Clear the persisted fingerprint in case a previous test stored it
  await browser.storage.local.remove(STORAGE_KEYS.LAST_SYNCED_FINGERPRINT);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("kill switch", () => {
  it("debouncedSync does nothing while sync is disabled", async () => {
    await browser.storage.local.set({ [STORAGE_KEYS.AUTH_TOKEN]: "token" });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    // When sync is disabled, debouncedSync returns immediately without scheduling
    debouncedSync(GROUPS_A, ORDER_A, vi.fn(), vi.fn(), vi.fn(), 0);
    await new Promise<void>((r) => setTimeout(r, 50)); // Wait past any possible delay

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("debouncedSync works after enableSync()", async () => {
    await browser.storage.local.set({ [STORAGE_KEYS.AUTH_TOKEN]: "token" });
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: [] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    enableSync();

    const onComplete = vi.fn();
    await new Promise<void>((resolve, reject) => {
      debouncedSync(
        GROUPS_A,
        ORDER_A,
        vi.fn(),
        () => {
          onComplete();
          resolve();
        },
        (e) => reject(e),
        0,
      );
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(onComplete).toHaveBeenCalledOnce();
  });

  it("disableSync() between scheduling and firing prevents the request", async () => {
    await browser.storage.local.set({ [STORAGE_KEYS.AUTH_TOKEN]: "token" });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    enableSync();

    vi.useFakeTimers();
    debouncedSync(GROUPS_A, ORDER_A, vi.fn(), vi.fn(), vi.fn()); // schedules timer
    disableSync(); // cancels timer AND sets syncEnabled=false
    vi.advanceTimersByTime(1000); // advance - timer was already cancelled

    expect(fetchMock).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});

describe("fingerprint no-op guard (PR #1 regression)", () => {
  it("skips the sync request when state is identical to last synced", async () => {
    await browser.storage.local.set({ [STORAGE_KEYS.AUTH_TOKEN]: "token" });
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: [] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    enableSync();
    await markAsSynced(GROUPS_A, ORDER_A); // Seed the fingerprint

    // The timer fires but returns early due to fingerprint match
    await new Promise<void>((resolve) => {
      // Use delay=0; the callback returns without calling onComplete, so we resolve via setTimeout
      debouncedSync(GROUPS_A, ORDER_A, vi.fn(), vi.fn(), vi.fn(), 0);
      setTimeout(resolve, 50); // Wait slightly longer than the 0ms delay
    });

    // Sync was skipped - fetch is not called
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does sync when state differs from last synced", async () => {
    await browser.storage.local.set({ [STORAGE_KEYS.AUTH_TOKEN]: "token" });
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: [] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    enableSync();
    await markAsSynced(GROUPS_A, ORDER_A); // Seed with different state

    const GROUPS_B: TabGroups = { Personal: ["https://news.example.com"] };
    await new Promise<void>((resolve, reject) => {
      debouncedSync(
        GROUPS_B,
        ["Personal"],
        vi.fn(),
        () => resolve(),
        (e) => reject(e),
        0,
      );
    });

    expect(fetchMock).toHaveBeenCalledOnce();
  });
});

describe("markAsSynced persistence", () => {
  it("markAsSynced persists the SHA-256 hash to storage", async () => {
    // Test markAsSynced directly (no fake timers, no timing races)
    await markAsSynced(GROUPS_A, ORDER_A);

    const result = await browser.storage.local.get(STORAGE_KEYS.LAST_SYNCED_FINGERPRINT);
    const stored = result[STORAGE_KEYS.LAST_SYNCED_FINGERPRINT] as string;
    expect(stored).toBeTypeOf("string");
    expect(stored).toHaveLength(64); // SHA-256 hex is 64 characters

    // Must match the independently computed hash
    const expected = await hash(GROUPS_A, ORDER_A);
    expect(stored).toBe(expected);
  });

  it("a successful debouncedSync calls markAsSynced, updating the persisted fingerprint", async () => {
    await browser.storage.local.set({ [STORAGE_KEYS.AUTH_TOKEN]: "token" });
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: [] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    enableSync();

    // Use real timers with delay=0 to avoid fake-timer + crypto.subtle race conditions
    const onComplete = vi.fn();
    await new Promise<void>((resolve, reject) => {
      debouncedSync(
        GROUPS_A,
        ORDER_A,
        vi.fn(),
        () => {
          onComplete();
          resolve();
        },
        (err) => reject(err),
        0, // zero delay so it fires immediately in the microtask queue
      );
    });

    expect(onComplete).toHaveBeenCalledOnce();
    const result = await browser.storage.local.get(STORAGE_KEYS.LAST_SYNCED_FINGERPRINT);
    expect(result[STORAGE_KEYS.LAST_SYNCED_FINGERPRINT]).toBeTypeOf("string");
    expect(result[STORAGE_KEYS.LAST_SYNCED_FINGERPRINT] as string).toHaveLength(64);
  });

  it("a failed debouncedSync does not update the persisted fingerprint", async () => {
    await browser.storage.local.set({ [STORAGE_KEYS.AUTH_TOKEN]: "token" });
    // Pre-seed with a sentinel so we can verify it is unchanged after the failed sync
    const SENTINEL = "0".repeat(64);
    await browser.storage.local.set({ [STORAGE_KEYS.LAST_SYNCED_FINGERPRINT]: SENTINEL });

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ message: "error" }), { status: 500 })),
    );
    enableSync();

    const onError = vi.fn();
    await new Promise<void>((resolve) => {
      debouncedSync(
        GROUPS_A,
        ORDER_A,
        vi.fn(),
        vi.fn(),
        (err) => {
          onError(err);
          resolve();
        },
        0,
      );
    });

    expect(onError).toHaveBeenCalledOnce();
    const result = await browser.storage.local.get(STORAGE_KEYS.LAST_SYNCED_FINGERPRINT);
    // Fingerprint unchanged from sentinel (failed sync must not update it)
    expect(result[STORAGE_KEYS.LAST_SYNCED_FINGERPRINT]).toBe(SENTINEL);
  });
});

describe("decideLoadAction", () => {
  it("returns 'none' when both local and API are empty", () => {
    expect(decideLoadAction({ localHasGroups: false, apiHasGroups: false, localHash: "a", apiHash: "a", lastSyncedHash: null })).toBe("none");
  });

  it("returns 'useApi' when local is empty regardless of API content or fingerprint", () => {
    // Local empty + API has groups
    expect(decideLoadAction({ localHasGroups: false, apiHasGroups: true, localHash: "a", apiHash: "b", lastSyncedHash: null })).toBe("useApi");
    // Local empty + stored fingerprint present + API non-empty
    expect(decideLoadAction({ localHasGroups: false, apiHasGroups: true, localHash: "a", apiHash: "b", lastSyncedHash: "a" })).toBe("useApi");
    // Local empty + fingerprint matches local (vacuous)
    expect(decideLoadAction({ localHasGroups: false, apiHasGroups: true, localHash: "empty", apiHash: "other", lastSyncedHash: "empty" })).toBe(
      "useApi",
    );
  });

  it("returns 'pushLocal' when API is empty but local has groups", () => {
    expect(decideLoadAction({ localHasGroups: true, apiHasGroups: false, localHash: "a", apiHash: "b", lastSyncedHash: null })).toBe("pushLocal");
    expect(decideLoadAction({ localHasGroups: true, apiHasGroups: false, localHash: "a", apiHash: "b", lastSyncedHash: "a" })).toBe("pushLocal");
  });

  it("returns 'useApi' when local and API hashes match (row 4)", () => {
    expect(decideLoadAction({ localHasGroups: true, apiHasGroups: true, localHash: "same", apiHash: "same", lastSyncedHash: null })).toBe("useApi");
    expect(decideLoadAction({ localHasGroups: true, apiHasGroups: true, localHash: "same", apiHash: "same", lastSyncedHash: "different" })).toBe(
      "useApi",
    );
  });

  it("returns 'useApi' when local matches last synced hash (not dirty, row 5)", () => {
    expect(
      decideLoadAction({ localHasGroups: true, apiHasGroups: true, localHash: "local", apiHash: "api-different", lastSyncedHash: "local" }),
    ).toBe("useApi");
  });

  it("returns 'conflict' when dirty (local differs from API and was edited since last sync, row 6)", () => {
    // No stored fingerprint + local differs from non-empty API
    expect(decideLoadAction({ localHasGroups: true, apiHasGroups: true, localHash: "local", apiHash: "api", lastSyncedHash: null })).toBe("conflict");
    // Fingerprint exists but doesn't match local (local was changed after last sync)
    expect(
      decideLoadAction({ localHasGroups: true, apiHasGroups: true, localHash: "local-edited", apiHash: "api", lastSyncedHash: "local-before-edit" }),
    ).toBe("conflict");
  });

  it("returns 'pushLocal' for edits made while paused over the limits when the account has not changed (row 6)", () => {
    const input = { localHasGroups: true, apiHasGroups: true, localHash: "local-edited", apiHash: "api", lastSyncedHash: "api" };
    expect(decideLoadAction({ ...input, wasPausedOverLimit: true })).toBe("pushLocal");
    expect(decideLoadAction({ ...input, wasPausedOverLimit: false })).toBe("conflict");
    // The account changed since (another device synced) - still prompt
    expect(decideLoadAction({ ...input, apiHash: "api-changed", wasPausedOverLimit: true })).toBe("conflict");
    // Never push an empty state, paused or not
    expect(decideLoadAction({ ...input, localHasGroups: false, wasPausedOverLimit: true })).toBe("useApi");
  });

  it("NEVER returns 'pushLocal' when local has no groups (account-wipe invariant)", () => {
    const localHasGroups = false;
    const combinations: Array<{ apiHasGroups: boolean; lastSyncedHash: string | null }> = [
      { apiHasGroups: false, lastSyncedHash: null },
      { apiHasGroups: false, lastSyncedHash: "x" },
      { apiHasGroups: true, lastSyncedHash: null },
      { apiHasGroups: true, lastSyncedHash: "x" },
      { apiHasGroups: true, lastSyncedHash: "local-hash" },
    ];
    for (const { apiHasGroups, lastSyncedHash } of combinations) {
      const action = decideLoadAction({ localHasGroups, apiHasGroups, localHash: "local-hash", apiHash: "api-hash", lastSyncedHash });
      expect(action).not.toBe("pushLocal");
    }
  });
});

describe("resetSyncFingerprint vs persisted fingerprint", () => {
  it("resetSyncFingerprint clears in-memory state but keeps stored fingerprint", async () => {
    await markAsSynced(GROUPS_A, ORDER_A);
    const storedBefore = await browser.storage.local.get(STORAGE_KEYS.LAST_SYNCED_FINGERPRINT);
    expect(storedBefore[STORAGE_KEYS.LAST_SYNCED_FINGERPRINT]).toBeTruthy();

    resetSyncFingerprint();

    const storedAfter = await browser.storage.local.get(STORAGE_KEYS.LAST_SYNCED_FINGERPRINT);
    expect(storedAfter[STORAGE_KEYS.LAST_SYNCED_FINGERPRINT]).toBeTruthy(); // Still present
    expect(storedAfter[STORAGE_KEYS.LAST_SYNCED_FINGERPRINT]).toBe(storedBefore[STORAGE_KEYS.LAST_SYNCED_FINGERPRINT]);
  });

  it("markAsSynced persists a consistent SHA-256 hash", async () => {
    await markAsSynced(GROUPS_A, ORDER_A);
    const result = await browser.storage.local.get(STORAGE_KEYS.LAST_SYNCED_FINGERPRINT);
    const stored = result[STORAGE_KEYS.LAST_SYNCED_FINGERPRINT] as string;

    // Verify it matches independently computed hash
    const expected = await hash(GROUPS_A, ORDER_A);
    expect(stored).toBe(expected);
    // SHA-256 hex is 64 chars
    expect(stored).toHaveLength(64);
  });
});

describe("isSyncEnabled", () => {
  it("is false by default (after disableSync)", () => {
    expect(isSyncEnabled()).toBe(false);
  });

  it("is true after enableSync()", () => {
    enableSync();
    expect(isSyncEnabled()).toBe(true);
  });

  it("is false after disableSync()", () => {
    enableSync();
    disableSync();
    expect(isSyncEnabled()).toBe(false);
  });
});

describe("summariseTabGroups", () => {
  it("counts the groups and the tabs across them", () => {
    const groups: TabGroups = { Work: ["https://a.com", "https://b.com"], Home: ["https://c.com"], Empty: [] };

    expect(summariseTabGroups(groups)).toEqual({ groups: 3, tabs: 3 });
  });

  it("returns zero counts for no groups", () => {
    expect(summariseTabGroups({})).toEqual({ groups: 0, tabs: 0 });
  });
});

describe("mergeTabGroups", () => {
  it("keeps account groups first and appends browser-only groups in browser order", () => {
    const account = { groups: { Work: ["https://a.com"], Home: ["https://b.com"] }, groupOrder: ["Work", "Home"] };
    const browserState = {
      groups: { Reading: ["https://c.com"], Work: ["https://a.com"], News: ["https://d.com"] },
      groupOrder: ["Reading", "Work", "News"],
    };

    const merged = mergeTabGroups(account, browserState);

    expect(merged.groupOrder).toEqual(["Work", "Home", "Reading", "News"]);
    expect(merged.groups).toEqual({
      Work: ["https://a.com"],
      Home: ["https://b.com"],
      Reading: ["https://c.com"],
      News: ["https://d.com"],
    });
  });

  it("appends new browser tabs to matching account groups without duplicating existing ones", () => {
    const account = { groups: { Work: ["https://a.com", "https://b.com"] }, groupOrder: ["Work"] };
    const browserState = { groups: { Work: ["https://c.com", "https://a.com", "https://d.com"] }, groupOrder: ["Work"] };

    expect(mergeTabGroups(account, browserState).groups.Work).toEqual(["https://a.com", "https://b.com", "https://c.com", "https://d.com"]);
  });

  it("never removes account groups or tabs missing from the browser", () => {
    const account = { groups: { Work: ["https://a.com", "https://b.com"], Old: ["https://x.com"] }, groupOrder: ["Work", "Old"] };
    const browserState = { groups: { Work: ["https://a.com"] }, groupOrder: ["Work"] };

    const merged = mergeTabGroups(account, browserState);

    expect(merged.groupOrder).toEqual(["Work", "Old"]);
    expect(merged.groups).toEqual(account.groups);
  });

  it("includes groups missing from the order arrays and does not mutate the inputs", () => {
    const account = { groups: { Work: ["https://a.com"], Stray: ["https://s.com"] }, groupOrder: ["Work"] };
    const browserState = { groups: { Work: ["https://b.com"], Loose: ["https://l.com"] }, groupOrder: [] as string[] };

    const merged = mergeTabGroups(account, browserState);

    expect(merged.groupOrder).toEqual(["Work", "Stray", "Loose"]);
    expect(merged.groups.Work).toEqual(["https://a.com", "https://b.com"]);
    expect(account.groups.Work).toEqual(["https://a.com"]);
  });
});

describe("over-limit pause marker", () => {
  it("only counts for the sign-in that paused", async () => {
    await browser.storage.local.set({ [STORAGE_KEYS.AUTH_TOKEN]: "first-token" });
    expect(await wasSyncPausedOverLimit()).toBe(false);

    await markSyncPausedOverLimit();
    expect(await wasSyncPausedOverLimit()).toBe(true);

    // A new sign-in gets a new token, so edits made while logged out still prompt
    await browser.storage.local.set({ [STORAGE_KEYS.AUTH_TOKEN]: "second-token" });
    expect(await wasSyncPausedOverLimit()).toBe(false);
  });

  it("is forgotten once cleared", async () => {
    await browser.storage.local.set({ [STORAGE_KEYS.AUTH_TOKEN]: "token" });
    await markSyncPausedOverLimit();
    await clearSyncPausedOverLimit();
    expect(await wasSyncPausedOverLimit()).toBe(false);
  });

  it("is not set without a sign-in", async () => {
    await markSyncPausedOverLimit();
    expect(await browser.storage.local.get(STORAGE_KEYS.SYNC_PAUSED_OVER_LIMIT)).toEqual({});
  });
});

describe("group names that are also Object.prototype members", () => {
  const awkwardNames = ["constructor", "toString", "hasOwnProperty", "__proto__"];

  const tabInGroup = (name: string, url: string, position: number) =>
    ({ id: `${name}-${position}`, url, position, group: { id: name, name, position: 0 } }) as PinnedTab;

  it.each(awkwardNames)("tabsToGroups builds a group named %s", (name) => {
    const { groups, groupOrder } = tabsToGroups([tabInGroup(name, "https://a.example", 0), tabInGroup(name, "https://b.example", 1)]);

    expect(groupOrder).toEqual([name]);
    expect(Object.keys(groups)).toEqual([name]);
    expect(groups[name]).toEqual(["https://a.example", "https://b.example"]);
  });

  it.each(awkwardNames)("mergeTabGroups merges a group named %s", (name) => {
    const account = tabsToGroups([tabInGroup(name, "https://a.example", 0)]);
    const browserSide = tabsToGroups([tabInGroup(name, "https://b.example", 0), tabInGroup("Work", "https://c.example", 1)]);

    const merged = mergeTabGroups(account, browserSide);

    expect(merged.groupOrder).toEqual([name, "Work"]);
    expect(merged.groups[name]).toEqual(["https://a.example", "https://b.example"]);
  });

  it.each(awkwardNames)("groupsToTabs sends a group named %s, and ignores it in the order when it is not a group", (name) => {
    const stored = JSON.parse(JSON.stringify({ [name]: ["https://a.example"] })) as TabGroups;

    expect(groupsToTabs(stored, [name])).toEqual([{ url: "https://a.example", group_name: name, position: 0 }]);
    expect(groupsToTabs({ Work: ["https://c.example"] }, [name, "Work"])).toEqual([{ url: "https://c.example", group_name: "Work", position: 0 }]);
  });
});
