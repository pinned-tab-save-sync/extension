import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Hint } from "@/components/ui/tooltip";

interface SettingsButtonProps {
  onClick: () => void;
}

/** Icon button in the popup header that opens the settings view. */
export function SettingsButton({ onClick }: SettingsButtonProps) {
  return (
    <Hint label="Settings">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onClick}
        aria-label="Settings"
        className="compact:size-8 [&_svg:not([class*='size-'])]:size-[18px]"
      >
        <SlidersHorizontal aria-hidden="true" />
      </Button>
    </Hint>
  );
}
