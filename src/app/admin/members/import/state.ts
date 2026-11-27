import type { SkippedImportRow } from "@/modules/membership";

/**
 * The import page's state (FR-13, #104). The file's text comes back to the administrator's own
 * browser with the preview and returns with the confirmation, as this state: the server never
 * keeps it.
 */
export type ImportState =
  | { step: "upload"; error?: string; detail?: string[] }
  | {
      step: "preview";
      text: string;
      digest: string;
      toImport: number;
      skipped: SkippedImportRow[];
      error?: string;
      consentDateError?: string;
      consentGivenError?: string;
    }
  | { step: "done"; imported: number; skipped: number };

export const INITIAL_IMPORT_STATE: ImportState = { step: "upload" };
