import type { TabGroups } from "./types";
import { createGroupMap } from "./sync";
import { findMatchingGroupName, isSameGroupName } from "./limits";
import { trimGroupName, validateGroupName } from "./groupName";
import { toSyncableTabUrl } from "./tabUrl";

/** How imported groups are combined with the groups already saved in this browser. */
export type ImportMode = "merge" | "replace";

/** A group as another extension exported it, before it is checked. */
interface ExportedGroup {
  name: string;
  urls: string[];
}

/** A group read from an export file and checked against the rules every saved group follows. */
export interface ImportedGroup {
  /** The name, trimmed the way the API trims it. */
  name: string;
  /** The tabs that can be saved, written as the API will store them (see `toSyncableTabUrl`), in the export's order. */
  urls: string[];
  /** Tabs left out because their URL cannot be saved (e.g. `javascript:` or `data:`). */
  leftOutTabCount: number;
  /** Why the group cannot be imported, or null when it can. */
  skipReason: string | null;
}

export interface ParsedImportFile {
  /** The extension the file was exported from, e.g. "Save Pinned Tabs". */
  sourceName: string;
  groups: ImportedGroup[];
}

/** What importing a group would do to the groups saved in this browser. */
export type ImportOutcome = { kind: "new" } | { kind: "merge"; existingName: string; newTabCount: number };

interface ImportFormat {
  sourceName: string;
  /** The export's groups, or null when the file is not in this format. */
  read: (data: unknown) => ExportedGroup[] | null;
}

/** Thrown when a file cannot be read as any supported export. The message is shown to the user. */
export class ImportFileError extends Error {}

/**
 * Save Pinned Tabs (Chrome / Edge) export: `{ "version": 2, "sets": [{ "id", "name", "tabs": ["https://..."] }], "autoload": {...} }`.
 * Tabs are also accepted as `{ "url": "..." }` objects, in case another version of the extension writes them that way.
 */
export function readSavePinnedTabsExport(data: unknown): ExportedGroup[] | null {
  if (!isRecord(data) || !Array.isArray(data.sets)) {
    return null;
  }

  return data.sets.filter(isRecord).map((set) => ({
    name: typeof set.name === "string" ? set.name : "",
    urls: Array.isArray(set.tabs) ? set.tabs.map(readTabUrl).filter((url): url is string => url !== null) : [],
  }));
}

function readTabUrl(tab: unknown): string | null {
  if (typeof tab === "string") {
    return tab;
  }

  return isRecord(tab) && typeof tab.url === "string" ? tab.url : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const IMPORT_FORMATS: ImportFormat[] = [{ sourceName: "Save Pinned Tabs", read: readSavePinnedTabsExport }];

/** The extensions whose exports can be imported, for telling the user. */
export const SUPPORTED_IMPORT_SOURCES = IMPORT_FORMATS.map((format) => format.sourceName);

/** Read an export file's text as the first supported format it matches. Throws `ImportFileError` when none match. */
export function parseImportFile(text: string): ParsedImportFile {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ImportFileError(unsupportedFileMessage());
  }

  for (const format of IMPORT_FORMATS) {
    const exportedGroups = format.read(data);
    if (exportedGroups !== null) {
      return { sourceName: format.sourceName, groups: checkExportedGroups(exportedGroups) };
    }
  }

  throw new ImportFileError(unsupportedFileMessage());
}

function unsupportedFileMessage(): string {
  return `This file is not an export that can be imported. Supported: ${SUPPORTED_IMPORT_SOURCES.join(", ")}.`;
}

/**
 * Trim names, leave out tabs that cannot be saved, and give a skip reason to any group that cannot be imported.
 * Groups the API would store as one (e.g. "Work" and "work") are combined into the first, without repeating a tab.
 */
function checkExportedGroups(exportedGroups: ExportedGroup[]): ImportedGroup[] {
  const groups: (ExportedGroup & { leftOutTabCount: number; nameError: string | null })[] = [];

  for (const exportedGroup of exportedGroups) {
    const name = trimGroupName(exportedGroup.name);
    const nameError = validateGroupName(name);
    const urls = exportedGroup.urls.map((url) => toSyncableTabUrl(url.trim())).filter((url): url is string => url !== null);
    const leftOutTabCount = exportedGroup.urls.length - urls.length;

    const sameNameGroup = nameError === null ? groups.find((group) => group.nameError === null && isSameGroupName(group.name, name)) : undefined;
    if (sameNameGroup) {
      sameNameGroup.urls.push(...urls.filter((url) => !sameNameGroup.urls.includes(url)));
      sameNameGroup.leftOutTabCount += leftOutTabCount;
    } else {
      groups.push({ name, urls, leftOutTabCount, nameError });
    }
  }

  return groups.map(({ name, urls, leftOutTabCount, nameError }) => ({
    name,
    urls,
    leftOutTabCount,
    skipReason: findSkipReason(name, nameError, urls.length, leftOutTabCount),
  }));
}

function findSkipReason(name: string, nameError: string | null, allowedTabCount: number, leftOutTabCount: number): string | null {
  if (name === "") {
    return "It has no name";
  }

  if (nameError !== null) {
    return nameError;
  }

  if (allowedTabCount === 0) {
    return leftOutTabCount === 0 ? "It has no tabs" : "None of its tabs can be saved: only web addresses and browser pages can be";
  }

  return null;
}

/** What importing `group` would do: add a new group, or add its missing tabs to an existing group with the same name. */
export function describeImportOutcome(existingGroups: TabGroups, group: ImportedGroup, mode: ImportMode): ImportOutcome {
  const existingName = mode === "merge" ? findMatchingGroupName(existingGroups, group.name) : null;
  if (existingName === null) {
    return { kind: "new" };
  }

  const existingUrls = existingGroups[existingName] ?? [];
  const newTabCount = new Set(group.urls.filter((url) => !existingUrls.includes(url))).size;

  return { kind: "merge", existingName, newTabCount };
}

/**
 * The groups saved in this browser after importing `importedGroups` (groups with a skip reason are ignored).
 * - merge: existing groups are kept in order; an imported group with the same name as one (case and accents
 *   ignored, as the API compares them) adds the tabs it is missing at the end, and other imported groups are added after them.
 * - replace: only the imported groups are kept.
 */
export function applyImport(
  existing: { groups: TabGroups; groupOrder: string[] },
  importedGroups: ImportedGroup[],
  mode: ImportMode,
): { groups: TabGroups; groupOrder: string[] } {
  const groups = createGroupMap();
  const groupOrder: string[] = [];

  if (mode === "merge") {
    for (const name of [...existing.groupOrder, ...Object.keys(existing.groups)]) {
      const urls = Object.hasOwn(existing.groups, name) ? existing.groups[name] : undefined;
      if (urls && !Object.hasOwn(groups, name)) {
        groups[name] = [...urls];
        groupOrder.push(name);
      }
    }
  }

  for (const importedGroup of importedGroups) {
    if (importedGroup.skipReason !== null) {
      continue;
    }

    const existingName = findMatchingGroupName(groups, importedGroup.name);
    const existingUrls = existingName === null ? undefined : groups[existingName];
    if (existingUrls) {
      existingUrls.push(...importedGroup.urls.filter((url, index, urls) => !existingUrls.includes(url) && urls.indexOf(url) === index));
    } else {
      groups[importedGroup.name] = [...importedGroup.urls];
      groupOrder.push(importedGroup.name);
    }
  }

  return { groups, groupOrder };
}
