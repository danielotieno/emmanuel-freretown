/**
 * The registration form's state, shared by the server action and the form. Values travel in the
 * form posts (hidden fields for earlier steps), never in the URL (rule 2), and every value is
 * checked again on the server before anything is stored.
 */

export const STEPS = [
  "name",
  "fwo",
  "hbc",
  "departments",
  "phone",
  "declarations",
  "review",
  "code",
  "done",
] as const;
export type Step = (typeof STEPS)[number];

/** The steps counted in "Step x of y": all but the final "done". */
export const COUNTED_STEPS = STEPS.length - 1;

export interface FormValues {
  fullName: string;
  isNewMember: boolean;
  fwoNumber: string;
  phone: string;
  hbcId: string;
  /** D49: a new member who doesn't know their HBC yet. */
  hbcUnknown: boolean;
  departmentIds: string[];
  adultDeclared: boolean;
  privacyAcknowledged: boolean;
  transferConsent: boolean;
}

export type ErrorField = keyof FormValues | "code";

/** The fields each step asks for, in order; every other value rides along in hidden fields. */
export const STEP_FIELDS: Partial<Record<Step, (keyof FormValues)[]>> = {
  name: ["fullName"],
  fwo: ["isNewMember", "fwoNumber"],
  hbc: ["hbcId", "hbcUnknown"],
  departments: ["departmentIds"],
  phone: ["phone"],
  declarations: ["adultDeclared", "privacyAcknowledged", "transferConsent"],
};

/** The step that asks for a field. */
export function stepOf(field: keyof FormValues): Step {
  for (const [step, fields] of Object.entries(STEP_FIELDS)) {
    if (fields.includes(field)) return step as Step;
  }
  return "review";
}

export interface RegistrationState {
  step: Step;
  values: FormValues;
  /** Messages per field, already in the visitor's language. */
  errors: Partial<Record<ErrorField, string>>;
  /** A message for the whole step. */
  notice?: string;
  challengeId?: string;
  /** Set on "done". */
  reference?: string;
  /**
   * Counts the server's answers. The Turnstile widget is remounted on each one, so it never
   * offers a token that was already spent: Cloudflare accepts each token once.
   */
  attempt: number;
}

export const EMPTY_VALUES: FormValues = {
  fullName: "",
  isNewMember: false,
  fwoNumber: "",
  phone: "",
  hbcId: "",
  hbcUnknown: false,
  departmentIds: [],
  adultDeclared: false,
  privacyAcknowledged: false,
  transferConsent: false,
};

export function isStep(value: unknown): value is Step {
  return typeof value === "string" && (STEPS as readonly string[]).includes(value);
}

/** Reads every field from a post: the current step's inputs and earlier steps' hidden fields. */
export function readValues(form: FormData): FormValues {
  const text = (name: string) => {
    const value = form.get(name);
    return typeof value === "string" ? value.slice(0, 500) : "";
  };
  const ticked = (name: string) => form.get(name) === "on";
  return {
    fullName: text("fullName"),
    isNewMember: ticked("isNewMember"),
    fwoNumber: text("fwoNumber"),
    phone: text("phone"),
    hbcId: text("hbcId"),
    hbcUnknown: ticked("hbcUnknown"),
    departmentIds: form
      .getAll("departmentIds")
      .filter((v): v is string => typeof v === "string")
      .slice(0, 20),
    adultDeclared: ticked("adultDeclared"),
    privacyAcknowledged: ticked("privacyAcknowledged"),
    transferConsent: ticked("transferConsent"),
  };
}
