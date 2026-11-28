import { describe, expect, it } from "vitest";
import {
  checkAssistedRegistration,
  checkCorrection,
  checkEventLabel,
  checkFullName,
  checkFwoNumber,
  checkPhone,
  checkReason,
  checkSelfRegistration,
  type AssistedRegistrationFields,
  type CorrectionFields,
} from "./fields";

describe("checkFullName", () => {
  it("trims and collapses spaces, and keeps 2 to 120 characters (database CHECK)", () => {
    expect(checkFullName("  Test   Person ")).toEqual({ ok: true, value: "Test Person" });
    expect(checkFullName("   ")).toEqual({ ok: false, error: "required" });
    expect(checkFullName("A")).toEqual({ ok: false, error: "too_short" });
    expect(checkFullName("A".repeat(121))).toEqual({ ok: false, error: "too_long" });
    expect(checkFullName("A".repeat(120)).ok).toBe(true);
  });

  it("counts characters as the database does, not UTF-16 units", () => {
    // One character outside the basic plane is two UTF-16 units but one character to Postgres.
    expect(checkFullName("\u{1D49C}")).toEqual({ ok: false, error: "too_short" });
    expect(checkFullName("\u{1D49C}".repeat(120)).ok).toBe(true);
  });
});

describe("checkFwoNumber (BR-01, BR-16)", () => {
  it("drops leading zeros, which don't count: 0042 is 42 (D61)", () => {
    expect(checkFwoNumber("0042", false)).toEqual({ ok: true, value: "42" });
    expect(checkFwoNumber("054", false)).toEqual({ ok: true, value: "54" });
    expect(checkFwoNumber("000", false)).toEqual({ ok: true, value: "0" });
    expect(checkFwoNumber(" 42 ", false)).toEqual({ ok: true, value: "42" });
  });

  it("has no length rule (BR-01: none until real numbers are reviewed)", () => {
    const long = "1".repeat(40);
    expect(checkFwoNumber(long, false)).toEqual({ ok: true, value: long });
    expect(checkFwoNumber("7", false)).toEqual({ ok: true, value: "7" });
  });

  it("refuses anything but digits, without changing what was typed", () => {
    for (const input of ["42a", "4 2", "-42", "4.2", "４２"]) {
      expect(checkFwoNumber(input, false)).toEqual({ ok: false, error: "invalid" });
    }
    expect(checkFwoNumber("", false)).toEqual({ ok: false, error: "required" });
  });

  it("needs no number for a new member", () => {
    expect(checkFwoNumber("", true)).toEqual({ ok: true, value: null });
    expect(checkFwoNumber("123", true)).toEqual({ ok: true, value: null });
  });
});

describe("checkPhone (BR-06)", () => {
  it("accepts Kenyan mobiles in any common form, as E.164", () => {
    expect(checkPhone("0712 345 678")).toEqual({ ok: true, value: "+254712345678" });
  });

  it("refuses other numbers", () => {
    expect(checkPhone("")).toEqual({ ok: false, error: "required" });
    expect(checkPhone("+255712345678")).toEqual({ ok: false, error: "invalid" });
  });
});

describe("checkSelfRegistration (FR-1, BR-07, BR-15)", () => {
  const valid = {
    fullName: "Test Person",
    isNewMember: false,
    fwoNumber: "0042",
    phone: "0712345678",
    hbcId: "0b6c3f9e-4d1a-4c2b-9f7e-2a5d8e1c3b40",
    departmentIds: ["d1", "d1", " ", "d2"],
    adultDeclared: true,
    privacyAcknowledged: true,
    transferConsent: true,
  };

  it("returns the cleaned values, with departments de-duplicated", () => {
    expect(checkSelfRegistration(valid)).toEqual({
      ok: true,
      value: {
        fullName: "Test Person",
        isNewMember: false,
        fwoNumber: "42",
        phoneE164: "+254712345678",
        hbcId: valid.hbcId,
        departmentIds: ["d1", "d2"],
      },
    });
  });

  it("needs the 18+ declaration, the privacy notice and the separate consent, each ticked", () => {
    const result = checkSelfRegistration({
      ...valid,
      adultDeclared: false,
      privacyAcknowledged: false,
      transferConsent: false,
    });
    expect(result).toEqual({
      ok: false,
      errors: {
        adultDeclared: "must_accept",
        privacyAcknowledged: "must_accept",
        transferConsent: "must_accept",
      },
    });
  });

  it("reports every invalid field at once", () => {
    const result = checkSelfRegistration({
      ...valid,
      fullName: "",
      fwoNumber: "x",
      phone: "1",
      hbcId: "",
    });
    expect(result).toEqual({
      ok: false,
      errors: { fullName: "required", fwoNumber: "invalid", phone: "invalid", hbcId: "required" },
    });
  });
});

