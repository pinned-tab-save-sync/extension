import { useState } from "react";
import { ArrowLeft, ExternalLink } from "lucide-react";
import type { User } from "@/lib/types";
import type { DensityPreference, ThemePreference } from "@/lib/storage/keys";
import { WEBSITE_SECURITY_URL } from "@/lib/urls";
import { SUPPORTED_IMPORT_SOURCES } from "@/lib/import";
import { Button } from "@/components/ui/button";
import { LayoutToggle } from "./LayoutToggle";
import { ThemeToggle } from "./ThemeToggle";

interface SettingsScreenProps {
  user: User | null;
  isAuthenticated: boolean;
  onBack: () => void;
  /** App decides which flow runs (logoutAndDeleteAllLocalData or deleteAllLocalData). */
  onDeleteAllLocalData: () => Promise<void>;
  theme: ThemePreference;
  onThemeChange: (theme: ThemePreference) => void;
  density: DensityPreference;
  onDensityChange: (density: DensityPreference) => void;
}

export function SettingsScreen({
  user,
  isAuthenticated,
  onBack,
  onDeleteAllLocalData,
  theme,
  onThemeChange,
  density,
  onDensityChange,
}: SettingsScreenProps) {
  const [isConfirming, setIsConfirming] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleDeleteConfirmed = async () => {
    setIsDeleting(true);
    setErrorMessage(null);
    try {
      await onDeleteAllLocalData();
      // App closes the settings view on success; nothing more to do here
    } catch {
      setErrorMessage(
        isAuthenticated ? "Could not log out safely - nothing was deleted. Please try again." : "Could not delete the local data. Please try again.",
      );
      setIsConfirming(false);
      setIsDeleting(false);
    }
  };

  const handleOpenSecurity = () => {
    browser.tabs.create({ url: WEBSITE_SECURITY_URL, active: true });
    window.close();
  };

  const handleOpenImport = () => {
    browser.tabs.create({ url: browser.runtime.getURL("/import.html"), active: true });
    window.close();
  };

  const deleteButtonLabel = isAuthenticated ? "Log out and delete all local data" : "Delete all local data";

  return (
    <div className="flex max-h-[600px] min-h-[200px] w-full flex-col">
      <header className="flex shrink-0 items-center justify-between gap-2 border-b py-3 pr-3 pl-5 compact:py-2">
        <h2 className="text-base font-semibold">Settings</h2>
        <Button type="button" variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft aria-hidden="true" />
          Back
        </Button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <section className="flex flex-col gap-2.5 px-5 py-4 compact:py-3">
          <h3 className="text-[13px] font-semibold">Appearance</h3>
          <div className="flex items-center justify-between gap-3">
            <span className="text-[13px] text-muted-foreground">Theme</span>
            <ThemeToggle theme={theme} onThemeChange={onThemeChange} />
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-[13px] text-muted-foreground">Layout</span>
            <LayoutToggle density={density} onDensityChange={onDensityChange} />
          </div>
        </section>

        {/* Import section - opens a page in a tab, as Firefox closes the popup when a file picker opens */}
        <section className="flex flex-col gap-2.5 border-t px-5 py-4 compact:py-3">
          <h3 className="text-[13px] font-semibold">Import</h3>
          <p className="text-[13px] leading-normal text-muted-foreground">
            Bring in tab groups exported from another extension: {SUPPORTED_IMPORT_SOURCES.join(", ")}.
          </p>
          <div>
            <Button type="button" variant="outline" size="sm" onClick={handleOpenImport}>
              Import tab groups
              <ExternalLink aria-hidden="true" />
            </Button>
          </div>
        </section>

        {/* Security section - logged-in users only */}
        {isAuthenticated && user && (
          <section className="flex flex-col gap-2.5 border-t px-5 py-4 compact:py-3">
            <h3 className="text-[13px] font-semibold">Security</h3>
            <p className="text-[13px] leading-normal text-muted-foreground">
              Your password, two-factor authentication and passkeys are managed on the website.
            </p>
            <div>
              <Button type="button" variant="outline" size="sm" onClick={handleOpenSecurity}>
                Open website
                <ExternalLink aria-hidden="true" />
              </Button>
            </div>
          </section>
        )}

        {/* Local data section */}
        <section className="flex flex-col gap-2.5 border-t px-5 py-4 compact:py-3">
          <h3 className="text-[13px] font-semibold">Local data</h3>

          {!isConfirming && (
            <>
              <p className="text-[13px] leading-normal text-muted-foreground">
                {isAuthenticated
                  ? "Logs you out, then removes every saved tab group and setting stored in this browser. Tab groups already synced to your account are not affected and will return when you log in again. Your open tabs are not closed."
                  : "Removes every saved tab group and setting stored in this browser. Your open tabs are not closed."}
              </p>
              {errorMessage && (
                <p role="alert" className="text-xs text-destructive dark:text-danger-soft-foreground">
                  {errorMessage}
                </p>
              )}
              <div>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    setIsConfirming(true);
                    setErrorMessage(null);
                  }}
                >
                  {deleteButtonLabel}
                </Button>
              </div>
            </>
          )}

          {isConfirming && (
            <div className="flex flex-col gap-1 rounded-[10px] border border-danger-soft-border bg-danger-soft p-3.5 text-danger-soft-foreground">
              <p className="text-sm font-bold">This cannot be undone.</p>
              <p className="text-[13px] leading-normal">
                {isAuthenticated
                  ? "You will be logged out and all tab groups saved in this browser will be permanently deleted. Changes that have not finished syncing will be lost."
                  : "All tab groups saved in this browser will be permanently deleted."}
              </p>
              <div className="mt-2 flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setIsConfirming(false)} disabled={isDeleting}>
                  Cancel
                </Button>
                <Button type="button" variant="destructive" size="sm" onClick={handleDeleteConfirmed} disabled={isDeleting} className="font-semibold">
                  {isDeleting ? "Deleting..." : "Yes, delete everything"}
                </Button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
