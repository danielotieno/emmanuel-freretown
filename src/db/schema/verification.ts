import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, id, PHONE_E164_PATTERN, tz } from "./columns";
import { registration } from "./registration";

/**
 * OTP challenges (FR-2). The code is never stored, only an HMAC-SHA256 of it. A correct code
 * sets `verified_at` and `token_hash` (an HMAC of the single-use verification token);
 * redeeming the token in the submission's transaction sets `consumed_at` (#15).
 */
export const phoneChallenge = pgTable(
  "phone_challenge",
  {
    id: id(),
    phoneE164: text("phone_e164").notNull(),
    purpose: text("purpose", { enum: ["REGISTRATION", "STATUS_CHECK"] }).notNull(),
    codeHash: text("code_hash").notNull(),
    attempts: integer("attempts").notNull().default(0),
    expiresAt: tz("expires_at").notNull(),
    verifiedAt: tz("verified_at"),
    tokenHash: text("token_hash"),
    consumedAt: tz("consumed_at"),
    createdAt: createdAt(),
  },
  (t) => [
    check("phone_challenge_phone_e164_check", sql`${t.phoneE164} ~ ${PHONE_E164_PATTERN}`),
    check("phone_challenge_purpose_check", sql`${t.purpose} IN ('REGISTRATION','STATUS_CHECK')`),
    check("phone_challenge_attempts_check", sql`${t.attempts} BETWEEN 0 AND 5`),
    check("phone_challenge_token_check", sql`(${t.verifiedAt} IS NULL) = (${t.tokenHash} IS NULL)`),
    check(
      "phone_challenge_consumed_check",
      sql`${t.consumedAt} IS NULL OR ${t.verifiedAt} IS NOT NULL`,
    ),
    index("phone_challenge_rate_idx").on(t.phoneE164, t.createdAt),
    uniqueIndex("phone_challenge_token_uq").on(t.tokenHash),
  ],
);

export const verificationEvidence = pgTable(
  "verification_evidence",
  {
    id: id(),
    registrationId: uuid("registration_id")
      .notNull()
      .references(() => registration.id),
    kind: text("kind", {
      enum: ["PHONE_OTP", "IN_PERSON", "FWO_CONFIRMED_BY_SECRETARY"],
    }).notNull(),
    phoneE164: text("phone_e164"),
    actorUserId: text("actor_user_id"),
    eventLabel: text("event_label"),
    at: tz("at").notNull().defaultNow(),
    redactedAt: tz("redacted_at"),
  },
  (t) => [
    check(
      "verification_evidence_kind_check",
      sql`${t.kind} IN ('PHONE_OTP','IN_PERSON','FWO_CONFIRMED_BY_SECRETARY')`,
    ),
    check(
      "verification_evidence_phone_check",
      sql`${t.kind} <> 'PHONE_OTP' OR ${t.phoneE164} IS NOT NULL OR ${t.redactedAt} IS NOT NULL`,
    ),
    check(
      "verification_evidence_actor_check",
      sql`${t.kind} = 'PHONE_OTP' OR ${t.actorUserId} IS NOT NULL`,
    ),
    index("verification_evidence_reg_idx").on(t.registrationId),
  ],
);
