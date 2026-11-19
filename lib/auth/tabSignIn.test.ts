import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";
import { completeTabSignIn, startTabSignIn, TAB_SIGN_IN_TTL_MS } from "./tabSignIn";
import { pkceChallengeFor } from "./pkce";
import { STORAGE_KEYS } from "@/lib/storage/keys";
import { AUTH_URL } from "@/lib/urls";

const WEBSITE_ORIGIN = new URL(AUTH_URL).origin;

/** Start a sign-in and return the state and the URL the tab opened. */
async function startSignIn(): Promise<{ state: string; url: URL }> {
  const create = vi.spyOn(browser.tabs, "create").mockResolvedValue({ id: 7 } as never);
  await startTabSignIn("login");
  const url = new URL(create.mock.calls[0]![0].url!);

  return { state: url.searchParams.get("state")!, url };
}

function mockTokenExchange(status: number, body: unknown) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(body), { status }));
}

beforeEach(() => {
  fakeBrowser.reset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("startTabSignIn", () => {
  it("opens the website's sign-in in a tab with this extension's ID and a PKCE challenge for the stored verifier", async () => {
    const { url } = await startSignIn();

    expect(url.origin + url.pathname).toBe(`${AUTH_URL}/auth/extension/login`);
    expect(url.searchParams.get("extension_id")).toBe(browser.runtime.id);

    const pending = (await browser.storage.session.get(STORAGE_KEYS.PENDING_TAB_SIGN_IN))[STORAGE_KEYS.PENDING_TAB_SIGN_IN] as {
      verifier: string;
      state: string;
    };
    expect(url.searchParams.get("code_challenge")).toBe(await pkceChallengeFor(pending.verifier));
    expect(url.searchParams.get("state")).toBe(pending.state);
  });
});

describe("startTabSignIn again", () => {
  it("shows the sign-in tab that is already open instead of starting a second sign-in", async () => {
    const create = vi.spyOn(browser.tabs, "create").mockResolvedValue({ id: 7, windowId: 3 } as never);
    const update = vi.spyOn(browser.tabs, "update").mockResolvedValue({ id: 7, windowId: 3 } as never);
    const focus = vi.spyOn(browser.windows, "update").mockResolvedValue({} as never);

    await startTabSignIn("login");
    const first = await browser.storage.session.get(STORAGE_KEYS.PENDING_TAB_SIGN_IN);
    await startTabSignIn("login");

    expect(create).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith(7, { active: true });
    expect(focus).toHaveBeenCalledWith(3, { focused: true });
    expect(await browser.storage.session.get(STORAGE_KEYS.PENDING_TAB_SIGN_IN)).toEqual(first);
  });

  it("starts a new sign-in when that tab has been closed", async () => {
    const create = vi.spyOn(browser.tabs, "create").mockResolvedValue({ id: 7 } as never);
    vi.spyOn(browser.tabs, "update").mockRejectedValue(new Error("No tab with id: 7"));

    await startTabSignIn("login");
    await startTabSignIn("login");

    expect(create).toHaveBeenCalledTimes(2);
  });
});

describe("completeTabSignIn", () => {
  it("exchanges the code with the verifier and stores the token", async () => {
    const { state } = await startSignIn();
    const fetch = mockTokenExchange(200, { token: "1|abc" });

    const result = await completeTabSignIn({ type: "PTSAS_SIGN_IN", code: "the-code", state }, WEBSITE_ORIGIN);

    expect(result).toEqual({ success: true });
    expect((await browser.storage.local.get(STORAGE_KEYS.AUTH_TOKEN))[STORAGE_KEYS.AUTH_TOKEN]).toBe("1|abc");
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe(`${AUTH_URL}/auth/extension/token`);
    expect(JSON.parse(init!.body as string)).toMatchObject({ code: "the-code" });
  });

  it("only accepts messages from the website", async () => {
    const { state } = await startSignIn();
    const fetch = mockTokenExchange(200, { token: "1|abc" });

    const result = await completeTabSignIn({ type: "PTSAS_SIGN_IN", code: "the-code", state }, "https://evil.test");

    expect(result.success).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("refuses a sign-in this extension did not start, or one that expired", async () => {
    const fetch = mockTokenExchange(200, { token: "1|abc" });

    expect((await completeTabSignIn({ type: "PTSAS_SIGN_IN", code: "c", state: "never-started" }, WEBSITE_ORIGIN)).success).toBe(false);

    const { state } = await startSignIn();
    expect((await completeTabSignIn({ type: "PTSAS_SIGN_IN", code: "c", state: "other-state" }, WEBSITE_ORIGIN)).success).toBe(false);

    vi.spyOn(Date, "now").mockReturnValue(Date.now() + TAB_SIGN_IN_TTL_MS + 1);
    expect((await completeTabSignIn({ type: "PTSAS_SIGN_IN", code: "c", state }, WEBSITE_ORIGIN)).success).toBe(false);

    expect(fetch).not.toHaveBeenCalled();
  });

  it("keeps the sign-in after a network failure, so the page can try again", async () => {
    const { state } = await startSignIn();
    const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new TypeError("offline"));

    expect((await completeTabSignIn({ type: "PTSAS_SIGN_IN", code: "c", state }, WEBSITE_ORIGIN)).success).toBe(false);

    fetch.mockResolvedValueOnce(new Response(JSON.stringify({ token: "1|abc" }), { status: 200 }));
    expect((await completeTabSignIn({ type: "PTSAS_SIGN_IN", code: "c", state }, WEBSITE_ORIGIN)).success).toBe(true);
  });

  it("can only complete once", async () => {
    const { state } = await startSignIn();
    mockTokenExchange(200, { token: "1|abc" });

    expect((await completeTabSignIn({ type: "PTSAS_SIGN_IN", code: "c", state }, WEBSITE_ORIGIN)).success).toBe(true);
    expect((await completeTabSignIn({ type: "PTSAS_SIGN_IN", code: "c", state }, WEBSITE_ORIGIN)).success).toBe(false);
  });

  it("passes on the website's error when the exchange is refused", async () => {
    const { state } = await startSignIn();
    mockTokenExchange(422, { message: "This sign-in has expired." });

    expect(await completeTabSignIn({ type: "PTSAS_SIGN_IN", code: "c", state }, WEBSITE_ORIGIN)).toEqual({
      success: false,
      error: "This sign-in has expired.",
    });
    expect((await browser.storage.local.get(STORAGE_KEYS.AUTH_TOKEN))[STORAGE_KEYS.AUTH_TOKEN]).toBeUndefined();
  });

  it("ignores malformed messages", async () => {
    await startSignIn();

    expect((await completeTabSignIn({ type: "SOMETHING_ELSE" }, WEBSITE_ORIGIN)).success).toBe(false);
    expect((await completeTabSignIn(null, WEBSITE_ORIGIN)).success).toBe(false);
  });
});
