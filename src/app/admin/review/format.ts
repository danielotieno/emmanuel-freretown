/** Dates on staff screens: stored in UTC, shown in Africa/Nairobi (database-design.md §1). */
const DATE_TIME = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Africa/Nairobi",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatDateTime(at: Date | string): string {
  return DATE_TIME.format(typeof at === "string" ? new Date(at) : at);
}
