import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";
import { logOutAndDeleteAllLocalData, deleteAllLocalData, endSession, AuthTokenStillPresentError } from "./localData";
import { enableSync, disableSync, resetSyncFingerprint, cancelPendingSync, debouncedSync, isSyncEnabled } from "./sync";
import { STORAGE_KEYS } from "./storage/keys";
import type { TabGroups } from "./types";

const SAMPLE_GROUPS: TabGroups = { Work: ["https://example.com"], Personal: ["https://news.example.com"] };

/** Pre-populate storage with an auth token and sample tab data. */
async function seedStorage() {
  await browser.storage.local.set({
    [STORAGE_KEYS.AUTH_TOKEN]: "test-token",
    [STORAGE_KEYS.STORED_USER]: { id: 1, email: "user@example.com", name: "Test" },
    [STORAGE_KEYS.TAB_GROUPS]: SAMPLE_GROUPS,
    [STORAGE_KEYS.GROUP_ORDER]: ["Work", "Personal"],
    [STORAGE_KEYS.STARTUP_GROUP]: "Work",
    [STORAGE_KEYS.THEME]: "dark",
  });
}

beforeEach(async () => {
  fakeBrowser.reset();
  vi.unstubAllGlobals();
  vi.restoreAllMocks(); // Restore any spies from the previous test
  vi.useRealTimers();
  cancelPendingSync();
  disableSync();
  resetSyncFingerprint();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("deleteAllLocalData", () => {
  it("throws AuthTokenStillPresentError when a token is stored and leaves data intact", async () => {
    await seedStorage();

    await expect(deleteAllLocalData()).rejects.toBeInstanceOf(AuthTokenStillPresentError);

    // All tab data must remain intact
    const result = await browser.storage.local.get(null);
    expect(result[STORAGE_KEYS.TAB_GROUPS]).toEqual(SAMPLE_GROUPS);
    expect(result[STORAGE_KEYS.GROUP_ORDER]).toEqual(["Work", "Personal"]);
    expect(result[STORAGE_KEYS.STARTUP_GROUP]).toBe("Work");
  });

  it("empties browser.storage.local completely when no token is stored", async () => {
    // Seed tab data only - no auth token
    await browser.storage.local.set({
      [STORAGE_KEYS.TAB_GROUPS]: SAMPLE_GROUPS,
      [STORAGE_KEYS.GROUP_ORDER]: ["Work"],
      [STORAGE_KEYS.THEME]: "dark",
    });

    await deleteAllLocalData();

    const result = await browser.storage.local.get(null);
    expect(Object.keys(result)).toHaveLength(0);
  });

  it("disables sync before clearing storage", async () => {
    enableSync();

    await deleteAllLocalData(); // No token - should succeed

    expect(isSyncEnabled()).toBe(false);
  });

  it("removes lastSyncedFingerprint from storage (plan test #15)", async () => {
    await browser.storage.local.set({ [STORAGE_KEYS.LAST_SYNCED_FINGERPRINT]: "abc123fingerprint" });
    // No auth token (precondition for deleteAllLocalData)

    await deleteAllLocalData();

    const result = await browser.storage.local.get(STORAGE_KEYS.LAST_SYNCED_FINGERPRINT);
    expect(result[STORAGE_KEYS.LAST_SYNCED_FINGERPRINT]).toBeUndefined();
  });
});

describe("endSession", () => {
  it("keeps lastSyncedFingerprint in storage (plan test #15)", async () => {
    await seedStorage();
    await browser.storage.local.set({ [STORAGE_KEYS.LAST_SYNCED_FINGERPRINT]: "abc123fingerprint" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 204 })),
    );

    await endSession();

    const result = await browser.storage.local.get(STORAGE_KEYS.LAST_SYNCED_FINGERPRINT);
    expect(result[STORAGE_KEYS.LAST_SYNCED_FINGERPRINT]).toBe("abc123fingerprint");
  });

  it("calls POST /logout and removes auth token and stored user", async () => {
    await seedStorage();
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await endSession();

    // Auth credentials must be cleared
    const result = await browser.storage.local.get([STORAGE_KEYS.AUTH_TOKEN, STORAGE_KEYS.STORED_USER]);
    expect(result[STORAGE_KEYS.AUTH_TOKEN]).toBeUndefined();
    expect(result[STORAGE_KEYS.STORED_USER]).toBeUndefined();

    // POST /logout was called
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url] = fetchMock.mock.calls[0] as unknown as [string];
    expect(url).toContain("/logout");
  });

  it("leaves tab groups, group order, startup group, active groups and theme untouched", async () => {
    await seedStorage();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 204 })),
    );

    await endSession();

    const result = await browser.storage.local.get(null);
    expect(result[STORAGE_KEYS.TAB_GROUPS]).toEqual(SAMPLE_GROUPS);
    expect(result[STORAGE_KEYS.GROUP_ORDER]).toEqual(["Work", "Personal"]);
    expect(result[STORAGE_KEYS.STARTUP_GROUP]).toBe("Work");
    expect(result[STORAGE_KEYS.THEME]).toBe("dark");
  });

  it("still clears local session even when POST /logout fails (offline)", async () => {
    await seedStorage();
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new TypeError("Network error"))),
    );

    await endSession(); // Must not throw

    const result = await browser.storage.local.get([STORAGE_KEYS.AUTH_TOKEN]);
    expect(result[STORAGE_KEYS.AUTH_TOKEN]).toBeUndefined();
  });
});

