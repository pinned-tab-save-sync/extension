import { describe, it, expect } from "vitest";
import { MAX_GROUP_NAME_LENGTH, validateGroupName } from "./groupName";

describe("validateGroupName", () => {
  it.each(["Work", "constructor", "__proto__", "toString", "Café ☕", "<b>bold</b>", "'; DROP TABLE groups;--"])("accepts %s", (name) => {
    expect(validateGroupName(name)).toBeNull();
  });

  it("refuses an empty name", () => {
    expect(validateGroupName("")).toBe("Please enter a group name");
  });

  it("accepts a name of exactly the maximum length and refuses one character more", () => {
    expect(validateGroupName("a".repeat(MAX_GROUP_NAME_LENGTH))).toBeNull();
    expect(validateGroupName("a".repeat(MAX_GROUP_NAME_LENGTH + 1))).toBe("Group names cannot be longer than 50 characters");
  });

  it("counts an emoji as one character", () => {
    expect(validateGroupName("😀".repeat(MAX_GROUP_NAME_LENGTH))).toBeNull();
    expect(validateGroupName("😀".repeat(MAX_GROUP_NAME_LENGTH + 1))).not.toBeNull();
  });

  it.each([
    ["a tab", "Work\tHome"],
    ["a line break", "Work\nHome"],
    ["a null byte", "Work\0Home"],
    ["an escape", "Work\u001b[31mHome"],
    ["a C1 control", "Work\u0085Home"],
    ["a line separator", "Work\u2028Home"],
  ])("refuses %s", (_label, name) => {
    expect(validateGroupName(name)).toBe("Group names cannot contain line breaks or control characters");
  });
});
