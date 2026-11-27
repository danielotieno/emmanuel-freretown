/**
 * The status check's state (FR-7), shared by the server action and the form. The phone and
 * FWO number or reference travel in the form posts (hidden fields), never in the URL (rule 2).
 */

export const STATUS_STEPS = ["details", "review", "code", "result"] as const;
export type StatusStep = (typeof STATUS_STEPS)[number];

export interface StatusValues {
  phone: string;
  /** The FWO number or registration reference, as typed (D24). */
  key: string;
}

export type StatusErrorField = keyof StatusValues | "code";

/** What the result step shows: FR-7's answers. The name and HBC only for a match (D48). */
export type StatusOutcome =
  | { status: "REGISTERED_MEMBER"; fullName: string; hbcName: string }
  /** `hbcName` null: a new member's HBC, to be set by the Church Secretary (D49). */
  | { status: "RECEIVED"; fullName: string; hbcName: string | null }
  | { status: "CONTACT_OFFICE" | "NOT_FOUND" };

export interface StatusState {
  step: StatusStep;
  values: StatusValues;
  /** Messages per field, already in the visitor's language. */
  errors: Partial<Record<StatusErrorField, string>>;
  /** A message for the whole step. */
  notice?: string;
  challengeId?: string;
  /** Set on "result"; the values are cleared then. */
  outcome?: StatusOutcome;
  /** Counts the server's answers, so the Turnstile widget is remounted and never reused. */
  attempt: number;
}

export const EMPTY_STATUS_VALUES: StatusValues = { phone: "", key: "" };

export function isStatusStep(value: unknown): value is StatusStep {
  return typeof value === "string" && (STATUS_STEPS as readonly string[]).includes(value);
}

export function readStatusValues(form: FormData): StatusValues {
  const text = (name: string) => {
    const value = form.get(name);
    return typeof value === "string" ? value.slice(0, 40) : "";
  };
  return { phone: text("phone"), key: text("key") };
}
