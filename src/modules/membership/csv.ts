/**
 * A small CSV reader for the import of the parish list (FR-13, #104): RFC 4180 fields, quoted
 * or not, with doubled quotes inside quotes and line breaks inside quoted fields; CRLF or LF
 * line ends. No dependency (CLAUDE.md rule 11): the files are a few hundred rows.
 */

export type CsvResult = { ok: true; rows: string[][] } | { ok: false; error: "unclosed_quote" };

/**
 * Splits CSV text into rows of fields. The delimiter is a comma, or a semicolon when the first
 * line has semicolons and no comma (Excel saves with semicolons in some regional settings).
 */
export function parseCsv(text: string): CsvResult {
  const firstLine = text.slice(0, text.search(/\r?\n|$/));
  const delimiter = firstLine.includes(";") && !firstLine.includes(",") ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let i = 0;
  while (i < text.length) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
      } else {
        field += c;
      }
      i++;
      continue;
    }
    if (c === '"' && field === "") {
      quoted = true;
    } else if (c === delimiter) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      if (c === "\r" && text[i + 1] === "\n") i++;
    } else {
      field += c;
    }
    i++;
  }
  if (quoted) return { ok: false, error: "unclosed_quote" };
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return { ok: true, rows };
}

/**
 * Decodes an uploaded file as UTF-8, refusing anything that isn't (Excel's "CSV UTF-8" format;
 * its older "CSV" format is Windows-1252, which would turn accented names into nonsense). A
 * byte-order mark is removed, and line ends become LF: a browser posting the text back in a form
 * turns every line end into CRLF, so the preview and the confirmation must agree on one form.
 */
export function decodeCsvFile(bytes: Uint8Array): string | null {
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return normalizeLineEnds(text.startsWith("﻿") ? text.slice(1) : text);
  } catch {
    return null;
  }
}

/** CRLF and lone CR become LF, so the same file always has the same text and digest. */
export function normalizeLineEnds(text: string): string {
  return text.replace(/\r\n?/g, "\n");
}
