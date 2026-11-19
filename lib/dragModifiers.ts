import type { Modifier } from "@dnd-kit/core";

/**
 * Keeps a dragged row inside the list: no sideways movement, and no further up or down than the first and
 * last positions, so it cannot be dragged past the end and stretch the page (as @dnd-kit/modifiers'
 * restrictToVerticalAxis and restrictToParentElement).
 */
export const keepWithinList: Modifier = ({ transform, draggingNodeRect, containerNodeRect }) => {
  let y = transform.y;

  // containerNodeRect is the row's parent, i.e. the list
  if (draggingNodeRect && containerNodeRect) {
    const highestY = containerNodeRect.top - draggingNodeRect.top;
    const lowestY = containerNodeRect.bottom - draggingNodeRect.bottom;
    y = Math.min(Math.max(y, highestY), lowestY);
  }

  return { ...transform, x: 0, y };
};
