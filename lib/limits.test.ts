import { describe, it, expect } from "vitest";
import { checkSaveAgainstLimits, findLimitViolation, findMatchingGroupName, getSyncLimitErrorMessage, isSameGroupName } from "./limits";
import { ApiClientError, NetworkError } from "./api/client";
import type { TabGroups, UserLimits } from "./types";

const LIMITS: UserLimits = { max_groups: 2, max_tabs_per_group: 3 };
const TWO_GROUPS: TabGroups = { Work: ["https://a.com"], Home: ["https://b.com"] };

describe("checkSaveAgainstLimits", () => {
  it("allows anything when there are no limits (logged out)", () => {
    expect(checkSaveAgainstLimits(TWO_GROUPS, "New", 50, null)).toBeNull();
  });

  it("blocks a new group when already at the group limit", () => {
    expect(checkSaveAgainstLimits(TWO_GROUPS, "New", 1, LIMITS)).toBe("You can sync up to 2 tab groups. Delete a group to save a new one.");
  });

  it("allows updating an existing group when at the group limit", () => {
    expect(checkSaveAgainstLimits(TWO_GROUPS, "Work", 3, LIMITS)).toBeNull();
  });

  it("blocks saving more tabs than the per-group limit", () => {
    expect(checkSaveAgainstLimits(TWO_GROUPS, "Work", 4, LIMITS)).toBe("You can sync up to 3 tabs per group. This window has 4 pinned tabs.");
  });

  it("treats a name differing only by case or accents as the existing group", () => {
    expect(checkSaveAgainstLimits(TWO_GROUPS, "work", 3, LIMITS)).toBeNull();
    expect(checkSaveAgainstLimits(TWO_GROUPS, "HÔME", 3, LIMITS)).toBeNull();
  });

  it("treats Object prototype names as new groups", () => {
    expect(checkSaveAgainstLimits(TWO_GROUPS, "constructor", 1, LIMITS)).toBe("You can sync up to 2 tab groups. Delete a group to save a new one.");
  });
});

describe("group name matching", () => {
  it("ignores case, accents, ß and trailing spaces like the API", () => {
    expect(isSameGroupName("Work", "WORK ")).toBe(true);
    expect(isSameGroupName("Cafe", "Café")).toBe(true);
    expect(isSameGroupName("strasse", "Straße")).toBe(true);
    expect(isSameGroupName("Work", "Works")).toBe(false);
  });

  it("finds the existing group a save would update, preferring an exact match", () => {
    const groups: TabGroups = { Work: [], work: [] };
    expect(findMatchingGroupName(groups, "work")).toBe("work");
    expect(findMatchingGroupName(groups, "WORK")).toBe("Work");
    expect(findMatchingGroupName(groups, "toString")).toBeNull();
  });
});

describe("findLimitViolation", () => {
  it("returns null when there are no limits", () => {
    expect(findLimitViolation({ ...TWO_GROUPS, Extra: [] }, null)).toBeNull();
  });

  it("returns null when the groups fit", () => {
    expect(findLimitViolation(TWO_GROUPS, LIMITS)).toBeNull();
  });

  it("reports too many groups", () => {
    expect(findLimitViolation({ ...TWO_GROUPS, Extra: ["https://c.com"] }, LIMITS)).toBe("This would sync 3 tab groups, but the limit is 2.");
  });

  it("reports a group with too many tabs", () => {
    const groups = { Work: ["https://a.com", "https://b.com", "https://c.com", "https://d.com"] };
    expect(findLimitViolation(groups, LIMITS)).toBe('"Work" has 4 tabs, but the limit is 3 per group.');
  });

  it("counts names the API stores as one group together", () => {
    const groups = { Work: ["https://a.com", "https://b.com"], work: ["https://c.com", "https://d.com"] };
    expect(findLimitViolation(groups, LIMITS)).toBe('"Work" has 4 tabs, but the limit is 3 per group.');
    expect(findLimitViolation({ Cafe: [], Café: [], Home: [] }, LIMITS)).toBeNull();
  });
});

describe("getSyncLimitErrorMessage", () => {
  it("returns the first tabs validation error from a 422", () => {
    const error = new ApiClientError("The given data was invalid.", 422, { tabs: ["You cannot sync more than 20 tab groups."] });
    expect(getSyncLimitErrorMessage(error)).toBe("You cannot sync more than 20 tab groups.");
  });

  it("ignores a 422 for a bad tab, which is not a limit rejection", () => {
    expect(getSyncLimitErrorMessage(new ApiClientError("Invalid URL.", 422, { "tabs.0.url": ["Invalid URL."] }))).toBeNull();
    expect(getSyncLimitErrorMessage(new ApiClientError("Too many tabs.", 422))).toBeNull();
  });

  it("ignores other errors", () => {
    expect(getSyncLimitErrorMessage(new ApiClientError("Server error", 500))).toBeNull();
    expect(getSyncLimitErrorMessage(new NetworkError())).toBeNull();
  });
});
