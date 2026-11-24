import { useState } from "react";
import { FileUp } from "lucide-react";
import { ImportFileError, parseImportFile, type ParsedImportFile } from "@/lib/import";
import { cn } from "@/lib/utils";

/** Export files are a few kilobytes; anything far bigger is not one. */
const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024;

interface ImportFilePickerProps {
  onFileRead: (fileName: string, parsedFile: ParsedImportFile) => void;
}

/** A drop zone that is also a file picker. Reads the chosen export and reports it, or shows why it cannot be imported. */
export function ImportFilePicker({ onFileRead }: ImportFilePickerProps) {
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const readFile = async (file: File | undefined) => {
    if (!file) {
      return;
    }

    setErrorMessage(null);
    if (file.size > MAX_IMPORT_FILE_BYTES) {
      setErrorMessage("This file is too large to be an export.");
      return;
    }

    try {
      onFileRead(file.name, parseImportFile(await file.text()));
    } catch (error) {
      setErrorMessage(error instanceof ImportFileError ? error.message : "Could not read this file.");
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <label
        htmlFor="import-file"
        onDragOver={(event) => {
          event.preventDefault();
          setIsDraggingOver(true);
        }}
        onDragLeave={() => setIsDraggingOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setIsDraggingOver(false);
          void readFile(event.dataTransfer.files[0]);
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center gap-2 rounded-[10px] border-2 border-dashed px-6 py-10 text-center transition-colors",
          "focus-within:ring-[3px] focus-within:ring-ring/50",
          isDraggingOver ? "border-primary bg-selected" : "border-input hover:bg-muted",
        )}
      >
        <FileUp aria-hidden="true" className="size-6 text-muted-foreground" />
        <span className="text-sm font-semibold">Choose an export file</span>
        <span className="text-[13px] text-muted-foreground">or drop it here</span>
        <input
          id="import-file"
          type="file"
          accept=".json,application/json"
          className="sr-only"
          onChange={(event) => {
            void readFile(event.target.files?.[0]);
            // Lets the same file be chosen again after fixing it
            event.target.value = "";
          }}
        />
      </label>
      {errorMessage && (
        <p role="alert" className="text-[13px] text-destructive dark:text-danger-soft-foreground">
          {errorMessage}
        </p>
      )}
    </div>
  );
}
