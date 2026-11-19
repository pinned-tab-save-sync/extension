import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";
import { getActiveGroupForWindow, migrateLegacyActiveGroups, setActiveGroupForWindow } from "./activeGroups";

beforeEach(() => {
  fakeBrowser.reset();
});

describe("active group per window", () => {
  it("returns null for a window with no group loaded", async () => {
    expect(await getActiveGroupForWindow(1)).toBeNull();
  });

  it("keeps each window's group separately", async () => {
    await setActiveGroupForWindow(1, "Work");
    await setActiveGroupForWindow(2, "Personal");

    expect(await getActiveGroupForWindow(1)).toBe("Work");
    expect(await getActiveGroupForWindow(2)).toBe("Personal");
  });

  it("forgets a window's group without touching the others", async () => {
    await setActiveGroupForWindow(1, "Work");
    await setActiveGroupForWindow(2, "Personal");

    await setActiveGroupForWindow(1, null);

    expect(await getActiveGroupForWindow(1)).toBeNull();
    expect(await getActiveGroupForWindow(2)).toBe("Personal");
  });

  it("is kept in session storage, not on disk", async () => {
    await setActiveGroupForWindow(1, "Work");

    expect(await browser.storage.local.get(null)).toEqual({});
  });
});

describe("migrateLegacyActiveGroups", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("moves the open windows' groups into session storage and removes the old map", async () => {
    vi.spyOn(browser.windows, "getAll").mockResolvedValue([{ id: 1 }, { id: 2 }, { id: 3 }] as never);
    await browser.storage.local.set({ activeGroupsByWindow: { "1": "Work", "2": null, "9": "Closed window" }, tabGroups: {} });

    await migrateLegacyActiveGroups();

    expect(await getActiveGroupForWindow(1)).toBe("Work");
    expect(await getActiveGroupForWindow(2)).toBeNull();
    expect(await getActiveGroupForWindow(9)).toBeNull();
    expect(await browser.storage.local.get(null)).toEqual({ tabGroups: {} });
  });

  it("does nothing when there is no old map", async () => {
    const getAll = vi.spyOn(browser.windows, "getAll");
    await browser.storage.local.set({ tabGroups: {} });

    await migrateLegacyActiveGroups();

    expect(getAll).not.toHaveBeenCalled();
    expect(await browser.storage.local.get(null)).toEqual({ tabGroups: {} });
  });
});
