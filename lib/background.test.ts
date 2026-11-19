import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";
import { getActiveGroupForWindow } from "@/lib/storage/activeGroups";
import { STORAGE_KEYS } from "@/lib/storage/keys";
import background from "@/entrypoints/background";

/** Start the background, give it a startup group and two windows with pinned tabs, then launch the browser. */
async function launchBrowser(createTab: (url: string) => Promise<{ id: number }>): Promise<void> {
  await browser.storage.local.set({
    [STORAGE_KEYS.STARTUP_GROUP]: "Work",
    [STORAGE_KEYS.TAB_GROUPS]: { Work: ["https://a.example", "https://b.example"] },
  });
  vi.spyOn(browser.windows, "getAll").mockResolvedValue([
    { id: 1, focused: false },
    { id: 2, focused: true },
  ] as never);
  vi.spyOn(browser.tabs, "query").mockResolvedValue([{ id: 10 }, { id: 20 }] as never);
  vi.spyOn(browser.tabs, "create").mockImplementation((({ url }: { url: string }) => createTab(url)) as never);
  vi.spyOn(browser.tabs, "remove").mockResolvedValue(undefined as never);

  background.main();
  await fakeBrowser.runtime.onStartup.trigger();
}

beforeEach(() => {
  fakeBrowser.reset();
  // Not in the fake browser; the Chrome build listens for the website's sign-in message
  vi.spyOn(browser.runtime.onMessageExternal, "addListener").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("restoring the startup group on launch", () => {
  it("opens the group in the focused window, closes the restored pinned tabs and marks the group active", async () => {
    await launchBrowser(async () => ({ id: 99 }));

    expect(browser.tabs.create).toHaveBeenCalledWith({ url: "https://a.example", pinned: true, active: false, windowId: 2 });
    expect(browser.tabs.remove).toHaveBeenCalledWith(10);
    expect(browser.tabs.remove).toHaveBeenCalledWith(20);
    expect(await getActiveGroupForWindow(2)).toBe("Work");
  });

  it("keeps the restored tabs and marks nothing active when the browser refuses every tab", async () => {
    await launchBrowser(async () => {
      throw new Error("Illegal URL");
    });

    expect(browser.tabs.remove).not.toHaveBeenCalled();
    expect(await getActiveGroupForWindow(2)).toBeNull();
  });
});

describe("updating the extension", () => {
  it("moves the old active group map into session storage", async () => {
    vi.spyOn(browser.windows, "getAll").mockResolvedValue([{ id: 1 }] as never);
    await browser.storage.local.set({ activeGroupsByWindow: { "1": "Work" } });

    background.main();
    await fakeBrowser.runtime.onInstalled.trigger({ reason: "update", previousVersion: "0.1.0" });
    await vi.waitFor(async () => expect(await getActiveGroupForWindow(1)).toBe("Work"));

    expect(await browser.storage.local.get("activeGroupsByWindow")).toEqual({});
  });
});
