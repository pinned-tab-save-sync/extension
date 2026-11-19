import { isAllowedTabUrl } from "./tabUrl";

/**
 * Open the URLs as pinned tabs in the window, then close the tabs they replace. The new tabs are
 * opened first so a failure never leaves the window without its old ones, and a URL that is refused
 * does not stop the rest: by the browser (e.g. about:addons), or by `isAllowedTabUrl` before the
 * browser is even asked (e.g. javascript: or data:). When every URL is refused, the old tabs are
 * kept. Returns how many URLs were refused.
 */
export async function replacePinnedTabs(urls: string[], windowId: number | undefined, replacedTabIds: number[]): Promise<number> {
  const results = await Promise.allSettled(
    urls.map((url) =>
      isAllowedTabUrl(url) ? browser.tabs.create({ url, pinned: true, active: false, windowId }) : Promise.reject(new Error("URL not allowed")),
    ),
  );
  const refusedCount = results.filter((result) => result.status === "rejected").length;

  if (refusedCount === urls.length) {
    return refusedCount;
  }

  // One at a time: a tab closed meanwhile would make a batch remove fail and leave all the old tabs open
  await Promise.allSettled(replacedTabIds.map((tabId) => browser.tabs.remove(tabId)));

  return refusedCount;
}
