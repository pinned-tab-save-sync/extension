import * as React from "react";
import { Tooltip as TooltipPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";

/** About as long as a browser waits before showing its own tooltip */
const TOOLTIP_DELAY_MS = 500;

function Tooltip({ delayDuration = TOOLTIP_DELAY_MS, ...props }: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  return (
    <TooltipPrimitive.Provider delayDuration={delayDuration}>
      <TooltipPrimitive.Root data-slot="tooltip" {...props} />
    </TooltipPrimitive.Provider>
  );
}

function TooltipTrigger({ ...props }: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />;
}

function TooltipContent({ className, sideOffset = 6, ...props }: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        collisionPadding={6}
        className={cn(
          "z-50 max-w-[260px] animate-in rounded-md bg-foreground px-2.5 py-1.5 text-xs leading-snug break-words whitespace-pre-line text-background fade-in-0 motion-reduce:animate-none",
          className,
        )}
        {...props}
      />
    </TooltipPrimitive.Portal>
  );
}

interface HintProps {
  /** The tooltip's text. Line breaks are kept. Nothing is shown when it is empty. */
  label: string;
  /** The single element the tooltip belongs to. */
  children: React.ReactElement;
}

/**
 * A tooltip drawn inside the page, used in place of the `title` attribute. A `title` tooltip is its
 * own window in some browsers, which takes focus from the extension popup and closes it.
 */
function Hint({ label, children }: HintProps) {
  if (!label) {
    return children;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export { Tooltip, TooltipTrigger, TooltipContent, Hint };
