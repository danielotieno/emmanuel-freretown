import type { MembershipOverview } from "@/modules/membership";
import type { RegistrationOverview } from "@/modules/registration";

/*
 * The overview's two charts, drawn on the server in plain boxes: no chart library and no script.
 * Every figure is written beside its mark, and each chart has a table for screen readers.
 */

export const NUMBER = new Intl.NumberFormat("en-KE");

const WEEKDAY = new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "UTC" });
const DAY_LONG = new Intl.DateTimeFormat("en-GB", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

/** `day` is a calendar date (yyyy-mm-dd) already in Africa/Nairobi: read it as UTC, never shift it. */
function dateOf(day: string): Date {
  return new Date(`${day}T00:00:00Z`);
}

/**
 * Registrations received on each of the last 14 days: one pill per day, self-registration in
 * Black below, the desk in Signal Blue above, the day's total over it.
 */
export function DailyBars({ daily }: { daily: RegistrationOverview["daily"] }) {
  const max = Math.max(1, ...daily.map((d) => d.self + d.assisted));
  return (
    <figure className="m-0">
      <div aria-hidden="true" className="flex h-52 items-stretch gap-1.5 sm:gap-2.5">
        {daily.map((d, index) => {
          const total = d.self + d.assisted;
          const today = index === daily.length - 1;
          const date = dateOf(d.day);
          return (
            <div key={d.day} className="flex min-w-0 flex-1 flex-col items-center gap-2">
              <div className="flex w-full flex-1 flex-col items-center justify-end gap-1.5">
                <span className="text-xs leading-none text-ink tabular-nums">
                  {total > 0 ? NUMBER.format(total) : ""}
                </span>
                <div
                  className="flex w-full max-w-9 flex-col gap-0.5 overflow-hidden rounded-full"
                  style={{
                    height: total > 0 ? `max(0.75rem, ${(total / max) * 82}%)` : "0.375rem",
                  }}
                >
                  {total === 0 && <span className="flex-1 bg-line" />}
                  {d.assisted > 0 && <span className="bg-brand" style={{ flexGrow: d.assisted }} />}
                  {d.self > 0 && <span className="bg-night" style={{ flexGrow: d.self }} />}
                </div>
              </div>
              <span
                className={`flex flex-col items-center text-xs leading-tight tabular-nums ${
                  today ? "font-medium text-ink" : "text-ink-muted"
                }`}
              >
                <span className="hidden sm:block">{WEEKDAY.format(date)}</span>
                <span>{date.getUTCDate()}</span>
              </span>
            </div>
          );
        })}
      </div>
      {/* In a box: a table itself never shrinks to the 1px that hides it. */}
      <div className="sr-only">
        <table>
          <caption>Registrations received on each of the last {daily.length} days</caption>
          <thead>
            <tr>
              <th scope="col">Day</th>
              <th scope="col">Self-registration</th>
              <th scope="col">At the desk</th>
            </tr>
          </thead>
          <tbody>
            {daily.map((d) => (
              <tr key={d.day}>
                <th scope="row">{DAY_LONG.format(dateOf(d.day))}</th>
                <td>{d.self}</td>
                <td>{d.assisted}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}

/** What the two colours in `DailyBars` mean, in words. */
export function DailyLegend({ self, assisted }: { self: number; assisted: number }) {
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-ink-muted">
      <li className="flex items-center gap-2">
        <span aria-hidden="true" className="size-2.5 rounded-full bg-night" />
        Self-registration
        <span className="text-ink tabular-nums">{NUMBER.format(self)}</span>
      </li>
      <li className="flex items-center gap-2">
        <span aria-hidden="true" className="size-2.5 rounded-full bg-brand" />
        At the desk
        <span className="text-ink tabular-nums">{NUMBER.format(assisted)}</span>
      </li>
    </ul>
  );
}

/** Active members in each HBC, the largest first: a name, a bar and the count. */
export function HbcBars({ byHbc }: { byHbc: MembershipOverview["byHbc"] }) {
  const max = Math.max(1, ...byHbc.map((h) => h.active));
  return (
    <ul className="grid grid-cols-[minmax(0,auto)_minmax(3rem,1fr)_auto] items-center gap-x-4 gap-y-3 text-sm">
      {byHbc.map((h) => (
        <li key={h.hbcId} className="col-span-3 grid grid-cols-subgrid items-center">
          <span className="truncate">{h.name}</span>
          <span aria-hidden="true" className="h-2 overflow-hidden rounded-full bg-line">
            <span
              className="block h-full rounded-full bg-night"
              style={{ width: `${(h.active / max) * 100}%` }}
            />
          </span>
          <span className="text-right tabular-nums">{NUMBER.format(h.active)}</span>
        </li>
      ))}
    </ul>
  );
}
