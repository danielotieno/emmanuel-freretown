import { headers } from "next/headers";
import { getDb } from "@/app/_lib/db";
import { cachedJson, defaultEdgeCache } from "@/app/_lib/edge-cache";
import { getLocale } from "@/app/_lib/i18n";
import { getLogger } from "@/app/_lib/log";
import { PendingLink } from "@/components/pending-link";
import { SiteHeader } from "@/components/site-header";
import { CHURCH_OFFICE } from "@/lib/church-office";
import { listActiveHbcs } from "@/modules/organisation";
import { m } from "@/paraglide/messages";
import church1440 from "./images/church-1440.webp";
import church640 from "./images/church-640.webp";
import church960 from "./images/church-960.webp";

/**
 * The homepage (#28): who we are, when we worship, our ministries and HBCs, how to find us, and
 * the way into registration. Content from the church's earlier site, without clergy, sermons or
 * named people. The theme of the year is in the messages (`home_theme_*`): update it each year.
 */
export default async function HomePage() {
  const locale = await getLocale();
  const o = { locale };
  // The HBC names come from Cloudflare's cache when it has them, so most views don't touch the
  // database (#88). The page never fails or waits long because the list can't load: after
  // HBC_TIMEOUT_MS it renders the section without names, and nothing is cached.
  const hbcs = await cachedJson(defaultEdgeCache(), await hbcCacheKey(), HBC_CACHE_SECONDS, () =>
    withTimeout(
      getDb().then((db) => listActiveHbcs(db)),
      HBC_TIMEOUT_MS,
    ),
  ).catch(async (error: unknown) => {
    (await getLogger()).error("home.hbcs_failed", error);
    return [];
  });

  const services = [
    [m.home_time_english1({}, o), m.home_service_english1({}, o)],
    [m.home_time_english2({}, o), m.home_service_english2({}, o)],
    [m.home_time_kiswahili({}, o), m.home_service_kiswahili({}, o)],
    [m.home_time_revival({}, o), m.home_service_revival({}, o)],
  ] as const;
  const week = [
    [m.home_day_mon({}, o), m.home_time_mon_tue({}, o), m.home_week_mon({}, o)],
    [m.home_day_tue({}, o), m.home_time_mon_tue({}, o), m.home_week_tue({}, o)],
    [m.home_day_wed({}, o), m.home_time_wed_fri({}, o), m.home_week_wed({}, o)],
    [m.home_day_thu({}, o), m.home_time_wed_fri({}, o), m.home_week_thu({}, o)],
    [m.home_day_fri({}, o), m.home_time_wed_fri({}, o), m.home_week_fri({}, o)],
    [m.home_day_sat({}, o), m.home_time_sat({}, o), m.home_week_sat({}, o)],
  ] as const;
  const ministries = [
    ["KAMA", m.home_ministry_kama({}, o), m.home_verse_kama({}, o)],
    [m.home_ministry_mu_name({}, o), m.home_ministry_mu({}, o), m.home_verse_mu({}, o)],
    ["KAYO", m.home_ministry_kayo({}, o), m.home_verse_kayo({}, o)],
    [
      m.home_ministry_children_name({}, o),
      m.home_ministry_children({}, o),
      m.home_verse_children({}, o),
    ],
  ] as const;
  const steps = [
    [m.landing_step1_title({}, o), m.landing_step1_body({}, o)],
    [m.landing_step2_title({}, o), m.landing_step2_body({}, o)],
    [m.landing_step3_title({}, o), m.landing_step3_body({}, o)],
  ] as const;

  return (
    <>
      <SiteHeader locale={locale} />
      <main id="main">
        {/* Welcome: one photo, one sentence, one action (#96). On wide screens the welcome sits
            on the photo; on phones it comes first on Midnight and the photo follows, so the
            words are never over a crop. */}
        <div className="mx-auto max-w-content px-4 pt-5 sm:px-6 md:pt-8 lg:px-10">
          <section
            aria-labelledby="welcome-heading"
            className="tile-rise relative flex flex-col overflow-hidden rounded-[1.75rem] bg-night md:min-h-[34rem] lg:min-h-[clamp(36rem,calc(100svh-8rem),44rem)]"
          >
            <div className="on-dark relative z-10 px-6 pt-9 pb-8 sm:px-10 sm:pt-12 md:absolute md:inset-x-0 md:bottom-0 md:p-12 lg:p-16">
              <h1
                id="welcome-heading"
                className="max-w-[14ch] text-display text-paper md:max-w-[16ch]"
              >
                {m.landing_welcome({}, o)}
              </h1>
              <p className="mt-5 max-w-[46ch] text-lead text-sky md:text-paper/90">
                {m.home_lead({}, o)}
              </p>
              <a href="#visit" className="btn-on-dark mt-8 w-full sm:w-auto">
                {m.home_cta_sunday({}, o)}
                <ArrowIcon />
              </a>
            </div>
            <figure className="relative mx-3 mb-3 overflow-hidden rounded-[1.25rem] md:absolute md:inset-0 md:m-0 md:rounded-none">
              {/* One photo, sized per screen (D46): phones always get the small file, whatever
                  their pixel density. A plain <img>: no image optimiser on Cloudflare. */}
              <picture>
                <source media="(max-width: 600px)" srcSet={church640.src} />
                <source media="(max-width: 1100px)" srcSet={church960.src} />
                <img
                  src={church1440.src}
                  width={church1440.width}
                  height={church1440.height}
                  alt={m.home_photo_alt({}, o)}
                  fetchPriority="high"
                  className="photo-settle aspect-[4/3] w-full object-cover sm:aspect-[16/10] md:aspect-auto md:h-full"
                />
              </picture>
              {/* Shade under the welcome so paper text stays readable on the white walls. */}
              <div
                aria-hidden="true"
                className="absolute inset-0 hidden bg-linear-to-t from-night from-15% via-night/80 via-50% to-night/0 to-85% md:block"
              />
              <div
                aria-hidden="true"
                className="absolute inset-0 hidden bg-linear-to-r from-night/85 via-night/40 via-45% to-night/0 to-75% md:block"
              />
            </figure>
          </section>
        </div>

        {/* Services: Sunday, then the week, on one grid: titles in 4 columns, lists in 8. */}
        <section
          id="services"
          aria-labelledby="services-heading"
          className="mx-auto max-w-content scroll-mt-4 px-4 pt-24 sm:px-6 md:pt-36 lg:px-10"
        >
          <div className="grid gap-8 lg:grid-cols-12 lg:gap-8">
            <div className="lg:col-span-4">
              <h2 id="services-heading" className="text-title">
                {m.home_services_title({}, o)}
              </h2>
              <p className="mt-4 max-w-[36ch] text-lead text-ink-muted">
                {m.home_services_intro({}, o)}
              </p>
            </div>
            {/* One grid for every row, so the names line up beside the widest time. A time range
                never breaks inside a time (#96); its size follows the list's width. */}
            <ul className="@container grid border-t border-line md:grid-cols-[auto_1fr] md:gap-x-12 lg:col-span-8">
              {services.map(([time, name]) => (
                <li
                  key={name}
                  className="grid gap-y-1 border-b border-line py-5 md:col-span-2 md:grid-cols-subgrid md:items-baseline md:py-6"
                >
                  <p className="text-[clamp(1.0625rem,5.6cqi,1.5rem)] leading-tight font-medium tracking-[-0.022em] tabular-nums">
                    <TimeRange time={time} />
                  </p>
                  <p className="text-ink-muted">{name}</p>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-20 grid gap-8 md:mt-28 lg:grid-cols-12 lg:gap-8">
            <h3 className="text-subtitle lg:col-span-4">{m.home_week_title({}, o)}</h3>
            <dl className="border-t border-line lg:col-span-8">
              {week.map(([day, time, what]) => (
                <div key={day} className={WEEK_ROW}>
                  <dt className="font-medium">{day}</dt>
                  <dd className="whitespace-nowrap text-brand tabular-nums">{time}</dd>
                  <dd className="text-ink-muted">{what}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* Theme of the year: the year's one big sentence, on its own band */}
        <section
          aria-labelledby="theme-heading"
          className="mx-auto max-w-content px-4 pt-24 sm:px-6 md:pt-36 lg:px-10"
        >
          <div className="on-dark rounded-[2rem] bg-night px-6 py-16 text-center sm:px-12 md:py-24">
            <h2 id="theme-heading" className="mx-auto max-w-[26ch] text-title text-paper">
              <span aria-hidden="true" className="text-gold">
                “
              </span>
              {m.home_theme_title({}, o)}
              <span aria-hidden="true" className="text-gold">
                ”
              </span>
            </h2>
            <p className="mt-6 text-sky">
              <span className="text-paper">{m.home_theme_verse({}, o)}</span>
              <span aria-hidden="true" className="mx-3 text-gold">
                ·
              </span>
              {m.home_theme_label({}, o)}
            </p>
          </div>
        </section>

        {/* About */}
        <section
          id="about"
          aria-labelledby="about-heading"
          className="mx-auto max-w-content scroll-mt-4 px-4 pt-24 sm:px-6 md:pt-36 lg:px-10"
        >
          <div className="grid gap-10 lg:grid-cols-12 lg:gap-8">
            <div className="lg:col-span-7">
              <h2 id="about-heading" className="max-w-[18ch] text-title">
                {m.home_about_title({}, o)}
              </h2>
              <p className="mt-6 max-w-[52ch] text-lead">{m.home_about_p1({}, o)}</p>
              <div className="mt-6 grid max-w-[62ch] gap-4 text-ink-muted lg:max-w-none lg:grid-cols-2 lg:gap-8">
                <p>{m.home_about_p2({}, o)}</p>
                <p>{m.home_about_p3({}, o)}</p>
              </div>
            </div>
            <aside className="on-dark rounded-[1.75rem] bg-night p-7 text-paper sm:p-10 lg:col-span-5 lg:self-end">
              <BellIcon className="h-14 w-auto text-gold" />
              <h3 className="mt-8 text-subtitle text-paper">{m.home_bell_title({}, o)}</h3>
              <p className="mt-3 text-card text-sky">{m.home_bell_body({}, o)}</p>
            </aside>
          </div>
        </section>

        {/* Ministries and HBCs */}
        <section
          id="ministries"
          aria-labelledby="ministries-heading"
          className="mx-auto max-w-content scroll-mt-4 px-4 pt-24 sm:px-6 md:pt-36 lg:px-10"
        >
          <div className="grid gap-4 lg:grid-cols-12 lg:items-end lg:gap-8">
            <h2 id="ministries-heading" className="text-title lg:col-span-7">
              {m.home_ministries_title({}, o)}
            </h2>
            <p className="max-w-[36ch] text-lead text-ink-muted lg:col-span-5">
              {m.home_ministries_intro({}, o)}
            </p>
          </div>
          {/* Four tiles of different widths and colours, so the four fellowships read as four
              distinct groups rather than a list. */}
          <ul className="mt-10 grid gap-3 sm:gap-4 md:grid-cols-2 lg:grid-cols-12">
            {ministries.map(([name, body, verse], i) => {
              const tone = MINISTRY_TONES[i % MINISTRY_TONES.length]!;
              return (
                <li
                  key={name}
                  className={`flex flex-col justify-between gap-8 rounded-[1.75rem] p-7 sm:p-9 md:min-h-[16rem] ${tone.tile}`}
                >
                  <div>
                    <h3 className={`text-subtitle ${tone.heading}`}>{name}</h3>
                    <p className={`mt-3 max-w-[42ch] text-card ${tone.body}`}>{body}</p>
                  </div>
                  <p className={`text-small ${tone.verse}`}>{verse}</p>
                </li>
              );
            })}
          </ul>

          {/* Home Based Cells, from the register's own list */}
          <div className="mt-3 grid gap-8 rounded-[1.75rem] bg-cloud p-7 sm:mt-4 sm:p-10 lg:grid-cols-12 lg:gap-8">
            <div className="lg:col-span-4">
              <h3 className="text-subtitle">{m.home_hbc_title({}, o)}</h3>
              <p className="mt-3 max-w-[48ch] text-card text-ink-muted">
                {m.home_hbc_intro({}, o)}
              </p>
            </div>
            {hbcs.length > 0 && (
              <ul className="grid content-start gap-x-8 text-card sm:grid-cols-[repeat(auto-fill,minmax(12rem,1fr))] lg:col-span-8">
                {hbcs.map((hbc) => (
                  <li
                    key={hbc.id}
                    className="flex min-h-12 items-center border-b border-line whitespace-nowrap text-ink"
                  >
                    {hbc.name}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* Registration */}
        <section
          aria-labelledby="register-heading"
          className="mx-auto max-w-content px-4 pt-24 sm:px-6 md:pt-36 lg:px-10"
        >
          <div className="on-dark grid gap-12 rounded-[2rem] bg-brand p-7 text-paper sm:p-12 lg:grid-cols-12 lg:items-center lg:gap-8 lg:p-16">
            <div className="lg:col-span-5">
              <h2 id="register-heading" className="max-w-[16ch] text-title text-paper">
                {m.home_register_title({}, o)}
              </h2>
              <p className="mt-5 max-w-[42ch] text-lead text-mist">{m.reg_intro({}, o)}</p>
              {/* A plain link, not <Link>: Turnstile's CSP is set per page load (src/lib/csp.ts). */}
              <PendingLink href="/registration" className="btn-on-dark mt-9 w-full sm:w-auto">
                {m.reg_title({}, o)}
                <ArrowIcon />
              </PendingLink>
            </div>
            <ol className="lg:col-span-6 lg:col-start-7">
              {steps.map(([title, body], i) => (
                <li
                  key={title}
                  className="grid grid-cols-[2.5rem_1fr] gap-4 border-t border-paper/25 py-6 last:border-b"
                >
                  <span aria-hidden="true" className="text-subtitle text-paper tabular-nums">
                    {i + 1}
                  </span>
                  <span>
                    <span className="block text-subtitle text-paper">{title}</span>
                    <span className="mt-1 block text-card text-mist">{body}</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Visit */}
        <section
          id="visit"
          aria-labelledby="visit-heading"
          className="mx-auto max-w-content scroll-mt-4 px-4 pt-24 sm:px-6 md:pt-36 lg:px-10"
        >
          <div className="grid gap-10 lg:grid-cols-12 lg:gap-8">
            <div className="lg:col-span-6">
              <h2 id="visit-heading" className="text-title">
                {m.home_visit_title({}, o)}
              </h2>
              <p className="mt-5 max-w-[30ch] text-lead">{m.home_visit_address({}, o)}</p>
              <a
                href="https://www.google.com/maps/search/?api=1&query=ACK+Emmanuel+Kengeleni+Church"
                className="btn-secondary mt-8"
              >
                {m.home_visit_map({}, o)}
                <ArrowIcon />
              </a>
            </div>
            <div className="divide-y divide-line self-end border-y border-line lg:col-span-5 lg:col-start-8">
              <div className="py-6">
                <h3 className="text-subtitle">{m.home_visit_office({}, o)}</h3>
                <ul className="mt-3 space-y-2 text-ink-muted">
                  <li>
                    <a href={CHURCH_OFFICE.phoneHref} className="tabular-nums">
                      {CHURCH_OFFICE.phone}
                    </a>
                  </li>
                  <li>
                    <a href={`mailto:${CHURCH_OFFICE.email}`} className="wrap-anywhere">
                      {CHURCH_OFFICE.email}
                    </a>
                  </li>
                  <li>{m.home_visit_postal({}, o)}</li>
                </ul>
              </div>
              <div className="py-6">
                <h3 className="text-subtitle">{m.home_visit_follow({}, o)}</h3>
                <ul className="mt-3 flex flex-wrap gap-x-8 gap-y-2">
                  <li>
                    <a href="https://www.facebook.com/profile.php?id=100069793723070">
                      {m.home_visit_facebook({}, o)}
                    </a>
                  </li>
                  <li>
                    <a href="https://www.youtube.com/@ACKCONTROLROOM/streams">
                      {m.home_visit_youtube({}, o)}
                    </a>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}

// Long enough for a Neon compute to wake from suspend, short enough that a hung database
// doesn't hold the homepage.
const HBC_TIMEOUT_MS = 5000;

// HBCs change only when an administrator adds or retires one, so a new name can take up to six
// hours to appear on the homepage. The registration form reads the register directly.
const HBC_CACHE_SECONDS = 6 * 60 * 60;

/**
 * The cache key for the active HBC list, on this request's own host, so staging and production
 * (one Cloudflare zone) never share an entry. Bump the version if the cached shape changes, or to
 * refresh the list everywhere at once (docs/operations/environments.md).
 */
async function hbcCacheKey(): Promise<string> {
  // Hostname only, without a port or trailing dot, so odd forms of one host share one entry.
  const host = (await headers()).get("host") ?? "localhost";
  const hostname = new URL(`https://${host}`).hostname.replace(/\.$/, "");
  return `https://${hostname}/_cache/hbcs-active/v1`;
}

/** Rejects if the promise hasn't settled in time. The query itself carries on, unawaited. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(Object.assign(new Error("timeout"), { name: "TimeoutError" })),
      ms,
    );
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** A row of the week: day, time, what happens; one column on phones, three from md. */
const WEEK_ROW =
  "grid gap-1 border-b border-line py-4 md:grid-cols-[9rem_13rem_1fr] md:items-baseline md:gap-6";

/**
 * The ministries' tiles, in order: KAMA on Midnight, Mothers' Union on Signal Blue, KAYO on Mist,
 * Children's Ministry on Cloud. Widths alternate 7/5 and 5/7 on the 12-column grid. Every text
 * colour here meets AA on its tile (DESIGN.md §2).
 */
const MINISTRY_TONES = [
  {
    tile: "on-dark bg-night lg:col-span-7",
    heading: "text-paper",
    body: "text-sky",
    verse: "text-sky",
  },
  {
    tile: "on-dark bg-brand lg:col-span-5",
    heading: "text-paper",
    body: "text-mist",
    verse: "text-mist",
  },
  {
    tile: "bg-mist lg:col-span-5",
    heading: "text-ink",
    body: "text-ink-muted",
    verse: "text-brand",
  },
  {
    tile: "bg-cloud lg:col-span-7",
    heading: "text-ink",
    body: "text-ink-muted",
    verse: "text-brand",
  },
] as const;

/**
 * A time range that never breaks inside a time: each side of the en dash is one unbreakable
 * piece. At normal sizes the whole range fits on one line (the list scales its type, tested at
 * every viewport in both languages); only with enlarged text may it fold, and then at the dash.
 */
function TimeRange({ time }: { time: string }) {
  const [from, to] = time.split(" – ");
  if (to === undefined) return <span className="whitespace-nowrap">{time}</span>;
  return (
    <>
      <span className="whitespace-nowrap">{from} –</span>{" "}
      <span className="whitespace-nowrap">{to}</span>
    </>
  );
}

/** A right arrow for links that move on. Decorative: the link's words carry its meaning. */
function ArrowIcon({ className = "size-5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={`shrink-0 ${className}`}
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

/** The bell that gave Kengeleni its name, drawn as a single line. Decorative. */
function BellIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 52"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <path d="M16 4h16M24 4v6" />
      <path d="M24 10c-8 0-12 7-12 17v7l-4 6h32l-4-6v-7c0-10-4-17-12-17Z" />
      <path d="M18 18c1.5-2 3.5-3 6-3" />
      <circle cx="24" cy="45" r="3.5" />
    </svg>
  );
}
