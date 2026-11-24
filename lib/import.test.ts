import { describe, it, expect } from "vitest";
import { applyImport, describeImportOutcome, ImportFileError, parseImportFile, type ImportedGroup } from "./import";
import type { TabGroups } from "./types";

/** A Save Pinned Tabs export (version 2), as its options page writes it. */
function savePinnedTabsExport(sets: { name: unknown; tabs: unknown }[]): string {
  return JSON.stringify({
    version: 2,
    sets: sets.map((set, index) => ({ id: `id-${index}`, ...set })),
    autoload: { scope: "first-window", setIds: [] },
  });
}

function importedGroup(name: string, urls: string[]): ImportedGroup {
  return { name, urls, leftOutTabCount: 0, skipReason: null };
}

describe("parseImportFile", () => {
  it("reads a Save Pinned Tabs export", () => {
    const parsed = parseImportFile(
      savePinnedTabsExport([
        { name: "Work", tabs: ["https://gitlab.com/example", "https://chatgpt.com/"] },
        { name: "Social", tabs: ["https://mail.google.com/mail/u/0/#inbox"] },
      ]),
    );

    expect(parsed).toEqual({
      sourceName: "Save Pinned Tabs",
      groups: [
        { name: "Work", urls: ["https://gitlab.com/example", "https://chatgpt.com/"], leftOutTabCount: 0, skipReason: null },
        { name: "Social", urls: ["https://mail.google.com/mail/u/0/#inbox"], leftOutTabCount: 0, skipReason: null },
      ],
    });
  });

  it("accepts tabs written as objects with a url", () => {
    const parsed = parseImportFile(savePinnedTabsExport([{ name: "Work", tabs: [{ url: "https://a.example/" }, { title: "no url" }] }]));

    expect(parsed.groups[0]?.urls).toEqual(["https://a.example/"]);
  });

  it("refuses a file that is not JSON", () => {
    expect(() => parseImportFile("not json")).toThrow(ImportFileError);
  });

  it("refuses JSON that is not a supported export", () => {
    expect(() => parseImportFile(JSON.stringify({ groups: [] }))).toThrow(
      "This file is not an export that can be imported. Supported: Save Pinned Tabs.",
    );
    expect(() => parseImportFile("[]")).toThrow(ImportFileError);
  });

  it("reads an export with no sets", () => {
    expect(parseImportFile(savePinnedTabsExport([])).groups).toEqual([]);
  });

  it("trims names and skips groups whose name cannot be saved", () => {
    const parsed = parseImportFile(
      savePinnedTabsExport([
        { name: "  Work  ", tabs: ["https://a.example/"] },
        { name: "   ", tabs: ["https://a.example/"] },
        { name: 42, tabs: ["https://a.example/"] },
        { name: "x".repeat(51), tabs: ["https://a.example/"] },
        { name: "Line\nbreak", tabs: ["https://a.example/"] },
      ]),
    );

    expect(parsed.groups.map((group) => [group.name, group.skipReason])).toEqual([
      ["Work", null],
      ["", "It has no name"],
      ["", "It has no name"],
      ["x".repeat(51), "Group names cannot be longer than 50 characters"],
      ["Line\nbreak", "Group names cannot contain line breaks or control characters"],
    ]);
  });

  it("leaves out tabs that cannot be saved and counts them", () => {
    const parsed = parseImportFile(
      savePinnedTabsExport([{ name: "Work", tabs: ["https://a.example/", "javascript:alert(1)", "data:text/html,hi"] }]),
    );

    expect(parsed.groups[0]).toEqual({ name: "Work", urls: ["https://a.example/"], leftOutTabCount: 2, skipReason: null });
  });

  it("skips a group with no tabs, or none that can be saved", () => {
    const parsed = parseImportFile(
      savePinnedTabsExport([
        { name: "Empty", tabs: [] },
        { name: "Missing", tabs: undefined },
        { name: "Scripts", tabs: ["javascript:alert(1)"] },
      ]),
    );

    expect(parsed.groups.map((group) => group.skipReason)).toEqual([
      "It has no tabs",
      "It has no tabs",
      "None of its tabs can be saved: only web addresses and browser pages can be",
    ]);
  });

  it("combines groups the API would store as one, without repeating a tab", () => {
    const parsed = parseImportFile(
      savePinnedTabsExport([
        { name: "Work", tabs: ["https://a.example/", "https://b.example/"] },
        { name: "WORK ", tabs: ["https://b.example/", "https://c.example/"] },
      ]),
    );

    expect(parsed.groups).toEqual([
      { name: "Work", urls: ["https://a.example/", "https://b.example/", "https://c.example/"], leftOutTabCount: 0, skipReason: null },
    ]);
  });

  it("imports groups named after Object.prototype members", () => {
    const parsed = parseImportFile(
      savePinnedTabsExport([
        { name: "constructor", tabs: ["https://a.example/"] },
        { name: "__proto__", tabs: ["https://b.example/"] },
      ]),
    );

    expect(parsed.groups.map((group) => [group.name, group.skipReason])).toEqual([
      ["constructor", null],
      ["__proto__", null],
    ]);
  });

  describe("values the API would refuse or change", () => {
    it("trims invisible characters from names as the API does, so a name of only them has no name", () => {
      const parsed = parseImportFile(
        savePinnedTabsExport([
          { name: "\u200bWork\u2060", tabs: ["https://a.example/"] },
          { name: "\u200b\u00ad", tabs: ["https://a.example/"] },
        ]),
      );

      expect(parsed.groups.map((group) => [group.name, group.skipReason])).toEqual([
        ["Work", null],
        ["", "It has no name"],
      ]);
    });

    it("refuses a name with a lone surrogate, which would stop every sync", () => {
      const parsed = parseImportFile('{"sets":[{"name":"Work\\ud800","tabs":["https://a.example/"]}]}');

      expect(parsed.groups[0]?.skipReason).toBe("Group names cannot contain line breaks or control characters");
    });

    it("writes URLs as the API will store them, and leaves out the ones it would refuse", () => {
      // Raw JSON, so the third URL holds a real lone surrogate
      const parsed = parseImportFile(
        '{"sets":[{"name":"Work","tabs":["HTTPS://A.EXAMPLE/a|b","https://a..example/","https://a.example/\\ud800","https://例え.jp/"]}]}',
      );

      expect(parsed.groups[0]).toEqual({
        name: "Work",
        urls: ["https://a.example/a%7Cb", "https://a.example/%EF%BF%BD", "https://xn--r8jz45g.jp/"],
        leftOutTabCount: 1,
        skipReason: null,
      });
    });

    it("ignores values that are not strings", () => {
      const parsed = parseImportFile(
        JSON.stringify({ sets: [{ name: ["Work"], tabs: [42, null, { url: 7 }, "https://a.example/"] }, "not a set", null] }),
      );

      expect(parsed.groups).toEqual([{ name: "", urls: ["https://a.example/"], leftOutTabCount: 0, skipReason: "It has no name" }]);
    });
  });
});

