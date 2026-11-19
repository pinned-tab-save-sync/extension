import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";

/** Load a module afresh, as built with the given VITE_LOCAL_ONLY value (undefined = not set). */
async function importBuiltWith<T>(localOnly: string | undefined, path: string): Promise<T> {
  vi.stubEnv("VITE_LOCAL_ONLY", localOnly);
  vi.resetModules();
  return (await import(path)) as T;
}

beforeEach(() => {
  fakeBrowser.reset();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("IS_LOCAL_ONLY", () => {
  it.each([
    [undefined, true],
    ["true", true],
    ["", true],
    ["false", false],
  ])("with VITE_LOCAL_ONLY=%s is %s", async (value, expected) => {
    const { IS_LOCAL_ONLY } = await importBuiltWith<typeof import("@/lib/buildMode")>(value, "@/lib/buildMode");

    expect(IS_LOCAL_ONLY).toBe(expected);
  });
});

describe("the background's sign-in listeners", () => {
  it("are not registered in a local-only build", async () => {
    const addMessageListener = vi.spyOn(browser.runtime.onMessage, "addListener");
    const addExternalListener = vi.spyOn(browser.runtime.onMessageExternal, "addListener").mockImplementation(() => undefined);

    const { default: background } = await importBuiltWith<typeof import("@/entrypoints/background")>("true", "@/entrypoints/background");
    background.main();

    expect(addMessageListener).not.toHaveBeenCalled();
    expect(addExternalListener).not.toHaveBeenCalled();
  });

  it("are registered in a sync build", async () => {
    const addMessageListener = vi.spyOn(browser.runtime.onMessage, "addListener");
    const addExternalListener = vi.spyOn(browser.runtime.onMessageExternal, "addListener").mockImplementation(() => undefined);

    const { default: background } = await importBuiltWith<typeof import("@/entrypoints/background")>("false", "@/entrypoints/background");
    background.main();

    expect(addMessageListener).toHaveBeenCalled();
    expect(addExternalListener).toHaveBeenCalled();
  });
});
