import { useMemo, useState } from "react";
import type { TabGroups, UserLimits } from "@/lib/types";
import { applyImport, describeImportOutcome, type ImportMode, type ImportedGroup, type ParsedImportFile } from "@/lib/import";
import { findLimitViolation } from "@/lib/limits";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

interface ImportPreviewProps {
  fileName: string;
  parsedFile: ParsedImportFile;
  existingGroups: TabGroups;
  existingGroupOrder: string[];
  isAuthenticated: boolean;
  syncLimits: UserLimits | null;
  /** Resolves to why nothing was imported, or null once imported. */
  onImport: (importedGroups: ImportedGroup[], mode: ImportMode) => Promise<string | null>;
  onChooseAnotherFile: () => void;
}

function pluralise(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/** The groups found in an export, each with a checkbox, and (when this browser has groups) a merge or replace choice. */
export function ImportPreview({
  fileName,
  parsedFile,
  existingGroups,
  existingGroupOrder,
  isAuthenticated,
  syncLimits,
  onImport,
  onChooseAnotherFile,
}: ImportPreviewProps) {
  // Every group that can be imported starts ticked; keyed by position, as skipped groups can share a name
  const [selectedIndexes, setSelectedIndexes] = useState<Set<number>>(
    () => new Set(parsedFile.groups.flatMap((group, index) => (group.skipReason === null ? [index] : []))),
  );
  const [mode, setMode] = useState<ImportMode>("merge");
  const [isImporting, setIsImporting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const hasExistingGroups = existingGroupOrder.length > 0;
  const importableIndexes = parsedFile.groups.flatMap((group, index) => (group.skipReason === null ? [index] : []));
  const selectedGroups = useMemo(
    () => parsedFile.groups.filter((group, index) => group.skipReason === null && selectedIndexes.has(index)),
    [parsedFile.groups, selectedIndexes],
  );

  const limitViolation = useMemo(
    () =>
      selectedGroups.length > 0
        ? findLimitViolation(applyImport({ groups: existingGroups, groupOrder: existingGroupOrder }, selectedGroups, mode).groups, syncLimits)
        : null,
    [selectedGroups, existingGroups, existingGroupOrder, mode, syncLimits],
  );

  const toggleGroup = (index: number, isSelected: boolean) => {
    setErrorMessage(null);
    setSelectedIndexes((current) => {
      const updated = new Set(current);
      if (isSelected) {
        updated.add(index);
      } else {
        updated.delete(index);
      }
      return updated;
    });
  };

  const handleImport = async () => {
    setIsImporting(true);
    setErrorMessage(null);
    try {
      const reason = await onImport(selectedGroups, hasExistingGroups ? mode : "merge");
      if (reason) {
        setErrorMessage(reason);
      }
    } catch (error) {
      setErrorMessage(`Could not import the groups: ${error instanceof Error && error.message ? error.message : "the browser did not say why"}`);
    } finally {
      setIsImporting(false);
    }
  };

  const modeOptions: { mode: ImportMode; label: string; description: string }[] = [
    {
      mode: "merge",
      label: "Add to my groups",
      description: "Keeps your groups. A group with the same name as one of yours gets the tabs it is missing.",
    },
    {
      mode: "replace",
      label: "Replace my groups",
      description: `Deletes the ${pluralise(existingGroupOrder.length, "group", "groups")} saved in this browser${isAuthenticated ? " and your account" : ""}, and keeps only the imported ones.`,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm">
          Found {pluralise(parsedFile.groups.length, "group", "groups")} in <span className="font-semibold">{fileName}</span>, a{" "}
          {parsedFile.sourceName} export.
        </p>
        <Button type="button" variant="link" size="sm" className="h-auto px-0" onClick={onChooseAnotherFile} disabled={isImporting}>
          Choose another file
        </Button>
      </div>

      {parsedFile.groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">The export has no tab groups in it.</p>
      ) : (
        <section aria-labelledby="import-groups-title" className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-2">
            <h2 id="import-groups-title" className="text-sm font-semibold">
              Groups to import
            </h2>
            {importableIndexes.length > 1 && (
              <div className="flex gap-3 text-[13px]">
                <button
                  type="button"
                  className="cursor-pointer text-primary hover:underline"
                  onClick={() => setSelectedIndexes(new Set(importableIndexes))}
                >
                  Select all
                </button>
                <button type="button" className="cursor-pointer text-primary hover:underline" onClick={() => setSelectedIndexes(new Set())}>
                  Select none
                </button>
              </div>
            )}
          </div>

          <ul className="flex flex-col divide-y rounded-[10px] border">
            {parsedFile.groups.map((group, index) => {
              const isSkipped = group.skipReason !== null;
              const checkboxId = `import-group-${index}`;
              return (
                <li key={index} className={cn("flex items-start gap-3 px-4 py-3", isSkipped && "bg-muted")}>
                  <Checkbox
                    id={checkboxId}
                    className="mt-0.5"
                    checked={!isSkipped && selectedIndexes.has(index)}
                    disabled={isSkipped || isImporting}
                    onCheckedChange={(checked) => toggleGroup(index, checked === true)}
                  />
                  <label htmlFor={checkboxId} className={cn("flex min-w-0 flex-col gap-0.5", !isSkipped && "cursor-pointer")}>
                    <span className={cn("text-sm font-semibold break-words", isSkipped && "text-muted-foreground")}>
                      {group.name || "Unnamed group"}
                    </span>
                    <span className="text-[13px] text-muted-foreground">
                      {isSkipped ? (
                        <span className="text-destructive dark:text-danger-soft-foreground">Cannot be imported: {group.skipReason}</span>
                      ) : (
                        <GroupDetails group={group} existingGroups={existingGroups} mode={hasExistingGroups ? mode : "merge"} />
                      )}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {hasExistingGroups && importableIndexes.length > 0 && (
        <fieldset className="flex flex-col gap-2" disabled={isImporting}>
          <legend className="mb-2 text-sm font-semibold">
            This browser already has {pluralise(existingGroupOrder.length, "saved group", "saved groups")}
          </legend>
          {modeOptions.map((option) => {
            const isSelected = mode === option.mode;
            return (
              <label
                key={option.mode}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-[10px] border px-4 py-3",
                  isSelected ? "border-primary bg-selected ring-1 ring-primary" : "border-input bg-background hover:bg-muted",
                )}
              >
                <input
                  type="radio"
                  name="import-mode"
                  value={option.mode}
                  checked={isSelected}
                  onChange={() => {
                    setMode(option.mode);
                    setErrorMessage(null);
                  }}
                  className="mt-0.5 size-4 shrink-0 accent-primary"
                />
                <span className="flex flex-col gap-0.5">
                  <span className="text-sm font-semibold">{option.label}</span>
                  <span className="text-[13px] leading-normal text-muted-foreground">{option.description}</span>
                </span>
              </label>
            );
          })}
        </fieldset>
      )}

      {(limitViolation || errorMessage) && (
        <p role="alert" className="text-[13px] text-destructive dark:text-danger-soft-foreground">
          {errorMessage ?? `${limitViolation} Untick some groups to import the rest.`}
        </p>
      )}

      {importableIndexes.length > 0 && (
        <div className="flex justify-end">
          <Button
            type="button"
            size="lg"
            className="font-semibold"
            variant={hasExistingGroups && mode === "replace" ? "destructive" : "default"}
            disabled={selectedGroups.length === 0 || limitViolation !== null || isImporting}
            onClick={handleImport}
          >
            {isImporting
              ? "Importing..."
              : selectedGroups.length === 0
                ? "Choose groups to import"
                : `${hasExistingGroups && mode === "replace" ? "Replace with" : "Import"} ${pluralise(selectedGroups.length, "group", "groups")}`}
          </Button>
        </div>
      )}
    </div>
  );
}

/** A group's tab count and what importing it will do. */
function GroupDetails({ group, existingGroups, mode }: { group: ImportedGroup; existingGroups: TabGroups; mode: ImportMode }) {
  const outcome = describeImportOutcome(existingGroups, group, mode);
  const details = [pluralise(group.urls.length, "tab", "tabs")];

  if (outcome.kind === "merge") {
    details.push(
      outcome.newTabCount === 0
        ? `already in your "${outcome.existingName}" group`
        : `adds ${pluralise(outcome.newTabCount, "tab", "tabs")} to your "${outcome.existingName}" group`,
    );
  }

  if (group.leftOutTabCount > 0) {
    details.push(`${pluralise(group.leftOutTabCount, "tab", "tabs")} left out: only web addresses and browser pages can be saved`);
  }

  return <>{details.join(" - ")}</>;
}