describe("applyImport", () => {
  const existing = { groups: { Work: ["https://a.example/"], Café: ["https://b.example/"] } as TabGroups, groupOrder: ["Café", "Work"] };

  it("merges: keeps existing groups, adds missing tabs to a same-named group and appends new groups", () => {
    const result = applyImport(
      existing,
      [importedGroup("work", ["https://a.example/", "https://c.example/"]), importedGroup("Home", ["https://d.example/"])],
      "merge",
    );

    expect(result.groupOrder).toEqual(["Café", "Work", "Home"]);
    expect({ ...result.groups }).toEqual({
      Café: ["https://b.example/"],
      Work: ["https://a.example/", "https://c.example/"],
      Home: ["https://d.example/"],
    });
  });

  it("matches existing groups ignoring accents, keeping the existing name", () => {
    const result = applyImport(existing, [importedGroup("cafe", ["https://e.example/"])], "merge");

    expect(result.groupOrder).toEqual(["Café", "Work"]);
    expect(result.groups["Café"]).toEqual(["https://b.example/", "https://e.example/"]);
  });

  it("replaces: keeps only the imported groups", () => {
    const result = applyImport(existing, [importedGroup("Work", ["https://c.example/"]), importedGroup("Home", ["https://d.example/"])], "replace");

    expect(result.groupOrder).toEqual(["Work", "Home"]);
    expect({ ...result.groups }).toEqual({ Work: ["https://c.example/"], Home: ["https://d.example/"] });
  });

  it("ignores groups that cannot be imported", () => {
    const skipped: ImportedGroup = { name: "", urls: ["https://c.example/"], leftOutTabCount: 0, skipReason: "It has no name" };

    expect(applyImport(existing, [skipped], "replace").groupOrder).toEqual([]);
  });

  it("does not let a group named __proto__ touch the prototype", () => {
    const result = applyImport({ groups: {}, groupOrder: [] }, [importedGroup("__proto__", ["https://a.example/"])], "merge");

    expect(result.groupOrder).toEqual(["__proto__"]);
    expect(Object.hasOwn(result.groups, "__proto__")).toBe(true);
    expect(Object.getPrototypeOf(result.groups)).toBeNull();
  });
});

describe("describeImportOutcome", () => {
  const existingGroups: TabGroups = { Work: ["https://a.example/", "https://b.example/"] };

  it("is a new group when no group has the name", () => {
    expect(describeImportOutcome(existingGroups, importedGroup("Home", ["https://a.example/"]), "merge")).toEqual({ kind: "new" });
  });

  it("counts the tabs a merge adds to a same-named group", () => {
    expect(describeImportOutcome(existingGroups, importedGroup("work", ["https://a.example/", "https://c.example/"]), "merge")).toEqual({
      kind: "merge",
      existingName: "Work",
      newTabCount: 1,
    });
  });

  it("is always a new group when replacing", () => {
    expect(describeImportOutcome(existingGroups, importedGroup("Work", ["https://c.example/"]), "replace")).toEqual({ kind: "new" });
  });
});
