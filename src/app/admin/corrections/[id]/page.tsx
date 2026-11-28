import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/app/_lib/db";
import { requireStaff } from "@/app/_lib/staff";
import { AlertIcon, ArrowIcon } from "@/components/icons";
import { staffNames, type Staff } from "@/modules/access";
import { listActiveDepartments, listActiveHbcs, unitNames } from "@/modules/organisation";
import { openRegistrationForCorrection, PRIVACY_NOTICE_VERSION } from "@/modules/registration";
import { formatDateTime } from "../../review/format";
import { RevisionList } from "../../review/revisions";
import { CorrectionForm } from "./correction-form";
import { StaffShell } from "../../_components/staff-shell";

export const metadata: Metadata = { title: "Correction · Staff" };

/**
 * One registration an administrator asked to be corrected (FR-5, #21), for a Registration
 * Officer or an administrator to correct with the member. Only a registration waiting for a
 * correction is shown; opening it is recorded as access to personal data (D31) by the
 * registration module, before anything is shown. The form only offers what the rules allow; the
 * server action checks everything again.
 */
export default async function CorrectionPage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff(["REGISTRATION_OFFICER", "MEMBERSHIP_ADMIN"]);
  const { id } = await params;
  const db = await getDb();
  const reg = await openRegistrationForCorrection(db, {
    registrationId: id,
    actor: { type: "STAFF", userId: staff.userId },
    requestId: (await headers()).get("x-request-id") ?? undefined,
  });
  if (!reg) notFound();
  if (reg === "not_waiting") return <NotWaiting staff={staff} />;

  const request = reg.decisions.findLast((d) => d.action === "REQUEST_CORRECTION");
  const [units, names, hbcs, departments] = await Promise.all([
    unitNames(db),
    staffNames(
      db,
      [
        request?.actorUserId,
        reg.details.submittedByUserId,
        ...reg.earlierRevisions.map((r) => r.submittedByUserId),
      ].filter((x): x is string => !!x),
    ),
    listActiveHbcs(db),
    listActiveDepartments(db),
  ]);
  const who = (userId: string | null | undefined) =>
    userId ? (names.get(userId) ?? "A staff member") : "";
  const { details } = reg;

  return (
    <StaffShell staff={staff} current="corrections" width="prose">
      <BackLink />
      <h1 className="mt-4 text-title tabular-nums">{reg.reference}</h1>
      <p className="mt-2 text-ink-muted">
        {reg.channel === "SELF" ? "Self-registration" : "Assisted registration"} · submitted{" "}
        {formatDateTime(reg.submittedAt)}
      </p>

      {request && (
        <section className="mt-6 rounded-xl bg-mist p-4">
          <h2 className="text-ink">What to correct</h2>
          <p className="mt-1">{request.reason}</p>
          <p className="mt-1 text-small text-ink-muted">
            Asked by {who(request.actorUserId)} · {formatDateTime(request.at)}
          </p>
        </section>
      )}

      <RevisionList
        title="Current details"
        revisions={[{ ...details, revisionNo: reg.revisionNo }]}
        units={units}
        who={who}
        open
      />
      {reg.earlierRevisions.length > 0 && (
        <RevisionList
          title="Earlier revisions"
          revisions={reg.earlierRevisions}
          units={units}
          who={who}
        />
      )}

      <CorrectionForm
        registrationId={reg.id}
        version={reg.version}
        current={{
          fullName: details.fullName ?? "",
          fwoNumber: details.fwoNumber ?? "",
          noPersonalPhone: details.noPersonalPhone,
          phone: details.phoneE164 ?? "",
          hbcId: details.hbcId ?? (details.isNewMember ? "unknown" : ""),
          departmentIds: details.departmentIds,
        }}
        isNewMember={details.isNewMember}
        mayLeaveHbcUnknown={details.isNewMember && !details.fwoNumber}
        noticeChanged={details.privacyNoticeVersion !== PRIVACY_NOTICE_VERSION}
        hbcs={hbcs}
        departments={departments}
      />
    </StaffShell>
  );
}

/** Corrected or decided already, or never asked: nothing personal is shown. */
function NotWaiting({ staff }: { staff: Staff }) {
  return (
    <StaffShell staff={staff} current="corrections" width="prose">
      <BackLink />
      <h1 className="mt-4 text-title">Not waiting for a correction</h1>
      <p className="mt-6 flex gap-3 rounded-xl bg-mist p-4">
        <AlertIcon className="mt-1 text-brand" />
        <span>
          This registration isn&apos;t waiting for a correction. Someone may have corrected it
          already, or an administrator decided on it.
        </span>
      </p>
    </StaffShell>
  );
}

function BackLink() {
  return (
    <Link
      href="/corrections"
      className="inline-flex min-h-11 items-center gap-2 text-small text-ink-muted hover:text-ink"
    >
      <ArrowIcon className="rotate-180" />
      Corrections
    </Link>
  );
}
