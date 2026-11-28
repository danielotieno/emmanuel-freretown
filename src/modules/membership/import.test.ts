import { describe, expect, it } from "vitest";
import { decodeCsvFile, normalizeLineEnds, parseCsv } from "./csv";
import {
  checkConsentDate,
  checkImportRows,
  IMPORT_MAX_ROWS,
  importDigest,
  readImportFile,
  unitsByKey,
  type ImportLookups,
} from "./import";
import { unitKey } from "../organisation";

// The import of the parish list (FR-13, D47, #104): reading the file and checking its rows.
// All names and numbers are synthetic.

describe("parseCsv", () => {
  it("reads quoted fields with commas, doubled quotes and line breaks", () => {
    expect(parseCsv('a,"b, c","say ""hi""","two\nlines"\r\nx,y,,z\n')).toEqual({
      ok: true,
      rows: [
        ["a", "b, c", 'say "hi"', "two\nlines"],
        ["x", "y", "", "z"],
      ],
    });
  });

  it("uses semicolons when the header line has them and no comma", () => {
    expect(parseCsv("fwo_number;full_name\n1;Test Person")).toEqual({
      ok: true,
      rows: [
        ["fwo_number", "full_name"],
        ["1", "Test Person"],
      ],
    });
  });

  it("refuses an unclosed quote", () => {
    expect(parseCsv('a,"b\n')).toEqual({ ok: false, error: "unclosed_quote" });
  });
});

describe("decodeCsvFile", () => {
  it("reads UTF-8 and drops a byte-order mark", () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode("a,é")]);
    expect(decodeCsvFile(bytes)).toBe("a,é");
  });

  it("turns every line end into LF, as the confirmation must match the preview", () => {
    expect(decodeCsvFile(new TextEncoder().encode("a\r\nb\rc\n"))).toBe("a\nb\nc\n");
    expect(normalizeLineEnds('a\r\n"x\ny"')).toBe('a\n"x\ny"');
  });

  it("refuses text that isn't UTF-8, such as Excel's older Windows-1252 CSV", () => {
    expect(decodeCsvFile(new Uint8Array([0x61, 0xe9, 0x2c]))).toBeNull();
  });
});

const HEADER = "FWO Number,Full Name,Phone,HBC,Departments,Language";

describe("readImportFile", () => {
  it("matches headers ignoring case and spaces, numbers rows as the spreadsheet does, skips blank rows", () => {
    const read = readImportFile(
      `${HEADER}\n0042,Test Person,0712000001,Judea,,\n,,,,,\n43,Other Person,,Judea,,`,
    );
    expect(read.ok && read.rows.map((r) => [r.rowNumber, r.cells.fwo_number])).toEqual([
      [2, "0042"],
      [4, "43"],
    ]);
  });

  it("names missing and repeated columns", () => {
    expect(readImportFile("fwo_number,full_name\n1,Test")).toEqual({
      ok: false,
      error: { kind: "missing_columns", columns: ["phone", "hbc"] },
    });
    expect(readImportFile("fwo_number,full_name,phone,hbc,hbc\n1,Test,,Judea,Judea")).toEqual({
      ok: false,
      error: { kind: "repeated_columns", columns: ["hbc"] },
    });
  });

  it("refuses an empty file and too many rows", () => {
    expect(readImportFile("")).toEqual({ ok: false, error: { kind: "empty" } });
    expect(readImportFile(`${HEADER}\n`)).toEqual({ ok: false, error: { kind: "empty" } });
    const rows = Array.from({ length: IMPORT_MAX_ROWS + 1 }, (_, i) => `${i},Test Person,,Judea,,`);
    expect(readImportFile([HEADER, ...rows].join("\n"))).toEqual({
      ok: false,
      error: { kind: "too_many_rows", limit: IMPORT_MAX_ROWS },
    });
  });

  it("marks a row with more non-empty cells than headers", () => {
    const read = readImportFile(
      "fwo_number,full_name,phone,hbc\n1,Person,Test,,Judea\n2,Test Person,,Judea,",
    );
    expect(read.ok && read.rows.map((r) => r.extraCells)).toEqual([true, false]);
  });
});

const LOOKUPS: ImportLookups = {
  hbcs: new Map([
    ["judea", "hbc-judea"],
    ["zion leisure", "hbc-zion-leisure"],
  ]),
  departments: new Map([
    ["mother's union", "dep-mu"],
    ["english choir", "dep-choir"],
  ]),
  heldFwoNumbers: new Set(["900"]),
  heldPhones: new Set(["+254712000900"]),
};

function check(lines: string[]) {
  const read = readImportFile([HEADER, ...lines].join("\n"));
  if (!read.ok) throw new Error("test file invalid");
  return checkImportRows(read.rows, LOOKUPS);
}

