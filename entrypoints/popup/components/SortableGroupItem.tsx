import type { ReactNode } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface SortableGroupItemProps {
  id: string;
  isActive: boolean;
  /** Shows the row as an inline delete confirmation, without the drag handle. */
  isConfirmingDelete: boolean;
  /** Draws a divider below the row; App leaves it off the last row and next to highlighted rows, which have their own border. */
  hasDivider: boolean;
  children: ReactNode;
}

export function SortableGroupItem({ id, isActive, isConfirmingDelete, hasDivider, children }: SortableGroupItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        "relative flex items-center gap-2.5 rounded-[10px] border py-2 pr-2 pl-1 compact:gap-2 compact:py-1",
        // Sits in the middle of the list's 3px gap
        hasDivider && "after:pointer-events-none after:absolute after:inset-x-2 after:-bottom-[3px] after:h-px after:bg-border",
        isConfirmingDelete
          ? "border-danger-soft-border bg-danger-soft"
          : isActive
            ? "border-selected-border bg-selected"
            : "border-transparent hover:bg-muted",
        isDragging && "z-10 bg-muted opacity-60 after:hidden",
      )}
    >
      {isConfirmingDelete ? (
        // Same slot as the drag handle, so the row does not shift when the confirmation opens
        <span
          aria-hidden="true"
          className="inline-flex h-9 w-5 shrink-0 items-center justify-center text-destructive compact:h-7 dark:text-danger-soft-foreground"
        >
          <Trash2 className="size-[18px]" />
        </span>
      ) : (
        <button
          type="button"
          className="inline-flex h-9 w-5 shrink-0 compact:h-7 cursor-grab touch-none items-center justify-center rounded text-faint hover:text-muted-foreground active:cursor-grabbing"
          {...attributes}
          {...listeners}
          aria-label="Drag to reorder"
        >
          <GripVertical aria-hidden="true" className="size-4" />
        </button>
      )}
      {children}
    </li>
  );
}
