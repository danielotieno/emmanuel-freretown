import { describe, expect, it } from "vitest";
import {
  checkMemberDetails,
  checkMemberReason,
  isClosedStatus,
  MEMBER_STATUSES,
  nextStatuses,
  type MemberDetailsFields,
} from "./records";

// Member records (#22, FR-6): the pure rules. Every value is synthetic.

const fields = (over: Partial<MemberDetailsFields> = {}): MemberDetailsFields => ({
  fullName: "Test Person",
  noPersonalPhone: false,
  phone: "0712 345 678",
  language: "en",
  departmentIds: [],
  ...over,
});

describe("the member lifecycle (domain-model.md §3)", () => {
  it("lets active and inactive members move between each other, or be closed", () => {
    expect(nextStatuses("ACTIVE")).toEqual(["INACTIVE", "DECEASED", "TRANSFERRED_OUT"]);
    expect(nextStatuses("INACTIVE")).toEqual(["ACTIVE", "DECEASED", "TRANSFERRED_OUT"]);
  });

  it("makes deceased and transferred out final: the record is closed", () => {
    for (const status of MEMBER_STATUSES) {
      const closed = status === "DECEASED" || status === "TRANSFERRED_OUT";
      expect(isClosedStatus(status), status).toBe(closed);
      if (closed) expect(nextStatuses(status)).toEqual([]);
    }
  });

  it("never offers the status a member already has", () => {
    for (const status of MEMBER_STATUSES) expect(nextStatuses(status)).not.toContain(status);
  });
});

describe("checkMemberDetails (FR-6)", () => {
  it("cleans the name and stores the phone in E.164 (BR-06)", () => {
    const checked = checkMemberDetails(
      fields({ fullName: "  Test   Person ", departmentIds: ["a", "a", " "] }),
    );
    expect(checked).toEqual({
      ok: true,
      value: {
        fullName: "Test Person",
        phoneE164: "+254712345678",
        language: "en",
        departmentIds: ["a"],
      },
    });
  });

  it("drops the phone for a member with no personal phone", () => {
    const checked = checkMemberDetails(fields({ noPersonalPhone: true, phone: "not a number" }));
    expect(checked.ok && checked.value.phoneE164).toBeNull();
  });

  it("names each wrong field", () => {
    expect(checkMemberDetails(fields({ fullName: "", phone: "", language: "fr" }))).toEqual({
      ok: false,
      errors: { fullName: "required", phone: "required", language: "required" },
    });
    expect(checkMemberDetails(fields({ fullName: "A", phone: "020 123 4567" }))).toEqual({
      ok: false,
      errors: { fullName: "too_short", phone: "invalid" },
    });
  });

  it("counts the name in code points, as the database CHECK does", () => {
    expect(checkMemberDetails(fields({ fullName: "😀".repeat(120) })).ok).toBe(true);
    expect(checkMemberDetails(fields({ fullName: "😀".repeat(121) }))).toMatchObject({
      errors: { fullName: "too_long" },
    });
  });

  it("refuses control characters in the name", () => {
    expect(checkMemberDetails(fields({ fullName: "Test\u0000Person" }))).toMatchObject({
      errors: { fullName: "invalid" },
    });
  });
});

describe("checkMemberReason (FR-6: every change needs a reason)", () => {
  it("requires 3 to 500 characters", () => {
    expect(checkMemberReason("  ")).toEqual({ ok: false, error: "required" });
    expect(checkMemberReason("ab")).toEqual({ ok: false, error: "too_short" });
    expect(checkMemberReason("a".repeat(501))).toEqual({ ok: false, error: "too_long" });
    expect(checkMemberReason("  Moved to Mtwapa  ")).toEqual({
      ok: true,
      value: "Moved to Mtwapa",
    });
  });

  it("keeps line breaks but refuses other control characters", () => {
    expect(checkMemberReason("First line\nsecond line").ok).toBe(true);
    expect(checkMemberReason("Bad\u0007reason")).toEqual({ ok: false, error: "invalid" });
  });
});
