import { useEffect, useRef, useState } from "react";
import { EllipsisVertical, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { UpdateGroupButton } from "./UpdateGroupButton";

/** Row buttons shrink in the compact layout */
const COMPACT_ROW_BUTTON = "compact:h-7 compact:px-2.5";
const COMPACT_ROW_ICON_BUTTON = "compact:size-7";
/** Matches the 500ms turn of the Reset icon */
const RESET_ICON_TURN_MS = 500;

interface GroupRowContentProps {
  name: string;
  tabCount: number;
  /** The group is loaded in this window: offers Update and Reset instead of Open. */
  isActive: boolean;
  isConfirmingDelete: boolean;
  /** Disables the actions while a group's tabs are being opened. */
  isBusy: boolean;
  onOpen: () => void;
  /** Resolves true once the group is saved. */
  onUpdate: () => Promise<boolean>;
  onRequestDelete: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
}

/** A saved group's name, tab count and actions, or its inline delete confirmation. */
export function GroupRowContent({
  name,
  tabCount,
  isActive,
  isConfirmingDelete,
  isBusy,
  onOpen,
  onUpdate,
  onRequestDelete,
  onCancelDelete,
  onConfirmDelete,
}: GroupRowContentProps) {
  const [isResetIconTurning, setIsResetIconTurning] = useState(false);
  const resetTurnTimeoutId = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(resetTurnTimeoutId.current), []);

  // Cleared on a timer rather than on animationend, which never fires when reduced motion skips the animation
  const turnResetIcon = () => {
    setIsResetIconTurning(true);
    window.clearTimeout(resetTurnTimeoutId.current);
    resetTurnTimeoutId.current = window.setTimeout(() => setIsResetIconTurning(false), RESET_ICON_TURN_MS);
  };

  if (isConfirmingDelete) {
    return (
      <>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5 text-danger-soft-foreground compact:flex-row compact:items-baseline compact:gap-2">
          {/* Line heights match the normal row's, so its height does not change */}
          <span className="truncate text-sm leading-[22px] font-semibold">Delete {name}?</span>
          <span className="shrink-0 text-xs">Open tabs are not closed.</span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Button type="button" variant="outline" size="sm" onClick={onCancelDelete} className={COMPACT_ROW_BUTTON} autoFocus>
            Cancel
          </Button>
          <Button type="button" variant="destructive" size="sm" onClick={onConfirmDelete} className={cn("font-semibold", COMPACT_ROW_BUTTON)}>
            Delete
          </Button>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 compact:flex-row compact:items-center compact:gap-2">
        <span className="truncate text-[15px] leading-[22px] font-semibold compact:text-sm" title={name}>
          {name}
        </span>
        <div className="flex shrink-0 items-center gap-1.5 text-xs whitespace-nowrap text-muted-foreground">
          <span>
            {tabCount} {tabCount === 1 ? "tab" : "tabs"}
          </span>
          {isActive && (
            <span className="rounded-full bg-badge px-[7px] py-px text-[11px] leading-[14px] font-semibold text-badge-foreground">
              In this window
            </span>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {isActive ? (
          <>
            <UpdateGroupButton name={name} onUpdate={onUpdate} disabled={isBusy} className={COMPACT_ROW_BUTTON} />
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              onClick={() => {
                turnResetIcon();
                onOpen();
              }}
              disabled={isBusy}
              className={COMPACT_ROW_ICON_BUTTON}
              aria-label={`Reset this window to the saved ${name} tabs`}
              title="Reset window to saved tabs"
            >
              {/* One anticlockwise turn per click, following the arrow */}
              <RotateCcw aria-hidden="true" className={cn(isResetIconTurning && "motion-safe:animate-[spin_500ms_ease-in-out_reverse]")} />
            </Button>
          </>
        ) : (
          <Button type="button" variant="outline" size="sm" onClick={onOpen} disabled={isBusy} className={COMPACT_ROW_BUTTON}>
            Open
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="w-7 compact:h-7"
              disabled={isBusy}
              aria-label={`More actions for ${name}`}
            >
              <EllipsisVertical aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem variant="destructive" onSelect={onRequestDelete}>
              <Trash2 aria-hidden="true" />
              Delete group
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </>
  );
}