describe("checkImportRows (FR-13)", () => {
  it("accepts a valid row, matching HBCs and departments ignoring case, spaces and curly quotes", () => {
    const { valid, skipped } = check([
      "0042, Test  Person ,0712 000 001,  ZION   leisure ,Mother’s Union; english choir ;,SW",
    ]);
    expect(skipped).toEqual([]);
    expect(valid).toEqual([
      {
        rowNumber: 2,
        fwoNumber: "42",
        fullName: "Test Person",
        phoneE164: "+254712000001",
        hbcId: "hbc-zion-leisure",
        departmentIds: ["dep-mu", "dep-choir"],
        language: "sw",
      },
    ]);
  });

  it("drops the FWO number's leading zeros, records no personal phone when blank, and English by default", () => {
    const { valid } = check(["0042,Test Person,,Judea,,"]);
    expect(valid[0]).toMatchObject({ fwoNumber: "42", phoneE164: null, language: "en" });
  });

  it("reads numbers that differ only by leading zeros as one number (D61)", () => {
    const { valid, skipped } = check([
      "0900,Test One,,Judea,,",
      "07,Test Two,,Judea,,",
      "7,Test Three,,Judea,,",
    ]);
    expect(valid).toEqual([]);
    expect(skipped).toEqual([
      { rowNumber: 2, problems: ["fwo_held"] },
      { rowNumber: 3, problems: ["fwo_repeated"] },
      { rowNumber: 4, problems: ["fwo_repeated"] },
    ]);
  });

  it("names every rule a row breaks, by row number only", () => {
    const { valid, skipped } = check([
      ",,,,,",
      "12a,T,0800 000 000,Narnia,Choir,fr",
      "900,Test Person,0712000900,Judea,,",
      `1,${"x".repeat(121)},,,,`,
    ]);
    expect(valid).toEqual([]);
    expect(skipped).toEqual([
      {
        rowNumber: 3,
        problems: [
          "fwo_invalid",
          "name_too_short",
          "phone_invalid",
          "hbc_unknown",
          "department_unknown",
          "language_invalid",
        ],
      },
      { rowNumber: 4, problems: ["fwo_held", "phone_held"] },
      { rowNumber: 5, problems: ["name_too_long", "hbc_missing"] },
    ]);
  });

  it("skips every row that shares an FWO number or a phone with another row", () => {
    const { valid, skipped } = check([
      "1,Test One,0712000001,Judea,,",
      "1,Test Two,0712000002,Judea,,",
      "2,Test Three,0712000003,Judea,,",
      "3,Test Four,+254 712 000 003,Judea,,",
      "4,Test Five,,Judea,,",
      "5,Test Six,,Judea,,",
    ]);
    expect(skipped).toEqual([
      { rowNumber: 2, problems: ["fwo_repeated"] },
      { rowNumber: 3, problems: ["fwo_repeated"] },
      { rowNumber: 4, problems: ["phone_repeated"] },
      { rowNumber: 5, problems: ["phone_repeated"] },
    ]);
    // Two members with no personal phone share nothing.
    expect(valid.map((v) => v.rowNumber)).toEqual([6, 7]);
  });

  it("counts a name's length in characters as the database does, not UTF-16 units", () => {
    // "😀" is one character but two UTF-16 units: a name of it alone is too short.
    expect(check(["1,😀,,Judea,,"]).skipped).toEqual([
      { rowNumber: 2, problems: ["name_too_short"] },
    ]);
    expect(check([`2,${"😀".repeat(120)},,Judea,,`]).valid).toHaveLength(1);
  });

  it("skips a row with control characters the database would refuse", () => {
    expect(check(["1,Test\u0000Person,,Judea,,"]).skipped).toEqual([
      { rowNumber: 2, problems: ["control_characters"] },
    ]);
  });

  it("reports a missing FWO number and name", () => {
    expect(check([",,0712000001,Judea,,"]).skipped).toEqual([
      { rowNumber: 2, problems: ["fwo_missing", "name_missing"] },
    ]);
  });
});

describe("unitsByKey", () => {
  it("matches neither of two units whose names differ only in case or apostrophes", () => {
    const map = unitsByKey([
      { id: "a", name: "St Paul's" },
      { id: "b", name: "st paul’s" },
      { id: "c", name: "Judea" },
    ]);
    expect([...map]).toEqual([["judea", "c"]]);
  });
});

describe("unitKey and importDigest", () => {
  it("compares unit names without case, extra spaces or curly apostrophes", () => {
    expect(unitKey("  Mother’s   UNION ")).toBe(unitKey("Mother's Union"));
  });

  it("gives the same digest for the same text and a different one otherwise", async () => {
    expect(await importDigest("a")).toBe(await importDigest("a"));
    expect(await importDigest("a")).not.toBe(await importDigest("b"));
    expect(await importDigest("a")).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("checkConsentDate (BR-15, D47)", () => {
  const today = "2026-11-28";

  it("accepts a real date up to today, a leap day included", () => {
    expect(checkConsentDate("2026-11-28", today)).toBeNull();
    expect(checkConsentDate("2024-02-29", today)).toBeNull();
  });

  it("refuses a date that doesn't exist, or isn't written YYYY-MM-DD", () => {
    expect(checkConsentDate("2026-02-31", today)).toBe("invalid");
    expect(checkConsentDate("2025-02-29", today)).toBe("invalid");
    expect(checkConsentDate("28/11/2026", today)).toBe("invalid");
    expect(checkConsentDate("", today)).toBe("invalid");
  });

  it("refuses a date after today", () => {
    expect(checkConsentDate("2026-11-29", today)).toBe("future");
  });
});
