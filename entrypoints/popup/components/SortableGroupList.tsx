import { ReactNode } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";

interface SortableGroupListProps {
  groupOrder: string[];
  onReorder: (fromIndex: number, toIndex: number) => void;
  children: ReactNode;
}

export function SortableGroupList({
  groupOrder,
  onReorder,
  children,
}: SortableGroupListProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
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
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={groupOrder} strategy={verticalListSortingStrategy}>
        <ul className="list-none p-0 m-0">{children}</ul>
      </SortableContext>
    </DndContext>
  );
}
