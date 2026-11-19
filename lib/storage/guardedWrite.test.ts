import { describe, it, expect, beforeEach } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";
import { guardedStorageWrite } from "./guardedWrite";
import { STORAGE_KEYS } from "./keys";
import type { TabGroups } from "../types";

const SAMPLE_GROUPS: TabGroups = { Work: ["https://example.com"] };

/** The data payload that a load would try to write back from the API. */
const WRITE_DATA = {
  [STORAGE_KEYS.TAB_GROUPS]: SAMPLE_GROUPS,
  [STORAGE_KEYS.GROUP_ORDER]: ["Work"],
};

beforeEach(() => {
  fakeBrowser.reset();
});

describe("guardedStorageWrite", () => {
  it("writes to storage and returns true when token is present and generation matches", async () => {
    await browser.storage.local.set({ [STORAGE_KEYS.AUTH_TOKEN]: "token" });
    let gen = 0;

    const written = await guardedStorageWrite(WRITE_DATA, 0, () => gen);

    expect(written).toBe(true);
    const result = await browser.storage.local.get(STORAGE_KEYS.TAB_GROUPS);
    expect(result[STORAGE_KEYS.TAB_GROUPS]).toEqual(SAMPLE_GROUPS);
  });

  it("skips write and returns false when no auth token is stored", async () => {
    // No token seeded - storage is empty after fakeBrowser.reset()
    let gen = 0;

    const written = await guardedStorageWrite(WRITE_DATA, 0, () => gen);

    expect(written).toBe(false);
    const result = await browser.storage.local.get(STORAGE_KEYS.TAB_GROUPS);
    expect(result[STORAGE_KEYS.TAB_GROUPS]).toBeUndefined();
  });

  it("skips write and returns false when generation has changed", async () => {
    await browser.storage.local.set({ [STORAGE_KEYS.AUTH_TOKEN]: "token" });
    // Generation already bumped past the captured value of 0
    let gen = 1;

    const written = await guardedStorageWrite(WRITE_DATA, 0, () => gen);

    expect(written).toBe(false);
    const result = await browser.storage.local.get(STORAGE_KEYS.TAB_GROUPS);
    expect(result[STORAGE_KEYS.TAB_GROUPS]).toBeUndefined();
  });

  it("skips write and leaves storage empty after invalidate-then-clear (delete-all flow)", async () => {
    // Seed a token and some local data
    await browser.storage.local.set({ [STORAGE_KEYS.AUTH_TOKEN]: "token", ...WRITE_DATA });

    let gen = 0;
    const capturedGen = gen; // captured when the load started

    // App.tsx calls invalidateInFlightLoads() FIRST (bumps generation),
    // then deleteAllLocalData() clears storage
    gen++; // invalidateInFlightLoads
    await browser.storage.local.clear(); // deleteAllLocalData

    // The in-flight load now tries to write account data back
    const written = await guardedStorageWrite(WRITE_DATA, capturedGen, () => gen);

    expect(written).toBe(false);
    // Storage must remain empty - the account data must not have been written back
    const result = await browser.storage.local.get(null);
    expect(Object.keys(result)).toHaveLength(0);
  });
});
