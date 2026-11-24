import { useEffect, useState, type ReactNode } from "react";
import "@/assets/tailwind.css";
import { useAuth } from "../popup/hooks/useAuth";
import { useGroups } from "../popup/hooks/useGroups";
import { useSyncLimits } from "../popup/hooks/useSyncLimits";
import { useTheme } from "../popup/hooks/useTheme";
import { Logo } from "../popup/components/Logo";
import { ImportFilePicker } from "./components/ImportFilePicker";
import { ImportPreview } from "./components/ImportPreview";
import { Button } from "@/components/ui/button";
import type { ImportMode, ImportedGroup, ParsedImportFile } from "@/lib/import";
import { isLastSyncedState } from "@/lib/sync";

/**
 * Imports tab groups from another extension's export. A page in a tab rather than part of the popup, as Firefox
 * closes the popup when a file picker opens. Signed in, it loads and syncs the account's groups as the popup does,
 * and waits for that load, so an import can never slip past the sync conflict prompt.
 */
function App() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const syncLimits = useSyncLimits(user, isAuthenticated);
  const { groups, groupOrder, syncStatus, syncError, hasSyncConflict, hasLoadedLocalState, hasLoadedAccount, loadGroupsFromApi, importGroups } =
    useGroups(isAuthenticated, syncLimits);
  const { isDark } = useTheme();

  const [chosenFile, setChosenFile] = useState<{ fileName: string; parsedFile: ParsedImportFile } | null>(null);
  const [importedGroupCount, setImportedGroupCount] = useState<number | null>(null);

  // A file dropped outside the drop zone would otherwise be opened by the browser in place of this page
  useEffect(() => {
    const preventFileOpen = (event: DragEvent) => event.preventDefault();
    window.addEventListener("dragover", preventFileOpen);
    window.addEventListener("drop", preventFileOpen);
    return () => {
      window.removeEventListener("dragover", preventFileOpen);
      window.removeEventListener("drop", preventFileOpen);
    };
  }, []);

  const handleImport = async (importedGroups: ImportedGroup[], mode: ImportMode): Promise<string | null> => {
    const reason = await importGroups(importedGroups, mode);
    if (reason === null) {
      setImportedGroupCount(importedGroups.length);
    }
    return reason;
  };

  const startAgain = () => {
    setChosenFile(null);
    setImportedGroupCount(null);
  };

  const closeTab = async () => {
    const tab = await browser.tabs.getCurrent();
    if (tab?.id !== undefined) {
      await browser.tabs.remove(tab.id);
    }
  };

  // Signed in, whether the imported groups have reached the account (the sync is debounced, so the status alone lags)
  const accountSyncState: AccountSyncState =
    syncStatus === "error" || syncStatus === "overLimit" ? "failed" : isLastSyncedState(groups, groupOrder) ? "synced" : "syncing";

  const renderContent = (): ReactNode => {
    if (authLoading || !hasLoadedLocalState) {
      return <LoadingMessage />;
    }

    if (isAuthenticated && hasSyncConflict) {
      return (
        <Notice
          message="The tab groups in this browser and your account don't match. Open Pinned Tab Save & Sync from the toolbar and choose which to keep, then come back here to import."
          actionLabel="Check again"
          onAction={loadGroupsFromApi}
        />
      );
    }

    if (isAuthenticated && !hasLoadedAccount && syncStatus !== "error") {
      return <LoadingMessage />;
    }

    if (isAuthenticated && !hasLoadedAccount) {
      return (
        <Notice
          message={`Could not load the tab groups saved in your account${syncError ? ` (${syncError})` : ""}. Importing needs them, so the imported groups can be added to them.`}
          actionLabel="Try again"
          onAction={loadGroupsFromApi}
        />
      );
    }

    if (importedGroupCount !== null) {
      return (
        <div className="flex flex-col gap-4">
          <p role="status" className="text-sm">
            Imported {importedGroupCount} {importedGroupCount === 1 ? "group" : "groups"}. Open Pinned Tab Save & Sync from the toolbar to use them.
          </p>
          {isAuthenticated && <SyncProgress state={accountSyncState} syncError={syncError} />}
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={startAgain}>
              Import another file
            </Button>
            {/* Closing before the sync finishes would leave the import in this browser only */}
            <Button type="button" onClick={closeTab} disabled={isAuthenticated && accountSyncState === "syncing"}>
              Close
            </Button>
          </div>
        </div>
      );
    }

    if (chosenFile) {
      return (
        <ImportPreview
          fileName={chosenFile.fileName}
          parsedFile={chosenFile.parsedFile}
          existingGroups={groups}
          existingGroupOrder={groupOrder}
          isAuthenticated={isAuthenticated}
          syncLimits={syncLimits}
          onImport={handleImport}
          onChooseAnotherFile={startAgain}
        />
      );
    }

    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm leading-normal text-muted-foreground">
          Bring in the tab groups you saved with another extension. In <span className="font-semibold text-foreground">Save Pinned Tabs</span>, open
          its options page and export your sets, then choose the file here. You can check which groups to import before anything is saved.
        </p>
        <ImportFilePicker onFileRead={(fileName, parsedFile) => setChosenFile({ fileName, parsedFile })} />
      </div>
    );
  };

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-6 py-10">
      <header className="flex items-center gap-4">
        <Logo isDark={isDark} />
        <h1 className="text-xl font-bold">Import tab groups</h1>
      </header>
      <main>{renderContent()}</main>
    </div>
  );
}

/** An amber notice explaining why importing has to wait, with a button to check again. */
function Notice({ message, actionLabel, onAction }: { message: string; actionLabel: string; onAction: () => void }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-[10px] border border-warning-soft-border bg-warning-soft px-4 py-3.5 text-warning-soft-foreground">
      <p className="text-sm leading-normal">{message}</p>
      <Button type="button" variant="outline" size="sm" onClick={onAction}>
        {actionLabel}
      </Button>
    </div>
  );
}

function LoadingMessage() {
  return <p className="text-sm text-muted-foreground">Loading your tab groups...</p>;
}

type AccountSyncState = "syncing" | "synced" | "failed";

/** Signed in, whether the imported groups have reached the account yet. */
function SyncProgress({ state, syncError }: { state: AccountSyncState; syncError: string | null }) {
  if (state === "syncing") {
    return <p className="text-[13px] text-muted-foreground">Syncing to your account...</p>;
  }

  if (state === "failed") {
    return (
      <p role="alert" className="text-[13px] text-destructive dark:text-danger-soft-foreground">
        Not synced to your account yet{syncError ? `: ${syncError}` : ""}. Open Pinned Tab Save & Sync from the toolbar to sync them.
      </p>
    );
  }

  return <p className="text-[13px] text-muted-foreground">Synced to your account.</p>;
}

export default App;
