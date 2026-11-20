import type { MouseEvent } from "react";
import type { SyncStatus } from "@/lib/types";
import { IS_LOCAL_ONLY } from "@/lib/buildMode";
import { WEBSITE_DASHBOARD_URL, WEBSITE_HOME_URL } from "@/lib/urls";
import { Logo } from "./Logo";
import { SettingsButton } from "./SettingsButton";
import { SyncStatusPill } from "./SyncStatusPill";
import { Hint } from "@/components/ui/tooltip";

interface PopupHeaderProps {
  isDark: boolean;
  isAuthenticated: boolean;
  syncStatus: SyncStatus;
  syncError: string | null;
  isOffline: boolean;
  onRetrySync: () => void;
  onOpenSettings: () => void;
}

/** The main view's header: logo (links to the website dashboard), sync status and the settings button. A local-only build has no sync status, and its logo links to the public website. */
export function PopupHeader({ isDark, isAuthenticated, syncStatus, syncError, isOffline, onRetrySync, onOpenSettings }: PopupHeaderProps) {
  // A local-only build has no dashboard to open, so its logo goes to the public website
  const logoUrl = IS_LOCAL_ONLY ? WEBSITE_HOME_URL : WEBSITE_DASHBOARD_URL;

  // Open the website in a new tab and close the popup, as the popup's other website links do
  const handleOpenWebsite = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    browser.tabs.create({ url: logoUrl, active: true });
    window.close();
  };

  return (
    <header className="flex shrink-0 items-center justify-between border-b px-4 py-3 compact:py-2">
      <h1 className="leading-none">
        <Hint label={IS_LOCAL_ONLY ? "Open pinnedtabsaveandsync.com" : "Open your dashboard"}>
          <a
            href={logoUrl}
            onClick={handleOpenWebsite}
            className="inline-block rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <Logo isDark={isDark} className="h-7 compact:h-6" />
          </a>
        </Hint>
      </h1>
      <div className="flex items-center gap-2">
        {!IS_LOCAL_ONLY && (
          <SyncStatusPill
            isAuthenticated={isAuthenticated}
            syncStatus={syncStatus}
            syncError={syncError}
            isOffline={isOffline}
            onRetry={onRetrySync}
          />
        )}
        <SettingsButton onClick={onOpenSettings} />
      </div>
    </header>
  );
}
