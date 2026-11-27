import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { getDb } from "@/app/_lib/db";
import { requireStaff } from "@/app/_lib/staff";
import { AlertIcon, ArrowIcon, CheckIcon } from "@/components/icons";
import { staffNames } from "@/modules/access";
import { listActiveHbcs, unitNames } from "@/modules/organisation";
import {
  openRegistrationForReview,
  PRIVACY_NOTICE_VERSION,
  suggestFwoNumber,
} from "@/modules/registration";
import { formatDateTime } from "../format";
import { DecisionForms } from "./decision-forms";
import { IssueFwoForm } from "./issue-fwo-form";

export const metadata: Metadata = { title: "Registration · Review · Staff" };

const STATUS_NAMES = {
  SUBMITTED: "Waiting for review",
  CORRECTION_REQUESTED: "Correction requested",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  WITHDRAWN: "Withdrawn",
} as const;

const EVIDENCE_NAMES: Record<string, string> = {
  PHONE_OTP: "Phone checked by code",
  IN_PERSON: "Met in person by an officer",
  FWO_CONFIRMED_BY_SECRETARY: "FWO number confirmed by the Secretary",
};

const DECISION_NAMES: Record<string, string> = {
  APPROVE: "Approved",
  REJECT: "Rejected",
  REQUEST_CORRECTION: "Correction requested",
  WITHDRAW: "Withdrawn",
};

/**
 * One registration, for a Membership Administrator to review (FR-4, #19). Opening it is
 * recorded as access to personal data (D31) by the registration module, before anything is
 * shown. The forms only offer what the rules allow; the server actions check everything again.
 */
