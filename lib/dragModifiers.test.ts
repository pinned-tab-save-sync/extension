import { describe, it, expect } from "vitest";
import type { Modifier } from "@dnd-kit/core";
import { keepWithinList } from "@/lib/dragModifiers";

type ModifierArguments = Parameters<Modifier>[0];

const rect = (top: number, bottom: number) => ({ top, bottom, left: 0, right: 400, width: 400, height: bottom - top });

/** Drag a 50px row that starts 100px down a list spanning 0 to 300, by the given offset. */
function dragRowBy(x: number, y: number, hasRects = true) {
  return keepWithinList({
    transform: { x, y, scaleX: 1, scaleY: 1 },
    draggingNodeRect: hasRects ? rect(100, 150) : null,
    containerNodeRect: hasRects ? rect(0, 300) : null,
  } as ModifierArguments);
}

describe("keepWithinList", () => {
  it("lets a row move up and down inside the list", () => {
    expect(dragRowBy(0, 60)).toMatchObject({ x: 0, y: 60 });
    expect(dragRowBy(0, -40)).toMatchObject({ x: 0, y: -40 });
  });

  it("stops a row at the bottom of the list", () => {
    expect(dragRowBy(0, 5000)).toMatchObject({ y: 150 });
  });

  it("stops a row at the top of the list", () => {
    expect(dragRowBy(0, -5000)).toMatchObject({ y: -100 });
  });

  it("never moves a row sideways", () => {
    expect(dragRowBy(250, 20)).toMatchObject({ x: 0, y: 20 });
  });

  it("only locks the axis before the rows have been measured", () => {
    expect(dragRowBy(30, 5000, false)).toMatchObject({ x: 0, y: 5000 });
  });
});
