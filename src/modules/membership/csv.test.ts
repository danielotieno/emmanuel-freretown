import { describe, expect, it } from "vitest";
import { parseCsv, spreadsheetSafe, toCsv } from "./csv";

describe("spreadsheetSafe (FR-12, CSV injection)", () => {
  it.each(["=1+1", "+254712345678", "-2", "@SUM(A1)", "\t=1", "\r=1"])(
    "makes %j text with a leading apostrophe",
    (value) => {
      expect(spreadsheetSafe(value)).toBe(`'${value}`);
    },
  );

  it.each(["Mary Achieng", "0042", "0712 345 678", "Judea", "KAYO; English Choir", "", "a=b"])(
    "leaves %j as it is",
    (value) => {
      expect(spreadsheetSafe(value)).toBe(value);
    },
  );
});

describe("toCsv (FR-12)", () => {
  it("quotes every field, doubles quotes, ends lines with CRLF and starts with a BOM", () => {
    expect(
      toCsv([
        ["a", 'say "hi"'],
        ["b,c", ""],
      ]),
    ).toBe('﻿"a","say ""hi"""\r\n"b,c",""\r\n');
  });

  it("guards a field's start; a line break inside a quoted field starts no new cell", () => {
    const csv = toCsv([["=cmd", "x\n=1"]]);
    expect(csv).toBe('﻿"\'=cmd","x\n=1"\r\n');
  });

  it("reads back as written with the import's reader, apart from the guard", () => {
    const rows = [
      ["fwo_number", "full_name"],
      ["0042", "Ng'ang'a \"Joe\", Jr"],
    ];
    const parsed = parseCsv(toCsv(rows).slice(1));
    expect(parsed).toEqual({ ok: true, rows });
  });
});
