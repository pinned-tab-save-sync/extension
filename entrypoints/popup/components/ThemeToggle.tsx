import { Monitor, Moon, Sun } from "lucide-react";
import type { ThemePreference } from "@/lib/storage/keys";
import { SegmentedControl, type SegmentedControlOption } from "./SegmentedControl";

interface ThemeToggleProps {
  theme: ThemePreference;
  onThemeChange: (theme: ThemePreference) => void;
}

const THEME_OPTIONS: SegmentedControlOption<ThemePreference>[] = [
  { value: "system", label: "System", icon: <Monitor aria-hidden="true" /> },
  { value: "light", label: "Light", icon: <Sun aria-hidden="true" /> },
  { value: "dark", label: "Dark", icon: <Moon aria-hidden="true" /> },
];

/** Segmented System / Light / Dark control. */
export function ThemeToggle({ theme, onThemeChange }: ThemeToggleProps) {
  return <SegmentedControl label="Theme" options={THEME_OPTIONS} value={theme} onChange={onThemeChange} />;
}
