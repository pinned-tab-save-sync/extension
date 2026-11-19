import { apiClient } from "./client";
import type { PinnedTab } from "../types";

interface PinnedTabsResponse {
  data: PinnedTab[];
}

interface SyncTabPayload {
  url: string;
  title?: string | null;
  favicon_url?: string | null;
  group_name?: string | null;
  position?: number;
}

export async function fetchTabs(): Promise<PinnedTab[]> {
  const response = await apiClient.get<PinnedTabsResponse>("/pinned-tabs");
  return response.data;
}

export async function syncTabs(tabs: SyncTabPayload[]): Promise<PinnedTab[]> {
  const response = await apiClient.post<PinnedTabsResponse>("/pinned-tabs/sync", {
    tabs,
  });
  return response.data;
}
