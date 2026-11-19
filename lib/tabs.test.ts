import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";
import { replacePinnedTabs } from "./tabs";

beforeEach(() => {
  fakeBrowser.reset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("replacePinnedTabs", () => {
  it("closes the old tabs only once the new ones have opened", async () => {
    const events: string[] = [];
    vi.spyOn(browser.tabs, "create").mockImplementation((async ({ url }: { url?: string }) => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      events.push(`opened ${url}`);
      return { id: 99 };
    }) as never);
    vi.spyOn(browser.tabs, "remove").mockImplementation((async (tabId: number) => {
      events.push(`closed ${tabId}`);
    }) as never);

    const refusedCount = await replacePinnedTabs(["https://a.example", "https://b.example"], 1, [5, 6]);

    expect(refusedCount).toBe(0);
    expect(events).toEqual(["opened https://a.example", "opened https://b.example", "closed 5", "closed 6"]);
    expect(browser.tabs.create).toHaveBeenCalledWith({ url: "https://a.example", pinned: true, active: false, windowId: 1 });
  });

  it("opens the rest and still closes the old tabs when the browser refuses a URL", async () => {
    const create = vi.spyOn(browser.tabs, "create").mockImplementation((async ({ url }: { url?: string }) => {
      if (url === "about:addons") {
        throw new Error("Illegal URL");
      }
      return { id: 99 };
    }) as never);
    const remove = vi.spyOn(browser.tabs, "remove").mockResolvedValue(undefined as never);

    const refusedCount = await replacePinnedTabs(["about:addons", "https://a.example"], 1, [5]);

    expect(refusedCount).toBe(1);
    expect(create).toHaveBeenCalledTimes(2);
    expect(remove).toHaveBeenCalledWith(5);
  });

  it("keeps the old tabs when the browser refuses every URL", async () => {
    vi.spyOn(browser.tabs, "create").mockRejectedValue(new Error("Illegal URL"));
    const remove = vi.spyOn(browser.tabs, "remove").mockResolvedValue(undefined as never);

    const refusedCount = await replacePinnedTabs(["about:addons", "about:config"], 1, [5, 6]);

    expect(refusedCount).toBe(2);
    expect(remove).not.toHaveBeenCalled();
  });

  it("closes the other old tabs when one of them has already gone", async () => {
    vi.spyOn(browser.tabs, "create").mockResolvedValue({ id: 99 } as never);
    const remove = vi.spyOn(browser.tabs, "remove").mockImplementation((async (tabId: number) => {
      if (tabId === 5) {
        throw new Error("No tab with id: 5");
      }
    }) as never);

    const refusedCount = await replacePinnedTabs(["https://a.example"], 1, [5, 6, 7]);

    expect(refusedCount).toBe(0);
    expect(remove).toHaveBeenCalledWith(6);
    expect(remove).toHaveBeenCalledWith(7);
  });

  it("does not call remove when there is nothing to replace", async () => {
    vi.spyOn(browser.tabs, "create").mockResolvedValue({ id: 99 } as never);
    const remove = vi.spyOn(browser.tabs, "remove").mockResolvedValue(undefined as never);

    await replacePinnedTabs(["https://a.example"], 1, []);

    expect(remove).not.toHaveBeenCalled();
  });
});

describe("replacePinnedTabs with URLs that may not be opened", () => {
  it("never asks the browser to open a javascript: or data: URL, and counts it as refused", async () => {
    const create = vi.spyOn(browser.tabs, "create").mockResolvedValue({ id: 99 } as never);
    const remove = vi.spyOn(browser.tabs, "remove").mockResolvedValue(undefined as never);

    const refusedCount = await replacePinnedTabs(["javascript:alert(1)", "https://a.example", "data:text/html,hi"], 1, [5]);

    expect(refusedCount).toBe(2);
    expect(create).toHaveBeenCalledOnce();
    expect(create).toHaveBeenCalledWith({ url: "https://a.example", pinned: true, active: false, windowId: 1 });
    expect(remove).toHaveBeenCalledWith(5);
  });

  it("keeps the old tabs when no URL may be opened", async () => {
    const create = vi.spyOn(browser.tabs, "create").mockResolvedValue({ id: 99 } as never);
    const remove = vi.spyOn(browser.tabs, "remove").mockResolvedValue(undefined as never);

    expect(await replacePinnedTabs(["javascript:alert(1)"], 1, [5])).toBe(1);
    expect(create).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });
});
