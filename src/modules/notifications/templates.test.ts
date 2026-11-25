import { describe, expect, it } from "vitest";
import { SafeError } from "../observability";
import { renderOtpSms, renderSms, SMS_TEMPLATES, validateSmsParams } from "./templates";

// One SMS part is 160 GSM-7 characters; anything longer is billed as two or more (and counts
// more than once against nothing: the cap counts messages). Keep every template to one part,
// in plain characters that every handset shows.
const ONE_PART = 160;
const PLAIN = /^[A-Za-z0-9 .,:'?!()/-]+$/;
// SMS come from the shared MOBILESASA sender (D43), so every text opens with the church's name,
// to identify us as the sender.
const FROM = "ACK Emmanuel Freretown - Kengeleni: ";

describe("SMS templates (FR-8, NFR-5)", () => {
  for (const template of SMS_TEMPLATES) {
    for (const locale of ["en", "sw"] as const) {
      it(`${template} (${locale}) names the church, fits one plain SMS and carries the reference`, () => {
        const text = renderSms(template, { reference: "REG-7K3M9" }, locale);
        expect(text.length).toBeLessThanOrEqual(ONE_PART);
        expect(text).toMatch(PLAIN);
        expect(text).toContain("REG-7K3M9");
        expect(text.slice(0, FROM.length)).toBe(FROM);
      });
    }
  }

  it("has Kiswahili text different from English for every template", () => {
    for (const template of SMS_TEMPLATES) {
      const p = { reference: "REG-7K3M9" };
      expect(renderSms(template, p, "sw")).not.toBe(renderSms(template, p, "en"));
    }
  });

  it("refuses any parameter but a well-formed reference, naming no value", () => {
    const attempts = [
      { reference: "REG-7K3M9", fullName: "Test Person" },
      { reference: "REG-7K3M9", phone: "+254700000001" },
      { reference: "not-a-ref" },
      {},
      null,
    ];
    for (const params of attempts) {
      let error: unknown;
      try {
        validateSmsParams("registration.approved", params);
      } catch (e) {
        error = e;
      }
      expect(error).toBeInstanceOf(SafeError);
      expect((error as SafeError).message).not.toMatch(/Test Person|\+254/);
    }
  });
});

describe("renderOtpSms", () => {
  it.each(["en", "sw"] as const)("names the church and fits one plain SMS in %s", (locale) => {
    const text = renderOtpSms("482913", locale);
    expect(text).toContain("482913");
    expect(text.slice(0, FROM.length)).toBe(FROM);
    expect(text.length).toBeLessThanOrEqual(ONE_PART);
    expect(text).toMatch(PLAIN);
  });

  it("accepts only six digits", () => {
    for (const code of ["48291", "4829130", "48291a", ""]) {
      expect(() => renderOtpSms(code, "en")).toThrow(SafeError);
    }
  });
});