export default async function ReviewRegistrationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const staff = await requireStaff("MEMBERSHIP_ADMIN");
  const { id } = await params;
  // Set by the issue-FWO action after it saves: only what happened, never the number (rule 2).
  const fwoIssued = (await searchParams).done === "fwo";
  const db = await getDb();
  const reg = await openRegistrationForReview(db, {
    registrationId: id,
    actor: { type: "STAFF", userId: staff.userId },
    requestId: (await headers()).get("x-request-id") ?? undefined,
  });
  if (!reg) notFound();

  const staffIds = [
    reg.capturedByUserId,
    reg.details.submittedByUserId,
    ...reg.evidence.map((e) => e.actorUserId),
    ...reg.decisions.map((d) => d.actorUserId),
  ].filter((x): x is string => !!x);
  // A new member waiting for the FWO number the Secretary issues (BR-16, #101).
  const waitingForFwo =
    reg.status === "SUBMITTED" && reg.details.isNewMember && !reg.details.fwoNumber;
  const [units, names, suggestion, activeHbcs] = await Promise.all([
    unitNames(db),
    staffNames(db, staffIds),
    waitingForFwo ? suggestFwoNumber(db) : null,
    waitingForFwo && !reg.details.hbcId ? listActiveHbcs(db) : null,
  ]);
  const who = (userId: string | null) => (userId ? (names.get(userId) ?? "A staff member") : "");
  const { details } = reg;

  // Why approval can't happen now. The server enforces all of these again.
  const blocks: string[] = [];
  if (reg.capturedByUserId === staff.userId) {
    blocks.push(
      "You captured this registration, so a Super Administrator must approve it (BR-10, D36).",
    );
  }
  if (!details.fwoNumber) {
    blocks.push(
      "No FWO number yet: the Church Secretary must issue one and enter it before approval (BR-16).",
    );
  }
  if (!details.hbcId && reg.status === "SUBMITTED") {
    blocks.push(
      "No HBC yet: the member didn't know it. The Church Secretary sets it with the FWO number (BR-04, D49).",
    );
  }
  if (reg.live.fwoHeldByMember) {
    blocks.push(
      "This FWO number belongs to an existing member. Reject this registration with a reason (D33).",
    );
  }
  if (reg.live.fwoInOpenRegistrations.length > 0) {
    blocks.push(
      `Another registration waiting for review has this FWO number: ${reg.live.fwoInOpenRegistrations.join(", ")}. Compare them and reject the duplicate with a reason first (BR-03, D33).`,
    );
  }
  if (reg.live.phoneHeldByMember) {
    blocks.push(
      "This phone number belongs to another member. Call both people to agree who keeps it (D28), then have the registration corrected.",
    );
  }

  return (
    <main className="min-h-dvh bg-cloud pb-16">
      <div className="mx-auto max-w-prose px-4 pt-4 sm:px-6 sm:pt-8">
        <Link
          href="/review"
          className="inline-flex min-h-11 items-center gap-2 text-small text-ink-muted hover:text-ink"
        >
          <ArrowIcon className="rotate-180" />
          Review queue
        </Link>
        <h1 className="mt-4 text-title tabular-nums">{reg.reference}</h1>
        <p className="mt-2 text-ink-muted">
          {STATUS_NAMES[reg.status]} ·{" "}
          {reg.channel === "SELF" ? "Self-registration" : "Assisted registration"} · submitted{" "}
          {formatDateTime(reg.submittedAt)}
        </p>
        {fwoIssued && (
          <p role="status" className="mt-6 flex gap-3 rounded-xl bg-mist p-4">
            <CheckIcon size="size-5" />
            <span>FWO number entered. The registration can now be approved.</span>
          </p>
        )}

        {(reg.fwoConflict || reg.phoneConflict || details.isNewMember) && (
          <ul className="mt-6 space-y-2">
            {reg.fwoConflict && (
              <Flag>
                FWO conflict when submitted: the number matched a member or another open
                registration (BR-03).
              </Flag>
            )}
            {reg.phoneConflict && (
              <Flag>
                Phone conflict when submitted: the number belonged to another member (BR-06).
              </Flag>
            )}
            {details.isNewMember && (
              <Flag>New member: registered without an FWO number (BR-16).</Flag>
            )}
          </ul>
        )}

        <Section title="Details">
          <dl className="divide-y divide-line">
            <Row term="Full name">{details.fullName}</Row>
            <Row term="FWO number">
              {details.fwoNumber ? (
                <span className="tabular-nums">{details.fwoNumber}</span>
              ) : (
                "None yet (new member)"
              )}
            </Row>
            <Row term="Mobile number">
              {details.noPersonalPhone ? (
                "No personal phone"
              ) : (
                <span className="tabular-nums">{details.phoneE164}</span>
              )}
            </Row>
            <Row term="HBC">
              {details.hbcId
                ? units.hbcs.get(details.hbcId)
                : "To be set: the member didn't know it (D49)"}
            </Row>
            <Row term="Departments (declared)">
              {details.departmentIds.length
                ? details.departmentIds.map((d) => units.departments.get(d) ?? d).join(", ")
                : "None"}
            </Row>
            <Row term="SMS language">{reg.language === "sw" ? "Kiswahili" : "English"}</Row>
            {reg.channel === "ASSISTED" && (
              <>
                <Row term="Event">{reg.eventLabel}</Row>
                <Row term="Captured by">{who(reg.capturedByUserId)}</Row>
              </>
            )}
            <Row term="Privacy notice">Version {details.privacyNoticeVersion}</Row>
            <Row term="Revision">
              {reg.revisionNo} · {formatDateTime(details.submittedAt)}
            </Row>
          </dl>
        </Section>

        <Section title="Verification evidence">
          {reg.evidence.length === 0 ? (
            <p className="px-5 py-4 text-ink-muted">None recorded.</p>
          ) : (
            <ul className="divide-y divide-line">
              {reg.evidence.map((e, i) => (
                <li key={i} className="px-5 py-4">
                  {EVIDENCE_NAMES[e.kind] ?? e.kind}
                  <span className="block text-small text-ink-muted">
                    {[who(e.actorUserId), e.eventLabel, formatDateTime(e.at)]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        {reg.decisions.length > 0 && (
          <Section title="Decisions">
            <ul className="divide-y divide-line">
              {reg.decisions.map((d, i) => (
                <li key={i} className="px-5 py-4">
                  {DECISION_NAMES[d.action] ?? d.action}
                  {d.reason && <span className="block">{d.reason}</span>}
                  <span className="block text-small text-ink-muted">
                    {who(d.actorUserId)} · {formatDateTime(d.at)}
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {waitingForFwo && (
          <IssueFwoForm
            registrationId={reg.id}
            version={reg.version}
            suggestion={suggestion}
            noticeChanged={details.privacyNoticeVersion !== PRIVACY_NOTICE_VERSION}
            hbcs={activeHbcs}
          />
        )}

        <DecisionForms
          registrationId={reg.id}
          version={reg.version}
          approvalBlocks={blocks}
          hasPhone={!details.noPersonalPhone}
          open={reg.status === "SUBMITTED"}
          statusName={STATUS_NAMES[reg.status]}
        />
      </div>
    </main>
  );
}

function Flag({ children }: { children: ReactNode }) {
  return (
    <li className="flex gap-3 rounded-xl bg-mist p-4 text-ink">
      <AlertIcon className="mt-1 text-brand" />
      <span>{children}</span>
    </li>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-subtitle">{title}</h2>
      <div className="in-card mt-3 overflow-hidden rounded-2xl border border-line bg-paper text-card">
        {children}
      </div>
    </section>
  );
}

function Row({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 px-5 py-3 sm:grid-cols-3 sm:gap-4">
      <dt className="text-ink-muted">{term}</dt>
      <dd className="sm:col-span-2">{children}</dd>
    </div>
  );
}
