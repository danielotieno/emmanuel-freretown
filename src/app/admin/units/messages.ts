import type { UnitChangeRefusal, UnitKind, UnitNameError } from "@/modules/organisation";

/** Staff words for each kind of unit (FR-9). Staff screens are English-only (NFR-5). */
export const KIND_NAMES: Record<UnitKind, { one: string; many: string }> = {
  hbc: { one: "HBC", many: "HBCs" },
  department: { one: "department", many: "Departments" },
};

const NAME_ERRORS: Record<UnitNameError, string> = {
  required: "Enter a name.",
  too_short: "The name must be at least 2 characters.",
  too_long: "The name must be 80 characters or fewer.",
  invalid: "Remove the unusual characters from the name.",
};

/** Why a change was refused, for the add and rename forms and for the list's banner. */
export function refusalMessage(
  refusal: UnitChangeRefusal | { invalid: UnitNameError },
  kind: UnitKind,
): string {
  if (typeof refusal === "object") return NAME_ERRORS[refusal.invalid];
  const one = KIND_NAMES[kind].one;
  switch (refusal) {
    case "not_found":
      return `This ${one} no longer exists. The list below is up to date.`;
    case "unchanged":
      return "Nothing changed.";
    case "name_taken":
      return `Another ${one} already has this name (ignoring capitals, spaces and apostrophes). Choose another.`;
    case "last_active_hbc":
      return "This is the last active HBC: every member and new registration needs one (BR-04).";
  }
}
