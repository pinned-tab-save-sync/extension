import { type ReactNode, useEffect } from "react";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { keepWithinList } from "@/lib/dragModifiers";

/**
 * Chrome fires `resize` events on extension action popups while the pointer is held down even
 * though the popup's size has not changed, and dnd-kit cancels an in-progress drag on any window
 * resize. Swallow resize events whose dimensions are unchanged so drags can activate in the popup.
 */
function useIgnoreSpuriousResizeEvents(): void {
  useEffect(() => {
    let lastWidth = window.innerWidth;
    let lastHeight = window.innerHeight;

    const handleResize = (event: Event) => {
      if (window.innerWidth === lastWidth && window.innerHeight === lastHeight) {
        event.stopImmediatePropagation();
        return;
      }
      lastWidth = window.innerWidth;
      lastHeight = window.innerHeight;
    };

    // Capture phase so this runs before dnd-kit's own window listeners
    window.addEventListener("resize", handleResize, true);
    return () => window.removeEventListener("resize", handleResize, true);
  }, []);
}

interface SortableGroupListProps {
  groupOrder: string[];
  onReorder: (fromIndex: number, toIndex: number) => void;
  children: ReactNode;
}

export function SortableGroupList({ groupOrder, onReorder, children }: SortableGroupListProps) {
  useIgnoreSpuriousResizeEvents();

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = groupOrder.indexOf(active.id as string);
      const newIndex = groupOrder.indexOf(over.id as string);
      onReorder(oldIndex, newIndex);
    }
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[keepWithinList]} onDragEnd={handleDragEnd}>
      <SortableContext items={groupOrder} strategy={verticalListSortingStrategy}>
        <ul className="m-0 flex list-none flex-col gap-[3px] p-0">{children}</ul>
      </SortableContext>
    </DndContext>
  );
}
