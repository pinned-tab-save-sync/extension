import { useEffect, useState } from "react";

export interface WindowPinnedTab {
  id: number | undefined;
  url: string;
  title: string;
  favIconUrl: string | undefined;
}

/**
 * The pinned tabs in the popup's window, kept current while the popup is open
 * (saving or loading a group, or a tab's icon arriving after it loads).
 */
export function usePinnedTabs(): WindowPinnedTab[] {
  const [pinnedTabs, setPinnedTabs] = useState<WindowPinnedTab[]>([]);

  useEffect(() => {
    let isMounted = true;

    const refresh = async () => {
      const tabs = await browser.tabs.query({ pinned: true, currentWindow: true });
      if (!isMounted) return;
      setPinnedTabs(
        tabs.map((tab) => ({
          id: tab.id,
          url: tab.url ?? "",
          title: tab.title ?? "",
          favIconUrl: tab.favIconUrl,
        })),
      );
    };

    const handleUpdated = (_tabId: number, changeInfo: { pinned?: boolean; url?: string; favIconUrl?: string }) => {
      if (changeInfo.pinned !== undefined || changeInfo.url !== undefined || changeInfo.favIconUrl !== undefined) {
        refresh();
      }
    };

    refresh();
    browser.tabs.onCreated.addListener(refresh);
    browser.tabs.onRemoved.addListener(refresh);
    browser.tabs.onUpdated.addListener(handleUpdated);

    return () => {
      isMounted = false;
      browser.tabs.onCreated.removeListener(refresh);
      browser.tabs.onRemoved.removeListener(refresh);
      browser.tabs.onUpdated.removeListener(handleUpdated);
    };
  }, []);

  return pinnedTabs;
}
