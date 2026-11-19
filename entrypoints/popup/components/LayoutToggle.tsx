import { Rows2, Rows4 } from "lucide-react";
import type { DensityPreference } from "@/lib/storage/keys";
import { SegmentedControl, type SegmentedControlOption } from "./SegmentedControl";

interface LayoutToggleProps {
  density: DensityPreference;
  onDensityChange: (density: DensityPreference) => void;
}

const LAYOUT_OPTIONS: SegmentedControlOption<DensityPreference>[] = [
  { value: "comfortable", label: "Comfortable", icon: <Rows2 aria-hidden="true" /> },
  { value: "compact", label: "Compact", icon: <Rows4 aria-hidden="true" /> },
];

/** Segmented Comfortable / Compact control. */
export function LayoutToggle({ density, onDensityChange }: LayoutToggleProps) {
  return <SegmentedControl label="Layout" options={LAYOUT_OPTIONS} value={density} onChange={onDensityChange} />;
}
