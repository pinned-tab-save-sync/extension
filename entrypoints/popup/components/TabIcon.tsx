import { useState } from "react";
import { cn } from "@/lib/utils";

/** Background colours for the letter fallback, all dark enough for white text. */
const FALLBACK_COLOURS = ["#24292f", "#5e6ad2", "#c5221f", "#1a73e8", "#188038", "#6b2f6b", "#7c3aed", "#0f766e", "#c2410c", "#334155"];

interface TabIconProps {
  url: string;
  favIconUrl: string | undefined;
  className?: string;
}

/**
 * A tab's favicon on a bordered circle, so icons with transparent edges do not float. Falls back to a
 * coloured circle with the first letter of its site when the browser has no icon for it or the icon cannot be
 * loaded (e.g. browser-internal pages).
 */
export function TabIcon({ url, favIconUrl, className }: TabIconProps) {
  const [hasFailed, setHasFailed] = useState(false);
  const hostname = getHostname(url);

  if (favIconUrl && !hasFailed) {
    return (
      <span
        aria-hidden="true"
        className={cn(
          "inline-flex size-6 shrink-0 items-center justify-center rounded-full compact:size-5 border border-tab-icon-border bg-tab-icon",
          className,
        )}
      >
        <img src={favIconUrl} alt="" onError={() => setHasFailed(true)} className="size-3.5 object-contain compact:size-3" />
      </span>
    );
  }

  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] compact:size-5 compact:text-[10px] font-bold text-white uppercase",
        className,
      )}
      style={{ backgroundColor: pickFallbackColour(hostname) }}
    >
      {hostname.charAt(0) || "?"}
    </span>
  );
}

/** The URL's hostname without a leading "www.", or "" when it has none (e.g. about:blank). */
function getHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** Picks the same fallback colour for a site every time. */
function pickFallbackColour(hostname: string): string {
  let hash = 0;
  for (const character of hostname) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }

  return FALLBACK_COLOURS[hash % FALLBACK_COLOURS.length] ?? "#334155";
}
