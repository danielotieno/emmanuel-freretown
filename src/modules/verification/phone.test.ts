import { describe, expect, it } from "vitest";
import { formatKenyanPhone, normalizeKenyanPhone } from "./phone";

describe("normalizeKenyanPhone (BR-06, FR-2)", () => {
  it.each([
    ["0712345678", "+254712345678"],
    ["0712 345 678", "+254712345678"],
    ["0712-345-678", "+254712345678"],
    ["712345678", "+254712345678"],
    ["254712345678", "+254712345678"],
    ["+254712345678", "+254712345678"],
    ["+254 712 345 678", "+254712345678"],
    ["(0712) 345.678", "+254712345678"],
    ["0110123456", "+254110123456"],
    ["+254101234567", "+254101234567"],
    ["  0733123456  ", "+254733123456"],
  ])("accepts %j as %s", (input, e164) => {
    expect(normalizeKenyanPhone(input)).toBe(e164);
  });

  it.each([
    "",
    "0712",
    "07123456789",
    "0212345678", // Nairobi landline
    "0812345678",
    "+255712345678", // Tanzania
    "+256712345678", // Uganda
    "+447700900123", // UK
    "+1 415 555 0100",
    "00254712345678",
    "+254 7123 4567 8x",
    "zero seven one two",
    "+2547123456789",
  ])("refuses %j", (input) => {
    expect(normalizeKenyanPhone(input)).toBeNull();
  });
});

describe("formatKenyanPhone (FR-12)", () => {
  it.each([
    ["+254712345678", "0712 345 678"],
    ["+254110000001", "0110 000 001"],
  ])("writes %s as %s, which normalizes back to it", (e164, local) => {
    expect(formatKenyanPhone(e164)).toBe(local);
    expect(normalizeKenyanPhone(local)).toBe(e164);
  });
});
