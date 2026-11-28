import {
  ClipboardCheck,
  FileUp,
  Hash,
  LayoutDashboard,
  Network,
  PenLine,
  ScrollText,
  ShieldCheck,
  UserRoundPlus,
  Users,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Crest } from "@/components/site-header";
import { cn } from "@/lib/utils";
import type { Staff } from "@/modules/access";
import { m } from "@/paraglide/messages";
import { AccountMenu } from "./account-menu";
import { ROLE_NAMES } from "./role-names";
import { rolesOf } from "./roles";

/** The staff portal's sections, as the navigation names them. */
export type StaffSection =
  | "overview"
  | "desk"
  | "review"
  | "corrections"
  | "members"
  | "import"
  | "fwo"
  | "units"
  | "audit"
  | "staff";

interface NavItem {
  section: StaffSection;
  href: string;
  label: string;
  icon: LucideIcon;
  /** A full page load, not a client-side navigation: the desk's Turnstile needs it (src/lib/csp.ts). */
  plain?: boolean;
}

const WIDTHS = {
  wide: "max-w-content",
  prose: "max-w-prose",
  form: "max-w-form",
} as const;

/**
 * The frame around every signed-in staff page (DESIGN.md §8): the navigation, who is signed in,
 * and the page itself. From `md` the navigation is a Cloud panel down the left side; below it,
 * the same links sit in one row under the parish name that scrolls sideways, so nothing hides
 * behind a menu button.
 *
 * It shows only the links a staff member's roles open, and that is all it does: each page calls
 * `requireStaff` with its role before rendering this (CLAUDE.md rule 1).
 */
export function StaffShell({
  staff,
  current,
  width = "wide",
  lang,
  children,
}: {
  staff: Pick<Staff, "name" | "grants">;
  /** The section this page belongs to, marked as the current one in the navigation. */
  current: StaffSection;
  /** How wide the page's content may grow: lists and the overview are wide, forms narrow. */
  width?: keyof typeof WIDTHS;
  /** The officer desk speaks the member's language (NFR-5). */
  lang?: string;
  children: ReactNode;
}) {
  const { officer, reviewer, superAdmin } = rolesOf(staff);
  const groups: { label: string; items: (NavItem | false)[] }[] = [
    {
      label: "Registrations",
      items: [
        { section: "overview", href: "/", label: "Overview", icon: LayoutDashboard },
        officer && {
          section: "desk",
          href: "/desk",
          label: "Registration desk",
          icon: UserRoundPlus,
          plain: true,
        },
        reviewer && {
          section: "review",
          href: "/review",
          label: "Review queue",
          icon: ClipboardCheck,
        },
        (officer || reviewer) && {
          section: "corrections",
          href: "/corrections",
          label: "Corrections",
          icon: PenLine,
        },
      ],
    },
    {
      label: "Membership",
      items: [
        reviewer && { section: "members", href: "/members", label: "Members", icon: Users },
        reviewer && {
          section: "import",
          href: "/members/import",
          label: "Import the parish list",
          icon: FileUp,
        },
        reviewer && { section: "fwo", href: "/fwo", label: "FWO numbers", icon: Hash },
        reviewer && {
          section: "units",
          href: "/units",
          label: "HBCs and departments",
          icon: Network,
        },
      ],
    },
    {
      label: "Administration",
      items: [
        superAdmin && { section: "audit", href: "/audit", label: "Audit log", icon: ScrollText },
        superAdmin && {
          section: "staff",
          href: "/staff",
          label: "Staff accounts",
          icon: ShieldCheck,
        },
      ],
    },
  ];
  const roles = [...new Set(staff.grants.map((g) => ROLE_NAMES[g.role]))];

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[17.5rem_minmax(0,1fr)]">
      <div className="md:p-3 md:pr-0">
        <aside className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 bg-cloud px-4 pt-3 md:sticky md:top-3 md:flex md:h-[calc(100dvh-1.5rem)] md:flex-col md:items-stretch md:rounded-3xl md:p-3">
          <Link
            href="/"
            className="flex min-h-12 min-w-0 items-center gap-3 text-ink no-underline md:px-2 md:pt-2 md:pb-4"
          >
            <Crest className="h-9 w-auto shrink-0" />
            <span className="min-w-0 leading-tight">
              <span className="block font-display text-xl leading-none">
                {m.site_name_short({}, { locale: "en" })}
              </span>
              <span className="mt-1 block truncate text-xs text-ink-muted">Staff portal</span>
            </span>
          </Link>
          <nav
            aria-label="Staff"
            className="staff-nav order-last col-span-2 -mx-4 overflow-x-auto px-4 pt-2 pb-3 md:order-none md:mx-0 md:flex-1 md:overflow-x-visible md:overflow-y-auto md:p-0"
          >
            <ul className="flex w-max gap-1 md:w-auto md:flex-col md:gap-0.5">
              {groups.map((group) => {
                const items = group.items.filter((item) => item !== false);
                if (items.length === 0) return null;
                return (
                  <li key={group.label} className="contents md:block md:pt-4 md:first:pt-0">
                    <p className="hidden px-3 pb-1.5 text-xs text-ink-muted md:block">
                      {group.label}
                    </p>
                    <ul className="contents md:block md:space-y-0.5">
                      {items.map((item) => (
                        <li key={item.section}>
                          <NavLink item={item} current={item.section === current} />
                        </li>
                      ))}
                    </ul>
                  </li>
                );
              })}
            </ul>
          </nav>
          <div className="md:border-t md:border-line md:pt-2">
            <AccountMenu name={staff.name} roles={roles} />
          </div>
        </aside>
      </div>
      <main id="main" lang={lang} className="px-4 pt-6 pb-16 sm:px-6 md:px-10 md:pt-10">
        <div className={cn("mx-auto md:mx-0", WIDTHS[width])}>{children}</div>
      </main>
    </div>
  );
}

function NavLink({ item, current }: { item: NavItem; current: boolean }) {
  const Icon = item.icon;
  const className = cn(
    "flex min-h-11 items-center gap-3 rounded-full px-4 text-sm whitespace-nowrap no-underline transition-colors md:rounded-xl md:px-3",
    current
      ? "on-dark bg-night font-medium text-paper"
      : "text-ink-muted hover:bg-paper hover:text-ink",
  );
  const content = (
    <>
      <Icon aria-hidden="true" strokeWidth={1.75} className="size-[1.125rem] shrink-0" />
      {item.label}
    </>
  );
  const currentPage = current ? ("page" as const) : undefined;
  return item.plain ? (
    <a href={item.href} aria-current={currentPage} className={className}>
      {content}
    </a>
  ) : (
    <Link href={item.href} aria-current={currentPage} className={className}>
      {content}
    </Link>
  );
}

/**
 * A staff page's opening: its title, a line about it, and its main action at the far side.
 * The title is the page's one serif line.
 */
export function PageHeader({
  title,
  children,
  action,
}: {
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
      <div className="min-w-0">
        <h1 className="text-title">{title}</h1>
        {children && <p className="mt-2 max-w-prose text-ink-muted">{children}</p>}
      </div>
      {action}
    </header>
  );
}
