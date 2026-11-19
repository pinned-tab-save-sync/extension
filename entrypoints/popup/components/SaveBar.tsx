import type { FormEvent } from "react";
import { Pin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IS_LOCAL_ONLY } from "@/lib/buildMode";
import type { WindowPinnedTab } from "../hooks/usePinnedTabs";
import { TabIcon } from "./TabIcon";

/** How many tab icons the bar shows before summarising the rest as "+N". */
const MAX_PREVIEW_ICONS = 4;

interface SaveBarProps {
  pinnedTabs: WindowPinnedTab[];
  groupName: string;
  onGroupNameChange: (name: string) => void;
  onSave: () => void;
  warning: string | null;
}

/** One-line bar for saving the window's pinned tabs as a group, with a preview of the tabs it will save. */
export function SaveBar({ pinnedTabs, groupName, onGroupNameChange, onSave, warning }: SaveBarProps) {
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSave();
  };

  return (
    <section aria-label="Save this window's pinned tabs" className="shrink-0 px-4 pt-3 compact:pt-2">
      <form
        onSubmit={handleSubmit}
        className="flex h-11 items-center gap-2.5 compact:h-9 compact:gap-2 rounded-[10px] border border-input bg-background pr-1 pl-2.5 transition-[box-shadow] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/30"
      >
        <PinnedTabsPreview pinnedTabs={pinnedTabs} />
        <span aria-hidden="true" className="h-5 w-px shrink-0 bg-border" />
        <label htmlFor="group-name" className="sr-only">
          Name a new group for this window's pinned tabs
        </label>
        <input
          id="group-name"
          type="text"
          value={groupName}
          onChange={(event) => onGroupNameChange(event.target.value)}
          placeholder="Save as new group..."
          autoComplete="off"
          className="h-full min-w-0 flex-1 border-0 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
        />
        <Button type="submit" size="sm" className="h-[34px] font-semibold compact:h-7">
          Save
        </Button>
      </form>
      <div className="min-h-5 px-1 compact:min-h-2">
        {warning && (
          <p role="alert" className="mt-1 text-xs text-destructive dark:text-danger-soft-foreground">
            {warning}
          </p>
        )}
      </div>
    </section>
  );
}

/**
 * Overlapping icons of the window's pinned tabs, or a pin when there are none. A local-only build shows the
 * lettered circles instead of favicons: loading a favicon is a request to its site, and that build makes none.
 */
function PinnedTabsPreview({ pinnedTabs }: { pinnedTabs: WindowPinnedTab[] }) {
  if (pinnedTabs.length === 0) {
    return (
      <span role="img" aria-label="No pinned tabs in this window" title="No pinned tabs in this window" className="inline-flex shrink-0 text-faint">
        <Pin className="size-[18px]" aria-hidden="true" />
      </span>
    );
  }

  const label = `${pinnedTabs.length} pinned ${pinnedTabs.length === 1 ? "tab" : "tabs"} in this window`;
  const hiddenCount = pinnedTabs.length - MAX_PREVIEW_ICONS;

  return (
    <span
      role="img"
      aria-label={label}
      title={pinnedTabs.map((tab) => tab.title || tab.url).join("\n")}
      className="inline-flex shrink-0 items-center pl-[6px]"
    >
      {pinnedTabs.slice(0, MAX_PREVIEW_ICONS).map((tab, index) => (
        <TabIcon
          key={tab.id ?? index}
          url={tab.url}
          favIconUrl={IS_LOCAL_ONLY ? undefined : tab.favIconUrl}
          className="-ml-[6px] ring-2 ring-background"
        />
      ))}
      {hiddenCount > 0 && <span className="ml-1.5 text-xs font-semibold text-muted-foreground">+{hiddenCount}</span>}
    </span>
  );
}
