import { useState } from "react";
import type { SyncConflictChoice, TabGroupsSummary } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface SyncConflictPromptProps {
  accountEmail: string;
  isResolving: boolean;
  /** Group and tab counts for the account and this browser. */
  summary: { account: TabGroupsSummary; browser: TabGroupsSummary } | null;
  /** Whether the browser currently has any local groups. When false, the "use browser" choice is blocked. */
  localHasGroups: boolean;
  /** Why keeping this browser's groups would break the sync limits, or null. Disables that choice. */
  browserLimitViolation: string | null;
  /** Why merging would break the sync limits, or null. Disables that choice. */
  mergeLimitViolation: string | null;
  /** Error from the last attempted choice, e.g. the API rejecting it. */
  error: string | null;
  onChoose: (choice: SyncConflictChoice) => void;
}

interface ConflictOption {
  choice: SyncConflictChoice;
  label: string;
  description: string;
  confirmLabel: string;
  /** Why the option cannot be chosen, or null when it can. */
  disabledReason: string | null;
}

/**
 * Shown in place of the group list when the local tab groups differ from the account
 * and have been edited since the last successful sync.
 * Nothing is selected to start with - "account" and "browser" are destructive to one side,
 * and "merge" keeps everything, leaving the user to tidy up afterwards.
 */
export function SyncConflictPrompt({
  accountEmail,
  isResolving,
  summary,
  localHasGroups,
  browserLimitViolation,
  mergeLimitViolation,
  error,
  onChoose,
}: SyncConflictPromptProps) {
  const [selectedChoice, setSelectedChoice] = useState<SyncConflictChoice | null>(null);

  const options: ConflictOption[] = [
    {
      choice: "account",
      label: "Keep my account's groups",
      description: "Replaces the groups in this browser.",
      confirmLabel: "Keep account's groups",
      disabledReason: null,
    },
    {
      choice: "browser",
      label: "Keep this browser's groups",
      description: "Replaces the groups saved in your account.",
      confirmLabel: "Keep this browser's groups",
      disabledReason: !localHasGroups ? "There are no tab groups in this browser to keep." : browserLimitViolation,
    },
    {
      choice: "merge",
      label: "Merge both",
      description: "Keeps every group from both, and adds this browser's tabs to matching groups. Nothing is removed.",
      confirmLabel: "Merge both",
      disabledReason: mergeLimitViolation,
    },
  ];

  // A choice can become unavailable after it was picked (e.g. the groups changed), so check it again
  const selectedOption = options.find((option) => option.choice === selectedChoice && option.disabledReason === null) ?? null;

  return (
    <section
      aria-labelledby="conflict-title"
      className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto px-5 pt-4 pb-4 compact:gap-2.5 compact:pt-3 compact:pb-3"
    >
      <div className="flex flex-col gap-1.5">
        <h2 id="conflict-title" className="text-[17px] leading-snug font-bold">
          This browser and your account don't match
        </h2>
        <p className="text-[13px] leading-normal text-muted-foreground">
          The groups in this browser changed since they last synced, and differ from the groups saved in {accountEmail}. Choose which to keep before
          syncing again.
        </p>
      </div>

      {summary && (
        <div className="grid grid-cols-2 gap-2">
          <SummaryCard label="Your account" summary={summary.account} />
          <SummaryCard label="This browser" summary={summary.browser} />
        </div>
      )}

      <fieldset className="flex flex-col gap-2" disabled={isResolving}>
        <legend className="sr-only">Which groups to keep</legend>
        {options.map((option) => {
          const isDisabled = option.disabledReason !== null;
          const isSelected = selectedOption?.choice === option.choice;

          return (
            <label
              key={option.choice}
              className={cn(
                "flex items-start gap-3 rounded-[10px] border px-3.5 py-3 compact:py-2",
                isDisabled
                  ? "cursor-not-allowed border-dashed border-input bg-muted"
                  : isSelected
                    ? "cursor-pointer border-primary bg-selected ring-1 ring-primary"
                    : "cursor-pointer border-input bg-background hover:bg-muted",
              )}
            >
              <input
                type="radio"
                name="sync-conflict-choice"
                value={option.choice}
                checked={isSelected}
                disabled={isDisabled}
                onChange={() => setSelectedChoice(option.choice)}
                className="mt-0.5 size-4 shrink-0 accent-primary"
              />
              <span className="flex flex-col gap-0.5">
                <span className={cn("text-sm font-semibold", isDisabled && "text-muted-foreground")}>{option.label}</span>
                <span
                  className={cn("text-xs leading-normal", isDisabled ? "text-destructive dark:text-danger-soft-foreground" : "text-muted-foreground")}
                >
                  {option.disabledReason ?? option.description}
                </span>
              </span>
            </label>
          );
        })}
      </fieldset>

      {error && (
        <p role="alert" className="text-xs text-destructive dark:text-danger-soft-foreground">
          {error}
        </p>
      )}

      <div className="mt-auto flex justify-end">
        <Button
          type="button"
          size="lg"
          className="px-[18px] font-semibold"
          disabled={selectedOption === null || isResolving}
          onClick={() => selectedOption && onChoose(selectedOption.choice)}
        >
          {isResolving ? "Working..." : (selectedOption?.confirmLabel ?? "Choose an option")}
        </Button>
      </div>
    </section>
  );
}

function SummaryCard({ label, summary }: { label: string; summary: TabGroupsSummary }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-[10px] border bg-muted px-3 py-2.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-[15px] font-semibold">
        {summary.groups} {summary.groups === 1 ? "group" : "groups"}, {summary.tabs} {summary.tabs === 1 ? "tab" : "tabs"}
      </span>
    </div>
  );
}