describe("an HBC not known yet (D49)", () => {
  const newMember = {
    fullName: "Test Person",
    isNewMember: true,
    fwoNumber: "",
    phone: "0712345678",
    hbcId: "",
    hbcUnknown: true,
    departmentIds: [],
    adultDeclared: true,
    privacyAcknowledged: true,
    transferConsent: true,
  };

  it("lets a new member leave the HBC for the Church Secretary to set", () => {
    const checked = checkSelfRegistration(newMember);
    expect(checked.ok && checked.value.hbcId).toBeNull();
    const desk = checkAssistedRegistration({
      ...newMember,
      noPersonalPhone: false,
      verification: "IN_PERSON",
      eventLabel: "Judea HBC AGM, 17 Jan 2027",
      readBackConfirmed: true,
    });
    expect(desk.ok && desk.value.hbcId).toBeNull();
  });

  it("still needs an HBC from anyone with an FWO number (BR-04)", () => {
    expect(checkSelfRegistration({ ...newMember, isNewMember: false, fwoNumber: "0042" })).toEqual({
      ok: false,
      errors: { hbcId: "required" },
    });
  });

  it("keeps an HBC chosen when the box isn't ticked", () => {
    const checked = checkSelfRegistration({ ...newMember, hbcUnknown: false, hbcId: "hbc-1" });
    expect(checked.ok && checked.value.hbcId).toBe("hbc-1");
    expect(checkSelfRegistration({ ...newMember, hbcUnknown: false })).toEqual({
      ok: false,
      errors: { hbcId: "required" },
    });
  });
});

describe("checkEventLabel (FR-3)", () => {
  it("trims, collapses spaces and keeps 2 to 120 characters", () => {
    expect(checkEventLabel("  Judea HBC AGM,  17 Jan 2027 ")).toEqual({
      ok: true,
      value: "Judea HBC AGM, 17 Jan 2027",
    });
    expect(checkEventLabel("")).toEqual({ ok: false, error: "required" });
    expect(checkEventLabel("A".repeat(121))).toEqual({ ok: false, error: "too_long" });
  });
});

