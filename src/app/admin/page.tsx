import {
  ArrowRight,
  CircleCheck,
  MessageSquareText,
  PenLine,
  Users,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { getDb } from "@/app/_lib/db";
import { requireStaff } from "@/app/_lib/staff";
import { BellIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { membershipOverview } from "@/modules/membership";
import { smsUsageToday } from "@/modules/notifications";
import { unitNames } from "@/modules/organisation";
import {
  deskOverview,
  listCorrections,
  listReviewQueue,
  registrationOverview,
  type QueueItem,
} from "@/modules/registration";
import { DailyBars, DailyLegend, HbcBars, NUMBER } from "./_components/overview-charts";
import { ROLE_NAMES } from "./_components/role-names";
import { rolesOf } from "./_components/roles";
import { StaffShell } from "./_components/staff-shell";
import { formatDateTime } from "./review/format";

/** How many of the queue's oldest registrations the overview shows. */
const QUEUE_PREVIEW = 5;

const TODAY = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Africa/Nairobi",
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});
const HOUR = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Africa/Nairobi",
  hour: "numeric",
  hourCycle: "h23",
});

function greeting(now: Date): string {
  const hour = Number(HOUR.format(now));
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

/** How long ago, in the largest whole unit: "3 days", "5 hours", "less than an hour". */
function waited(since: Date, now: Date): string {
  const hours = Math.floor((now.getTime() - since.getTime()) / 3_600_000);
  if (hours < 1) return "less than an hour";
  if (hours < 24) return hours === 1 ? "1 hour" : `${hours} hours`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "1 day" : `${days} days`;
}

/**
 * The staff portal's overview: what needs doing first, then the figures behind it. Any staff
 * member with an active role may open it; what it shows depends on the role. Administrators see
 * the queue, the registrations coming in and the membership; a Registration Officer sees their
 * own desk and what waits for a correction. The role is read here, before any figure is asked
 * for (CLAUDE.md rule 1), and the figures are counts: only the queue's next few rows name people,
 * as the review queue itself does (viewing a list is not recorded, D31).
 */
export default async function StaffOverview() {
  const staff = await requireStaff(null);
  const { officer, reviewer } = rolesOf(staff);
  const roles = [...new Set(staff.grants.map((g) => ROLE_NAMES[g.role]))];
  const now = new Date();
  const first = staff.name.trim().split(/\s+/)[0];

  return (
    <StaffShell staff={staff} current="overview">
      <header>
        <h1 className="text-title">
          {greeting(now)}
          {first ? `, ${first}` : ""}
        </h1>
        <p className="mt-2 text-ink-muted">
          {TODAY.format(now)} · {roles.join(", ")}
        </p>
      </header>
      {reviewer && <AdministratorOverview now={now} />}
      {officer && <OfficerOverview userId={staff.userId} alone={!reviewer} />}
    </StaffShell>
  );
}

/** For Membership Administrators and Super Administrators. */
async function AdministratorOverview({ now }: { now: Date }) {
  const db = await getDb();
  const [registrations, members, sms, queue, units] = await Promise.all([
    registrationOverview(db),
    membershipOverview(db),
    smsUsageToday(db),
    listReviewQueue(db, {}, QUEUE_PREVIEW),
    unitNames(db),
  ]);
  const self = registrations.daily.reduce((sum, d) => sum + d.self, 0);
  const assisted = registrations.daily.reduce((sum, d) => sum + d.assisted, 0);
  const flags = [
    [registrations.fwoConflicts, "share an FWO number", "shares an FWO number"],
    [registrations.phoneConflicts, "share a phone", "shares a phone"],
    [registrations.newMembers, "new members", "new member"],
  ] as const;
  const smsShare = sms.cap > 0 ? sms.sent / sms.cap : 1;

  return (
    <div className="mt-8 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-12">
      <Card tone="night" className="col-span-2 justify-between gap-8 p-7 lg:col-span-5">
        <CardHeader>
          <CardTitle className="text-paper">Waiting for review</CardTitle>
          <BellIcon className="size-6 text-gold" />
        </CardHeader>
        <CardContent>
          <p className="font-display text-[5.5rem] leading-none tracking-[-0.03em] tabular-nums">
            {NUMBER.format(registrations.waiting)}
          </p>
          <p className="mt-3 text-sky">
            {registrations.oldestWaitingAt
              ? `The oldest has waited ${waited(registrations.oldestWaitingAt, now)}.`
              : "The queue is clear. New registrations will show here."}
          </p>
          {flags.some(([n]) => n > 0) && (
            <ul className="mt-5 flex flex-wrap gap-2">
              {flags.map(
                ([n, many, one]) =>
                  n > 0 && (
                    <li key={many}>
                      <Badge variant="onDark">
                        {NUMBER.format(n)} {n === 1 ? one : many}
                      </Badge>
                    </li>
                  ),
              )}
            </ul>
          )}
        </CardContent>
        {registrations.waiting > 0 && (
          <Link href="/review" prefetch={false} className="btn-on-dark self-start">
            Start reviewing
            <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        )}
      </Card>

      <Card className="col-span-2 lg:col-span-7">
        <CardHeader>
          <div>
            <CardTitle>Registrations received</CardTitle>
            <CardDescription className="mt-1">
              {self + assisted === 0
                ? "None in the last 14 days."
                : `${NUMBER.format(self + assisted)} in the last 14 days.`}
            </CardDescription>
          </div>
          <DailyLegend self={self} assisted={assisted} />
        </CardHeader>
        <CardContent>
          <DailyBars daily={registrations.daily} />
        </CardContent>
      </Card>

      <Stat
        icon={Users}
        label="Active members"
        value={NUMBER.format(members.active)}
        className="lg:col-span-3"
      >
        {members.joinedThisWeek > 0
          ? `${NUMBER.format(members.joinedThisWeek)} added in the last 7 days`
          : "None added in the last 7 days"}
      </Stat>
      <Stat
        icon={CircleCheck}
        label="Approved in the last 7 days"
        value={NUMBER.format(registrations.approvedThisWeek)}
        className="lg:col-span-3"
      >
        {registrations.rejectedThisWeek === 0
          ? "None rejected"
          : `${NUMBER.format(registrations.rejectedThisWeek)} rejected`}
      </Stat>
      <Stat
        icon={PenLine}
        label="Sent back to correct"
        value={NUMBER.format(registrations.toCorrect)}
        className="lg:col-span-3"
      >
        {registrations.toCorrect === 0 ? "Nothing waits on a member" : "Waiting on the member"}
      </Stat>
      <Stat
        icon={MessageSquareText}
        label="SMS sent today"
        value={NUMBER.format(sms.sent)}
        className="lg:col-span-3"
      >
        <span className="block">
          {smsShare >= 1
            ? `The daily cap of ${NUMBER.format(sms.cap)} is reached: sending is paused`
            : smsShare >= 0.8
              ? `Close to the daily cap of ${NUMBER.format(sms.cap)}`
              : `of ${NUMBER.format(sms.cap)} allowed a day`}
        </span>
        <span aria-hidden="true" className="mt-3 block h-1.5 overflow-hidden rounded-full bg-line">
          <span
            className={`block h-full rounded-full ${smsShare >= 0.8 ? "bg-error" : "bg-night"}`}
            style={{ width: `${Math.min(1, smsShare) * 100}%` }}
          />
        </span>
      </Stat>

      <Card tone="paper" className="col-span-2 lg:col-span-7">
        <CardHeader>
          <div>
            <CardTitle>Next in the queue</CardTitle>
            <CardDescription className="mt-1">
              {queue.total === 0
                ? "Nothing is waiting for a decision."
                : queue.total > queue.items.length
                  ? `The ${queue.items.length} waiting longest of ${NUMBER.format(queue.total)}.`
                  : "Waiting longest first."}
            </CardDescription>
          </div>
          {queue.total > queue.items.length && (
            <Link href="/review" prefetch={false} className="btn-text min-h-11 text-sm">
              See all {NUMBER.format(queue.total)}
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          )}
        </CardHeader>
        <CardContent>
          {queue.items.length === 0 ? (
            <Empty>
              When a member registers, online or at the desk, the registration appears here for a
              decision.
            </Empty>
          ) : (
            <QueueTable items={queue.items} hbcs={units.hbcs} />
          )}
        </CardContent>
      </Card>

      <Card className="col-span-2 lg:col-span-5">
        <CardHeader>
          <div>
            <CardTitle>Members by HBC</CardTitle>
            <CardDescription className="mt-1">
              Active members.
              {members.withoutPhone > 0 &&
                ` ${NUMBER.format(members.withoutPhone)} have no personal phone.`}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {members.active === 0 ? (
            <Empty>
              No members yet. Approve a registration or import the parish list to begin.
            </Empty>
          ) : (
            <HbcBars byHbc={members.byHbc} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/** For Registration Officers: their own desk, and what waits for a correction. */
async function OfficerOverview({ userId, alone }: { userId: string; alone: boolean }) {
  const db = await getDb();
  const [desk, corrections] = await Promise.all([
    deskOverview(db, userId),
    // An administrator already has the corrections count above.
    alone ? listCorrections(db, QUEUE_PREVIEW) : null,
  ]);

  return (
    <div
      className={`grid grid-cols-[minmax(0,1fr)] gap-3 sm:gap-4 lg:grid-cols-12 ${alone ? "mt-8" : "mt-3 sm:mt-4"}`}
    >
      <Card
        tone={alone ? "night" : "cloud"}
        className={`justify-between gap-8 p-7 ${alone ? "lg:col-span-5" : "lg:col-span-12 lg:flex-row lg:items-end"}`}
      >
        <div>
          <CardTitle className={alone ? "text-paper" : undefined}>
            Registered by you at the desk today
          </CardTitle>
          <p
            className={`mt-5 font-display leading-none tracking-[-0.03em] tabular-nums ${
              alone ? "text-[5.5rem]" : "text-5xl"
            }`}
          >
            {NUMBER.format(desk.capturedToday)}
          </p>
          <p className={`mt-3 ${alone ? "text-sky" : "text-ink-muted"}`}>
            {NUMBER.format(desk.capturedThisWeek)} in the last 7 days.
          </p>
        </div>
        {/* A plain link, never <Link>: the desk's Turnstile needs its own page load
            (src/lib/csp.ts). */}
        <a href="/desk" className={`${alone ? "btn-on-dark" : "btn-dark"} self-start lg:self-auto`}>
          Register a member
          <ArrowRight aria-hidden="true" className="size-4" />
        </a>
      </Card>

      {corrections && (
        <Card tone="paper" className="lg:col-span-7">
          <CardHeader>
            <div>
              <CardTitle>Sent back to correct</CardTitle>
              <CardDescription className="mt-1">
                {corrections.total === 0
                  ? "Nothing is waiting for a correction."
                  : `${NUMBER.format(corrections.total)} to correct with the member, who was asked by SMS to contact the office.`}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {corrections.items.length === 0 ? (
              <Empty>
                When an administrator asks for a correction, the registration appears here for you
                to fix with the member.
              </Empty>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Reference</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Asked</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {corrections.items.map((item) => (
                    <TableRow key={item.id} className="hover:bg-cloud">
                      <TableCell className="whitespace-nowrap">
                        <Link
                          href={`/corrections/${item.id}`}
                          prefetch={false}
                          className="tabular-nums"
                        >
                          {item.reference}
                        </Link>
                      </TableCell>
                      <TableCell>{item.fullName}</TableCell>
                      <TableCell className="whitespace-nowrap text-ink-muted">
                        {formatDateTime(item.requestedAt)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function QueueTable({ items, hbcs }: { items: QueueItem[]; hbcs: Map<string, string> }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Reference</TableHead>
          <TableHead>Name</TableHead>
          <TableHead>HBC</TableHead>
          <TableHead>Received</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => (
          <TableRow key={item.id} className="hover:bg-cloud">
            <TableCell className="whitespace-nowrap">
              <Link href={`/review/${item.id}`} prefetch={false} className="tabular-nums">
                {item.reference}
              </Link>
            </TableCell>
            <TableCell>
              <span className="block">{item.fullName}</span>
              {(item.fwoConflict || item.phoneConflict || item.isNewMember) && (
                <span className="mt-1 flex flex-wrap gap-1">
                  {item.fwoConflict && <Badge variant="flag">FWO shared</Badge>}
                  {item.phoneConflict && <Badge variant="flag">Phone shared</Badge>}
                  {item.isNewMember && <Badge variant="flag">New member</Badge>}
                </span>
              )}
            </TableCell>
            <TableCell className="text-ink-muted">
              {item.hbcId ? hbcs.get(item.hbcId) : "To be set"}
            </TableCell>
            <TableCell className="whitespace-nowrap text-ink-muted">
              {formatDateTime(item.submittedAt)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/** One figure: what it counts, the count in the title face, and a line that puts it in context. */
function Stat(props: {
  icon: LucideIcon;
  label: string;
  value: string;
  className?: string;
  children: ReactNode;
}) {
  const Icon = props.icon;
  return (
    <Card className={`gap-4 p-5 sm:p-6 ${props.className ?? ""}`}>
      <CardHeader className="flex-nowrap items-start">
        <CardTitle className="text-sm font-normal text-ink-muted">{props.label}</CardTitle>
        <span
          aria-hidden="true"
          className="-mt-1 flex size-9 shrink-0 items-center justify-center rounded-full bg-paper text-ink"
        >
          <Icon strokeWidth={1.75} className="size-[1.125rem]" />
        </span>
      </CardHeader>
      <CardContent>
        <p className="font-display text-[2.75rem] leading-none tracking-[-0.02em] tabular-nums sm:text-5xl">
          {props.value}
        </p>
        <div className="mt-3 text-sm text-ink-muted">{props.children}</div>
      </CardContent>
    </Card>
  );
}

/** An empty list says what will fill it. */
function Empty({ children }: { children: ReactNode }) {
  return <p className="max-w-prose py-2 text-sm text-ink-muted">{children}</p>;
}
