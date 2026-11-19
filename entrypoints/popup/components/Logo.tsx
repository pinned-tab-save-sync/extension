import { cn } from "@/lib/utils";

interface LogoProps {
  isDark: boolean;
  className?: string;
}

/** Renders the theme-appropriate logo from public/icon (logo.svg for light mode, logo-dark.svg for dark mode). */
export function Logo({ isDark, className }: LogoProps) {
  return <img src={isDark ? "/icon/logo-dark.svg" : "/icon/logo.svg"} alt="Pinned Tab Save & Sync" className={cn("h-8 w-auto", className)} />;
}
