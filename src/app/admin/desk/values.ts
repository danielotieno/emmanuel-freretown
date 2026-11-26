/**
 * The officer desk's form state (FR-3, #18), shared by the client form and the server actions.
 * The server reads every value again with `readDeskValues` and checks it with the registration
 * module before anything is stored: nothing from the browser is trusted.
 */

export const DESK_STEPS = ["event", "member", "phone", "confirm", "code", "done"] as const;
export type DeskStep = (typeof DESK_STEPS)[number];

/** The steps counted in "Step x of y": "code" only when a code is sent, never "done". */
export function countedSteps(phoneMode: PhoneMode): DeskStep[] {
  return DESK_STEPS.filter((s) => s !== "done" && (s !== "code" || phoneMode === "otp"));
}

/**
 * How the member's phone is handled (FR-3): at the desk, so a code is sent (`PHONE_OTP`); not
 * at the desk, so the number is recorded unchecked (`IN_PERSON`); or no personal phone at all
 * (`IN_PERSON`, no number, no SMS). Empty until the officer chooses.
 */
export const PHONE_MODES = ["otp", "unverified", "none"] as const;
export type PhoneMode = (typeof PHONE_MODES)[number] | "";

export interface DeskValues {
  eventLabel: string;
  /** The member's language for their SMS, which may differ from the desk's language. */
  language: "en" | "sw";
  fullName: string;
  isNewMember: boolean;
  fwoNumber: string;
  hbcId: string;
  departmentIds: string[];
  phoneMode: PhoneMode;
  phone: string;
  readBackConfirmed: boolean;
  adultDeclared: boolean;
  privacyAcknowledged: boolean;
  transferConsent: boolean;
}

export type DeskField = keyof DeskValues;
export type DeskErrorField = DeskField | "code";

/** The fields each step asks for. */
export const DESK_STEP_FIELDS: Partial<Record<DeskStep, DeskField[]>> = {
  event: ["eventLabel", "language"],
  member: ["fullName", "isNewMember", "fwoNumber", "hbcId", "departmentIds"],
  phone: ["phoneMode", "phone"],
  confirm: ["readBackConfirmed", "adultDeclared", "privacyAcknowledged", "transferConsent"],
};

export function deskStepOf(field: DeskField): DeskStep {
  for (const [step, fields] of Object.entries(DESK_STEP_FIELDS)) {
    if (fields.includes(field)) return step as DeskStep;
  }
  return "confirm";
}

export function emptyDeskValues(event?: { eventLabel: string; language: "en" | "sw" }) {
  return {
    eventLabel: event?.eventLabel ?? "",
    language: event?.language ?? "en",
    fullName: "",
    isNewMember: false,
    fwoNumber: "",
    hbcId: "",
    departmentIds: [],
    phoneMode: "",
    phone: "",
    readBackConfirmed: false,
    adultDeclared: false,
    privacyAcknowledged: false,
    transferConsent: false,
  } satisfies DeskValues;
}

/** A server's answer to one step. */
export interface DeskAnswer {
  /** Messages per field, already in the desk's language. */
  errors: Partial<Record<DeskErrorField, string>>;
  /** A message for the whole step. */
  notice?: string;
  /** Where the form goes next. */
  step?: DeskStep;
  /** Set when a code was sent. */
  challengeId?: string;
  /** Set when the registration was stored. */
  reference?: string;
  /** Whether a confirmation SMS goes to the member (not when they have no personal phone). */
  sms?: boolean;
  /** Departments deactivated since the form loaded, to untick. */
  unavailableDepartmentIds?: string[];
}

function text(input: Record<string, unknown>, name: string, max = 200): string {
  const value = input[name];
  return typeof value === "string" ? value.slice(0, max) : "";
}

function ticked(input: Record<string, unknown>, name: string): boolean {
  return input[name] === true;
}

/** Reads the values a client sent, keeping only well-typed, bounded ones. */
export function readDeskValues(input: unknown): DeskValues {
  const o = typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {};
  const phoneMode = text(o, "phoneMode");
  const departments = Array.isArray(o.departmentIds) ? o.departmentIds : [];
  return {
    eventLabel: text(o, "eventLabel"),
    language: o.language === "sw" ? "sw" : "en",
    fullName: text(o, "fullName"),
    isNewMember: ticked(o, "isNewMember"),
    fwoNumber: text(o, "fwoNumber"),
    hbcId: text(o, "hbcId", 64),
    departmentIds: departments
      .filter((d): d is string => typeof d === "string")
      .map((d) => d.slice(0, 64))
      .slice(0, 20),
    phoneMode: (PHONE_MODES as readonly string[]).includes(phoneMode)
      ? (phoneMode as PhoneMode)
      : "",
    phone: text(o, "phone", 20),
    readBackConfirmed: ticked(o, "readBackConfirmed"),
    adultDeclared: ticked(o, "adultDeclared"),
    privacyAcknowledged: ticked(o, "privacyAcknowledged"),
    transferConsent: ticked(o, "transferConsent"),
  };
}

/**
 * The unfinished registration, kept in this browser tab only (sessionStorage): it survives a
 * reload, a dropped connection and a sign-in after an idle timeout, and is gone when the tab
 * closes. It is cleared when the registration is submitted, on "Start over" and on sign-out.
 * Keyed by officer, so a colleague signing in on the same tab never sees it. Never in the URL
 * and never sent anywhere but our own server actions (rule 2).
 */
export interface DeskDraft {
  step: DeskStep;
  values: DeskValues;
  challengeId?: string;
}

export const DESK_STORAGE_PREFIX = "desk:";

const draftKey = (userId: string) => `${DESK_STORAGE_PREFIX}draft:${userId}`;
const eventKey = (userId: string) => `${DESK_STORAGE_PREFIX}event:${userId}`;

function storage(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function loadDraft(userId: string): DeskDraft | null {
  try {
    const raw = storage()?.getItem(draftKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DeskDraft>;
    const step = (DESK_STEPS as readonly string[]).includes(parsed.step ?? "")
      ? (parsed.step as DeskStep)
      : "event";
    if (step === "done") return null;
    const challengeId = typeof parsed.challengeId === "string" ? parsed.challengeId : undefined;
    return { step, values: readDeskValues(parsed.values), challengeId };
  } catch {
    return null;
  }
}

export function saveDraft(userId: string, draft: DeskDraft): void {
  try {
    storage()?.setItem(draftKey(userId), JSON.stringify(draft));
  } catch {
    // Storage full or blocked: the form still works, it just won't survive a reload.
  }
}

export function clearDraft(userId: string): void {
  try {
    storage()?.removeItem(draftKey(userId));
  } catch {
    // Nothing to clear.
  }
}

/** The event and SMS language, kept for the next person at the same desk. */
export function loadEvent(userId: string): { eventLabel: string; language: "en" | "sw" } | null {
  try {
    const raw = storage()?.getItem(eventKey(userId));
    if (!raw) return null;
    const values = readDeskValues(JSON.parse(raw));
    return { eventLabel: values.eventLabel, language: values.language };
  } catch {
    return null;
  }
}

export function saveEvent(userId: string, event: { eventLabel: string; language: string }) {
  try {
    storage()?.setItem(eventKey(userId), JSON.stringify(event));
  } catch {
    // As saveDraft.
  }
}

/** Removes every desk draft and event in this tab: on sign-out. */
export function clearDeskStorage(): void {
  try {
    const store = storage();
    if (!store) return;
    for (const key of Object.keys(store)) {
      if (key.startsWith(DESK_STORAGE_PREFIX)) store.removeItem(key);
    }
  } catch {
    // Nothing to clear.
  }
}
