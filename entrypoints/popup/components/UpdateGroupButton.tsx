import { useEffect, useRef, useState } from "react";
import { Check, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Hint } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/** The save is a near-instant storage write, so the spinner shows for at least this long to be seen */
const MIN_SPINNER_MS = 400;
/** How long the button stays green with the tick before fading back */
const SAVED_HOLD_MS = 700;
/** Matches the `duration-700` fade back to the outline style */
const FADE_BACK_MS = 700;

type UpdateFeedback = "idle" | "saving" | "saved" | "fading";

interface UpdateGroupButtonProps {
  name: string;
  className?: string;
  disabled: boolean;
  /** Resolves true once the group is saved, false when the save was blocked (a warning is shown instead). */
  onUpdate: () => Promise<boolean>;
}

/** The row's Update button: a spinner while saving, which turns into a tick on a green flash that fades back once the group is saved. */
export function UpdateGroupButton({ name, className, disabled, onUpdate }: UpdateGroupButtonProps) {
  const [feedback, setFeedback] = useState<UpdateFeedback>("idle");
  const timeoutIds = useRef<number[]>([]);

  useEffect(() => () => timeoutIds.current.forEach((id) => window.clearTimeout(id)), []);

  const after = (ms: number, next: () => void) => {
    timeoutIds.current.push(window.setTimeout(next, ms));
  };

  const handleClick = async () => {
    if (feedback !== "idle") return;
    setFeedback("saving");

    const minimumSpinner = new Promise((resolve) => after(MIN_SPINNER_MS, () => resolve(undefined)));
    let isSaved = false;
    try {
      [isSaved] = await Promise.all([onUpdate(), minimumSpinner]);
    } catch {
      // Back to idle; whoever saves reports the failure
    }

    if (!isSaved) {
      setFeedback("idle");
      return;
    }
    setFeedback("saved");
    after(SAVED_HOLD_MS, () => setFeedback("fading"));
    after(SAVED_HOLD_MS + FADE_BACK_MS, () => setFeedback("idle"));
  };

  const isSaving = feedback === "saving";
  const isIconShown = isSaving || feedback === "saved";

  return (
    <Hint label="Update group with this window's tabs">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleClick}
        disabled={disabled}
        aria-busy={isSaving}
        className={cn(
          // Wrapping the icon keeps the Button's icon padding rule from shrinking the idle button
          "gap-0",
          feedback === "saved" &&
            "border-success-soft-foreground/40 bg-success-soft text-success-soft-foreground hover:bg-success-soft hover:text-success-soft-foreground",
          feedback === "fading" && "duration-700",
          className,
        )}
        aria-label={`Update ${name} with this window's tabs`}
      >
        {/* Grows in from nothing and collapses again, so the button widens and narrows smoothly rather than jumping */}
        <span
          aria-hidden="true"
          className={cn(
            "inline-flex overflow-hidden transition-[width,margin,opacity] duration-200 motion-reduce:transition-none",
            isIconShown ? "mr-1.5 w-4 opacity-100" : "mr-0 w-0 opacity-0",
          )}
        >
          {isSaving ? (
            <LoaderCircle className="motion-safe:animate-spin" />
          ) : (
            <Check className="motion-safe:animate-in motion-safe:duration-200 motion-safe:fade-in motion-safe:zoom-in-50" />
          )}
        </span>
        Update
      </Button>
    </Hint>
  );
}
