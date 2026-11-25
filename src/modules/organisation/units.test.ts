import { describe, expect, it } from "vitest";
import type { DbOrTx } from "../../db";
import { checkUnitsForRegistration } from "./units";

// Ids that can't be uuids are unavailable without a query: Postgres would otherwise fail the
// whole registration transaction with invalid_text_representation (22P02). The database path
// is covered in tests/integration/organisation.test.ts.
const untouchable = new Proxy(
  {},
  {
    get() {
      throw new Error("the database must not be touched");
    },
  },
) as DbOrTx;

describe("checkUnitsForRegistration", () => {
  it("treats malformed ids as unavailable without querying", async () => {
    expect(
      await checkUnitsForRegistration(untouchable, {
        hbcId: "Judea",
        departmentIds: ["KAYO", "", "kayo", "1"],
      }),
    ).toEqual({ ok: false, hbcUnavailable: true, unavailableDepartmentIds: ["KAYO", "", "1"] });
  });
});
