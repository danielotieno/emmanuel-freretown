import { describe, expect, it } from "vitest";
import { DEFAULT_LOCALE, resolveLocale } from "./locale";

describe("resolveLocale", () => {
  it("keeps a supported saved choice", () => {
    expect(resolveLocale("en")).toBe("en");
    expect(resolveLocale("sw")).toBe("sw");
  });

  it("shows English on a first visit (#80)", () => {
    expect(DEFAULT_LOCALE).toBe("en");
  });

  it("falls back to the default for missing or unsupported values", () => {
    expect(resolveLocale(undefined)).toBe(DEFAULT_LOCALE);
    expect(resolveLocale("fr")).toBe(DEFAULT_LOCALE);
    expect(resolveLocale("")).toBe(DEFAULT_LOCALE);
    expect(resolveLocale("EN")).toBe(DEFAULT_LOCALE);
  });
});
