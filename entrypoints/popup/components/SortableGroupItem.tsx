import { ReactNode } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface SortableGroupItemProps {
  id: string;
  isActive: boolean;
  children: ReactNode;
}

export function SortableGroupItem({ id, isActive, children }: SortableGroupItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`flex items-center p-2 border-b last:border-b-0 border-gray-200 dark:border-gray-700 gap-2 ${
        isActive ? "bg-indigo-500/10 rounded" : ""
      } ${isDragging ? "opacity-50 bg-gray-200/50 dark:bg-gray-700/50 z-10" : ""}`}
    >
      <button
        type="button"
        className="flex-shrink-0 cursor-grab active:cursor-grabbing p-1 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 touch-none"
        {...attributes}
        {...listeners}
        aria-label="Drag to reorder"
      >
        <GripIcon />
      </button>
      {children}
    </li>
  );
}

function GripIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <circle cx="5" cy="3" r="1.5" />
      <circle cx="11" cy="3" r="1.5" />
      <circle cx="5" cy="8" r="1.5" />
      <circle cx="11" cy="8" r="1.5" />
      <circle cx="5" cy="13" r="1.5" />
      <circle cx="11" cy="13" r="1.5" />
    </svg>
  );
}
