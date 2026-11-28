import { describe, expect, it } from "vitest";
import { readFwoNumber } from "./fwo-number";

describe("readFwoNumber (BR-01, D61)", () => {
  it("drops leading zeros: 002 is 2, 011 is 11, 054 is 54", () => {
    expect(readFwoNumber("002")).toBe("2");
    expect(readFwoNumber("011")).toBe("11");
    expect(readFwoNumber("054")).toBe("54");
    expect(readFwoNumber("0042")).toBe("42");
  });

  it("keeps zeros that aren't leading", () => {
    expect(readFwoNumber("1000")).toBe("1000");
    expect(readFwoNumber("1020")).toBe("1020");
  });

  it("reads a number of zeros only as 0", () => {
    expect(readFwoNumber("0")).toBe("0");
    expect(readFwoNumber("000")).toBe("0");
  });

  it("trims spaces around it", () => {
    expect(readFwoNumber("  054 ")).toBe("54");
  });

  it("refuses anything but digits, spaces inside included", () => {
    for (const input of ["", " ", "5 4", "54a", "-54", "+54", "5.4", "٥٤"]) {
      expect(readFwoNumber(input), input).toBeNull();
    }
  });

  it("always gives the form the database accepts", () => {
    for (const input of ["0", "000", "7", "070", "0123456789"]) {
      expect(readFwoNumber(input)).toMatch(/^(0|[1-9][0-9]*)$/);
    }
  });
});
