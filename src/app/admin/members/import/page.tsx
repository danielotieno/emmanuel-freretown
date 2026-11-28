import type { Metadata } from "next";
import { requireStaff } from "@/app/_lib/staff";
import { DEPARTMENT_SEPARATOR, IMPORT_COLUMNS } from "@/modules/membership";
import { ImportForm } from "./import-form";
import { StaffShell } from "../../_components/staff-shell";

export const metadata: Metadata = { title: "Import the parish list · Staff" };

/**
 * Import of the parish list (FR-13, D47, #104), for Membership Administrators and Super
 * Administrators. The action checks the role again: this page is not the security boundary.
 */
export default async function ImportPage() {
  const staff = await requireStaff("MEMBERSHIP_ADMIN");
  const header = [...IMPORT_COLUMNS.required, ...IMPORT_COLUMNS.optional].join(",");
  return (
    <StaffShell staff={staff} current="import">
      <h1 className="text-title">Import the parish list</h1>
      <div className="mt-4 max-w-[68ch] space-y-4">
        <p className="text-ink-muted">
          Each valid row becomes a registered member, without a registration to approve (D47). Rows
          that break a rule are skipped and listed by row number; nothing is guessed. The file is
          read, not kept. Members get no SMS.
        </p>
        <section
          aria-labelledby="before-heading"
          className="rounded-2xl border border-line bg-paper p-5 sm:p-6"
        >
          <h2 id="before-heading" className="text-subtitle">
            Before you import
          </h2>
          <ul className="mt-3 list-disc space-y-2 pl-5">
            <li>
              The Vicar has recorded in the DPIA how the members consented to storage outside Kenya,
              and members have been told at services that the list is going into the register (D47).
            </li>
            <li>The first row holds these column headings, in any order:</li>
          </ul>
          <pre className="mt-3 rounded-xl bg-cloud p-3 text-small break-all whitespace-pre-wrap">
            {header}
          </pre>
          <ul className="mt-3 list-disc space-y-2 pl-5">
            <li>
              <strong>fwo_number</strong>: digits only. Leading zeros don&rsquo;t count: 0042 is
              read as 42 (D61).
            </li>
            <li>
              <strong>phone</strong>: a Kenyan mobile number, or empty when the member has no phone
              of their own. Format it as Text too.
            </li>
            <li>
              <strong>hbc</strong> and <strong>departments</strong>: names as they appear in the
              register. Separate several departments with a semicolon ({DEPARTMENT_SEPARATOR}).
              Departments may be empty.
            </li>
            <li>
              <strong>language</strong>: en or sw for the member&apos;s SMS; empty means English.
            </li>
            <li>
              In Excel, choose File › Save As › <strong>CSV UTF-8 (Comma delimited)</strong>.
            </li>
          </ul>
        </section>
      </div>
      <div className="max-w-[68ch]">
        <ImportForm />
      </div>
    </StaffShell>
  );
}