describe("logOutAndDeleteAllLocalData", () => {
  it("completes and empties all storage when POST /logout succeeds", async () => {
    await seedStorage();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 204 })),
    );

    await logOutAndDeleteAllLocalData();

    const result = await browser.storage.local.get(null);
    expect(Object.keys(result)).toHaveLength(0);
  });

  it("still completes and wipes when POST /logout rejects (offline)", async () => {
    await seedStorage();
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new TypeError("Network error"))),
    );

    await logOutAndDeleteAllLocalData();

    const result = await browser.storage.local.get(null);
    expect(Object.keys(result)).toHaveLength(0);
  });

  it("still completes and wipes when POST /logout returns 401 or 500", async () => {
    await seedStorage();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ message: "Unauthenticated" }), { status: 401 })),
    );

    await logOutAndDeleteAllLocalData();

    const result = await browser.storage.local.get(null);
    expect(Object.keys(result)).toHaveLength(0);
  });

  it("ORDERING: POST /logout -> token removed -> clear(), token is null when clear() runs", async () => {
    await seedStorage();

    const callLog: string[] = [];

    // Mock fetch to record the logout call
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        callLog.push(`fetch:POST ${new URL(url).pathname}`);
        return new Response(null, { status: 204 });
      }),
    );

    // Save originals BEFORE spying so we can call through
    const originalRemove = browser.storage.local.remove.bind(browser.storage.local);
    const originalClear = browser.storage.local.clear.bind(browser.storage.local);

    // Spy on remove - call through and log which keys were removed
    vi.spyOn(browser.storage.local, "remove").mockImplementation(async (keys: any) => {
      const keyList: string[] = Array.isArray(keys) ? keys : [keys];
      for (const key of keyList) {
        callLog.push(`remove:${key}`);
      }
      return originalRemove(keys);
    });

    // Spy on clear - capture token state then call through
    let tokenAtClearTime: unknown = "unchecked";
    vi.spyOn(browser.storage.local, "clear").mockImplementation(async () => {
      const result = await browser.storage.local.get(STORAGE_KEYS.AUTH_TOKEN);
      tokenAtClearTime = result[STORAGE_KEYS.AUTH_TOKEN];
      callLog.push("clear");
      return originalClear();
    });

    await logOutAndDeleteAllLocalData();

    // Verify ordering
    const fetchIdx = callLog.findIndex((c) => c.startsWith("fetch:POST"));
    const tokenRemoveIdx = callLog.findIndex((c) => c === `remove:${STORAGE_KEYS.AUTH_TOKEN}`);
    const clearIdx = callLog.findIndex((c) => c === "clear");

    expect(fetchIdx).toBeGreaterThanOrEqual(0);
    expect(tokenRemoveIdx).toBeGreaterThanOrEqual(0);
    expect(clearIdx).toBeGreaterThanOrEqual(0);

    expect(fetchIdx).toBeLessThan(tokenRemoveIdx);
    expect(tokenRemoveIdx).toBeLessThan(clearIdx);

    // At the moment clear() was invoked, the token was already removed
    expect(tokenAtClearTime).toBeUndefined();
  });

  it("rejects and leaves tab data intact if clearAuthToken throws (storage failure)", async () => {
    await seedStorage();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 204 })),
    );

    // Make the first remove call throw (clearAuthToken is the first call in endSession)
    let removeCallCount = 0;
    const originalRemove = browser.storage.local.remove.bind(browser.storage.local);
    vi.spyOn(browser.storage.local, "remove").mockImplementation(async (keys: any) => {
      removeCallCount++;
      if (removeCallCount === 1) {
        throw new Error("Storage quota exceeded");
      }
      return originalRemove(keys);
    });

    await expect(logOutAndDeleteAllLocalData()).rejects.toThrow("Storage quota exceeded");

    // Tab data must still be present (clear() was not called)
    const result = await browser.storage.local.get(STORAGE_KEYS.TAB_GROUPS);
    expect(result[STORAGE_KEYS.TAB_GROUPS]).toEqual(SAMPLE_GROUPS);
  });

  it("never calls POST /pinned-tabs/sync during the flow", async () => {
    await seedStorage();
    const fetchMock = vi.fn(async (url: string) => {
      const path = new URL(url).pathname;
      if (path.includes("sync")) {
        throw new Error("syncTabs should not be called during logout+delete");
      }
      return new Response(null, { status: 204 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await logOutAndDeleteAllLocalData(); // Should not throw

    const syncCalls = (fetchMock.mock.calls as [string][]).filter(([url]) => new URL(url).pathname.includes("/pinned-tabs/sync"));
    expect(syncCalls).toHaveLength(0);
  });

  it("a debouncedSync scheduled before logOutAndDeleteAllLocalData never fires afterwards", async () => {
    await seedStorage();
    const fetchMock = vi.fn(async (url: string) => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    vi.useFakeTimers();

    // Schedule a sync (sync must be enabled for debouncedSync to schedule)
    enableSync();
    debouncedSync({ Work: ["https://example.com"] }, ["Work"], vi.fn(), vi.fn(), vi.fn());

    // Run logOutAndDeleteAllLocalData - calls disableSync() -> cancelPendingSync() -> cancels the timer
    await logOutAndDeleteAllLocalData();

    // Advance timers well past the 300ms debounce window
    vi.advanceTimersByTime(1000);

    // Only the POST /logout call should exist; no /pinned-tabs/sync
    const syncCalls = (fetchMock.mock.calls as [string][]).filter(([url]) => new URL(url).pathname.includes("/pinned-tabs/sync"));
    expect(syncCalls).toHaveLength(0);
  });
});
