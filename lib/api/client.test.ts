import { describe, it, expect, beforeEach, vi } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";
import { apiClient, ApiClientError } from "./client";
import { STORAGE_KEYS } from "../storage/keys";

beforeEach(() => {
  fakeBrowser.reset();
  vi.unstubAllGlobals();
});

describe("ApiClient.request - token guard", () => {
  it("throws ApiClientError 401 without calling fetch when no token is stored", async () => {
    // No token in storage (fakeBrowser was reset)
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiClient.get("/pinned-tabs")).rejects.toThrow(ApiClientError);
    await expect(apiClient.get("/pinned-tabs")).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses the stored token as a Bearer header when one is present", async () => {
    await browser.storage.local.set({ [STORAGE_KEYS.AUTH_TOKEN]: "my-token" });

    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: [] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await apiClient.get("/pinned-tabs");

    expect(fetchMock).toHaveBeenCalledOnce();
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>)["Authorization"]).toBe("Bearer my-token");
  });

  it("skipAuth requests go out without a token and without checking storage", async () => {
    // No token in storage
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({}), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await apiClient.request("/health", { skipAuth: true, method: "GET" });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>)["Authorization"]).toBeUndefined();
  });
});

describe("ApiClient.request - responses that are not JSON", () => {
  it("throws an ApiClientError with the status for an HTML error page", async () => {
    await browser.storage.local.set({ [STORAGE_KEYS.AUTH_TOKEN]: "my-token" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<html>Bad Gateway</html>", { status: 502 })),
    );

    await expect(apiClient.get("/pinned-tabs")).rejects.toBeInstanceOf(ApiClientError);
    await expect(apiClient.get("/pinned-tabs")).rejects.toMatchObject({ status: 502, message: "The server returned an error (502)" });
  });
});
