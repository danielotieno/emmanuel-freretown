import type { Metadata } from "next";
import { getDb } from "@/app/_lib/db";
import { requireStaff } from "@/app/_lib/staff";
import { AlertIcon, CheckIcon } from "@/components/icons";
import {
  listUnits,
  UNIT_KINDS,
  type UnitChangeRefusal,
  type UnitKind,
  type UnitRow,
} from "@/modules/organisation";
import { moveUnitAction, setUnitActiveAction } from "./actions";
import { KIND_NAMES, refusalMessage } from "./messages";
import { NameForm } from "./name-form";
import { StaffShell } from "../_components/staff-shell";

export const metadata: Metadata = { title: "HBCs and departments · Staff" };

const DONE_MESSAGES: Record<string, string> = {
  added: "Added. It can be chosen on registrations now.",
  renamed: "Renamed. Every registration and member in it shows the new name.",
  moved: "Moved. Forms list them in this order.",
  deactivated:
    "Deactivated. It can't be chosen any more; members already in it keep it. Registrations waiting for review that chose it can't be approved until they're corrected: reactivate it to undo.",
  activated: "Reactivated. It can be chosen on registrations again.",
};

const REFUSALS: readonly UnitChangeRefusal[] = [
  "not_found",
  "unchanged",
  "name_taken",
  "last_active_hbc",
];

type Search = Record<string, string | string[] | undefined>;

/**
 * HBCs and departments (FR-9, #23), for Membership Administrators and Super Administrators:
 * add, rename, reorder, deactivate and reactivate. Nothing is ever deleted. Viewing the list is
 * not recorded (D31); every change is audited by the organisation module.
 */
export default async function UnitsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const staff = await requireStaff("MEMBERSHIP_ADMIN");
  const search = await searchParams;
  const db = await getDb();
  const [hbcs, departments] = await Promise.all([
    listUnits(db, "hbc"),
    listUnits(db, "department"),
  ]);
  const done = typeof search.done === "string" ? DONE_MESSAGES[search.done] : undefined;
  const refusedKind = (UNIT_KINDS as readonly unknown[]).includes(search.kind)
    ? (search.kind as UnitKind)
    : "hbc";
  const refused = (REFUSALS as readonly unknown[]).includes(search.refused)
    ? refusalMessage(search.refused as UnitChangeRefusal, refusedKind)
    : undefined;

  return (
    <StaffShell staff={staff} current="units" width="prose">
      <h1 className="text-title">HBCs and departments</h1>
      <p className="mt-2 text-ink-muted">
        The units members choose on registration forms, in the order shown here. A unit is never
        deleted: deactivate it, and it can no longer be chosen, while members and registrations
        already in it keep it, but a registration waiting for review that chose it can&rsquo;t be
        approved until it is corrected. Every change is recorded in the audit log. The
        homepage&rsquo;s list of HBCs updates within six hours.
      </p>

      {done && (
        <p role="status" className="mt-6 flex gap-3 rounded-xl bg-mist p-4">
          <CheckIcon size="size-5" />
          <span>{done}</span>
        </p>
      )}
      {refused && (
        <p
          role="alert"
          className="mt-6 flex gap-3 rounded-xl border border-error/40 bg-error/5 p-4 text-error"
        >
          <AlertIcon className="mt-1" />
          <span>{refused}</span>
        </p>
      )}

      <UnitSection kind="hbc" units={hbcs} />
      <UnitSection kind="department" units={departments} />
    </StaffShell>
  );
}

function UnitSection({ kind, units }: { kind: UnitKind; units: UnitRow[] }) {
  const { one, many } = KIND_NAMES[kind];
  return (
    <section id={kind} aria-labelledby={`${kind}-heading`} className="mt-12 scroll-mt-8">
      <h2 id={`${kind}-heading`} className="text-subtitle">
        {many}
      </h2>
      <ol className="in-card mt-3 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-paper text-card">
        {units.map((unit, i) => (
          <li key={unit.id} className="space-y-2 px-5 py-4">
            <p className={unit.isActive ? "" : "text-ink-muted"}>
              {unit.name}
              {!unit.isActive && <span> · Inactive</span>}
            </p>
            <div className="-ml-2 flex flex-wrap items-center gap-x-2">
              <Button
                kind={kind}
                unit={unit}
                action={moveUnitAction}
                name="direction"
                value="up"
                disabled={i === 0}
              >
                Move up
              </Button>
              <Button
                kind={kind}
                unit={unit}
                action={moveUnitAction}
                name="direction"
                value="down"
                disabled={i === units.length - 1}
              >
                Move down
              </Button>
              <Button
                kind={kind}
                unit={unit}
                action={setUnitActiveAction}
                name="active"
                value={String(!unit.isActive)}
              >
                {unit.isActive ? "Deactivate" : "Reactivate"}
              </Button>
              {/* In the same line as the buttons; open, it takes the full width below them. */}
              <details className="open:basis-full">
                <summary className="btn-text cursor-pointer list-none">
                  Rename<span className="sr-only"> {unit.name}</span>
                </summary>
                <div className="pt-2 pb-2">
                  <NameForm kind={kind} unit={unit} label="New name" submit="Rename" />
                </div>
              </details>
            </div>
          </li>
        ))}
      </ol>
      <div className="in-card mt-4 rounded-2xl border border-line bg-paper p-5 text-card">
        <NameForm kind={kind} label={`Add a new ${one}`} submit="Add" />
      </div>
    </section>
  );
}

/** One change to one unit, as a button posting to its server action. */
function Button(props: {
  kind: UnitKind;
  unit: UnitRow;
  action: (form: FormData) => Promise<void>;
  name: string;
  value: string;
  disabled?: boolean;
  children: string;
}) {
  return (
    <form action={props.action}>
      <input type="hidden" name="kind" value={props.kind} />
      <input type="hidden" name="id" value={props.unit.id} />
      <input type="hidden" name={props.name} value={props.value} />
      <button type="submit" className="btn-text" disabled={props.disabled}>
        {props.children}
        <span className="sr-only"> {props.unit.name}</span>
      </button>
    </form>
  );
}