describe("checkAssistedRegistration (FR-3)", () => {
  const valid: AssistedRegistrationFields = {
    fullName: "Test Person",
    isNewMember: false,
    fwoNumber: "0042",
    noPersonalPhone: false,
    phone: "0712 345 678",
    hbcId: "hbc-1",
    departmentIds: ["d-1", "d-1", " "],
    verification: "PHONE_OTP",
    eventLabel: "Judea HBC AGM, 17 Jan 2027",
    adultDeclared: true,
    privacyAcknowledged: true,
    transferConsent: true,
    readBackConfirmed: true,
  };

  it("accepts FR-1's fields with the verification method and the event", () => {
    expect(checkAssistedRegistration(valid)).toEqual({
      ok: true,
      value: {
        fullName: "Test Person",
        isNewMember: false,
        fwoNumber: "42",
        phoneE164: "+254712345678",
        noPersonalPhone: false,
        hbcId: "hbc-1",
        departmentIds: ["d-1"],
        verification: "PHONE_OTP",
        eventLabel: "Judea HBC AGM, 17 Jan 2027",
      },
    });
  });

  it("records an unchecked phone as IN_PERSON (phone not at the desk)", () => {
    const checked = checkAssistedRegistration({ ...valid, verification: "IN_PERSON" });
    expect(checked.ok && checked.value).toMatchObject({
      phoneE164: "+254712345678",
      verification: "IN_PERSON",
    });
  });

  it("drops the phone for a member with no personal phone, who can't get a code (BR-06)", () => {
    const none = { ...valid, noPersonalPhone: true, phone: "not a phone" };
    const checked = checkAssistedRegistration({ ...none, verification: "IN_PERSON" });
    expect(checked.ok && checked.value).toMatchObject({ phoneE164: null, noPersonalPhone: true });
    expect(checkAssistedRegistration(none)).toEqual({
      ok: false,
      errors: { verification: "invalid" },
    });
  });

  it("needs a method, an event, and every confirmation, read-back included", () => {
    const checked = checkAssistedRegistration({
      ...valid,
      phone: "",
      verification: "",
      eventLabel: " ",
      adultDeclared: false,
      privacyAcknowledged: false,
      transferConsent: false,
      readBackConfirmed: false,
    });
    expect(checked).toEqual({
      ok: false,
      errors: {
        phone: "required",
        verification: "required",
        eventLabel: "required",
        adultDeclared: "must_accept",
        privacyAcknowledged: "must_accept",
        transferConsent: "must_accept",
        readBackConfirmed: "must_accept",
      },
    });
  });

  it("refuses an unknown verification method", () => {
    expect(
      checkAssistedRegistration({ ...valid, verification: "FWO_CONFIRMED_BY_SECRETARY" }),
    ).toEqual({ ok: false, errors: { verification: "required" } });
  });
});

describe("checkReason (FR-4)", () => {
  it("needs 3 to 500 characters once trimmed", () => {
    expect(checkReason("  Duplicate of REG-ABCDE  ")).toEqual({
      ok: true,
      value: "Duplicate of REG-ABCDE",
    });
    expect(checkReason("   ")).toEqual({ ok: false, error: "required" });
    expect(checkReason("no")).toEqual({ ok: false, error: "too_short" });
    expect(checkReason("x".repeat(501))).toEqual({ ok: false, error: "too_long" });
    expect(checkReason("x".repeat(500)).ok).toBe(true);
  });
});

describe("checkCorrection (FR-5)", () => {
  const HBC = "11111111-1111-4111-8111-111111111111";
  const fields: CorrectionFields = {
    fullName: " Test  Person ",
    fwoNumber: " 0042 ",
    noPersonalPhone: false,
    phone: "0712 345 678",
    hbcId: HBC,
    departmentIds: ["d1", "d1", " "],
  };

  it("cleans every detail as the desk does", () => {
    expect(checkCorrection(fields, false)).toEqual({
      ok: true,
      value: {
        fullName: "Test Person",
        fwoNumber: "42",
        phoneE164: "+254712345678",
        noPersonalPhone: false,
        hbcId: HBC,
        departmentIds: ["d1"],
      },
    });
  });

  it("drops the phone for a member with no personal phone (BR-06)", () => {
    const result = checkCorrection({ ...fields, noPersonalPhone: true, phone: "12" }, false);
    expect(result).toMatchObject({ ok: true, value: { phoneE164: null, noPersonalPhone: true } });
  });

  it("ignores a new member's FWO number, and lets only a new member leave the HBC unknown (BR-16, D49)", () => {
    const unknown = { ...fields, fwoNumber: "abc", hbcId: "", hbcUnknown: true };
    expect(checkCorrection(unknown, true)).toMatchObject({
      ok: true,
      value: { fwoNumber: null, hbcId: null },
    });
    expect(checkCorrection(unknown, false)).toEqual({
      ok: false,
      errors: { fwoNumber: "invalid", hbcId: "required" },
    });
  });

  it("names each wrong field", () => {
    expect(checkCorrection({ ...fields, fullName: "", fwoNumber: "", phone: "" }, false)).toEqual({
      ok: false,
      errors: { fullName: "required", fwoNumber: "required", phone: "required" },
    });
  });
});
