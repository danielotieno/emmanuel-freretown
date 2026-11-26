import { headers } from "next/headers";
import { getDb } from "@/app/_lib/db";
import { cachedJson, defaultEdgeCache } from "@/app/_lib/edge-cache";
import { getLocale } from "@/app/_lib/i18n";
import { getLogger } from "@/app/_lib/log";
import { PendingLink } from "@/components/pending-link";
import { SiteHeader } from "@/components/site-header";
import { Wave } from "@/components/wave";
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
    [m.home_time_english1({}, o), m.home_service_english1({}, o), m.home_language_english({}, o)],
    [m.home_time_english2({}, o), m.home_service_english2({}, o), m.home_language_english({}, o)],
    [
      m.home_time_kiswahili({}, o),
      m.home_service_kiswahili({}, o),
      m.home_language_kiswahili({}, o),
    ],
    [m.home_time_revival({}, o), m.home_service_revival({}, o), m.home_language_english({}, o)],
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
        {/* The parish board (#96): one wide tiled grid that answers "when do I come?" and "how do
            I join?" on the first screen. On phones the tiles stack: welcome, photo, Sunday. */}
        <div className="mx-auto max-w-content px-4 pt-5 sm:px-6 md:pt-8 lg:px-10">
          <div className="grid gap-3 sm:gap-4 md:grid-cols-2 lg:grid-cols-12">
            {/* Welcome: on wide screens the photo is the stage and the welcome sits on it; on
                phones the words come first on Midnight and the photo follows, never under text. */}
            <section
              aria-labelledby="welcome-heading"
              className="tile-rise relative flex flex-col overflow-hidden rounded-[1.75rem] bg-night md:col-span-2 md:min-h-[36rem] lg:col-span-7 lg:row-span-2 lg:min-h-[clamp(38rem,calc(100svh-8rem),46rem)]"
            >
              <div className="on-dark relative z-10 px-6 pt-8 pb-7 sm:px-10 sm:pt-12 md:absolute md:inset-x-0 md:bottom-0 md:p-12 lg:p-11">
                <h1
                  id="welcome-heading"
                  className="max-w-[12ch] text-[clamp(2.75rem,8.4vw,5.5rem)] leading-[0.96] tracking-[-0.03em] text-paper"
                >
                  {m.landing_welcome({}, o)}
                </h1>
                <p className="mt-5 max-w-[44ch] text-lg text-sky md:text-paper/90">
                  {m.home_lead({}, o)}
                </p>
                <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                  <a href="#visit" className="btn-on-dark">
                    {m.home_cta_sunday({}, o)}
                    <ArrowIcon />
                  </a>
                  {/* A plain link, not <Link>: Turnstile's CSP is set per page load. */}
                  <PendingLink href="/registration" className="btn-outline-on-dark">
                    {m.reg_title({}, o)}
                  </PendingLink>
                </div>
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
                  className="absolute inset-0 hidden bg-linear-to-t from-night from-15% via-night/75 via-45% to-night/0 to-80% md:block"
                />
                <figcaption className="absolute bottom-3 left-3 rounded-full bg-paper/95 px-3.5 py-1.5 text-sm text-ink md:top-6 md:right-6 md:bottom-auto md:left-auto">
                  {m.home_photo_badge({}, o)}
                </figcaption>
              </figure>
            </section>

            {/* Sunday: every time range sits on one line of its own, sized to the tile, so no
                row ever breaks a time (#96). Kiswahili times are longer; the type scales down. */}
            <section
              id="services"
              aria-labelledby="services-heading"
              className="tile-rise on-dark @container scroll-mt-4 flex flex-col rounded-[1.75rem] bg-night p-6 text-paper [--rise-delay:60ms] sm:p-8 lg:col-span-5 lg:p-7"
            >
              <h2
                id="services-heading"
                className="text-[clamp(1.875rem,2.6vw,2.25rem)] leading-none text-paper"
              >
                {m.home_services_title({}, o)}
              </h2>
              <p className="mt-2 text-base text-sky">{m.home_services_intro({}, o)}</p>
              <ul className="mt-5 flex flex-1 flex-col justify-between divide-y divide-night-soft border-t border-night-soft">
                {services.map(([time, name, language]) => (
                  <li
                    key={name}
                    className="grid grid-cols-[1fr_auto] items-baseline gap-x-4 gap-y-0.5 py-2.5"
                  >
                    <p className="col-span-2 font-display text-[clamp(1.125rem,8cqi,1.75rem)] leading-tight tabular-nums">
                      <TimeRange time={time} />
                    </p>
                    <p className="text-paper">{name}</p>
                    <p className="rounded-full border border-night-soft px-2.5 text-sm text-sky">
                      {language}
                    </p>
                  </li>
                ))}
              </ul>
            </section>

            {/* Theme of the year: the year's one big sentence, on the board's one blue tile */}
            <section
              aria-labelledby="theme-heading"
              className="tile-rise on-dark flex flex-col justify-between gap-6 rounded-[1.75rem] bg-brand p-6 text-paper [--rise-delay:120ms] sm:p-8 lg:col-span-5 lg:p-7"
            >
              <h2
                id="theme-heading"
                className="text-[clamp(1.625rem,2.2vw,2rem)] leading-[1.08] tracking-[-0.02em] text-paper"
              >
                <span aria-hidden="true" className="text-mist">
                  “
                </span>
                {m.home_theme_title({}, o)}
                <span aria-hidden="true" className="text-mist">
                  ”
                </span>
              </h2>
              <p className="flex flex-wrap gap-x-3 text-sm text-mist">
                <span className="text-paper">{m.home_theme_verse({}, o)}</span>
                <span>{m.home_theme_label({}, o)}</span>
              </p>
            </section>
          </div>

          {/* The week, read like a parish calendar's pad: Sunday first (its times are in the
              Sunday tile above), then Monday to Saturday as hairline rows. Times never wrap. */}
          <section
            aria-labelledby="week-heading"
            className="mt-3 grid gap-6 rounded-[1.75rem] bg-cloud p-6 sm:mt-4 sm:p-8 lg:grid-cols-12 lg:gap-8 lg:p-10"
          >
            <h2
              id="week-heading"
              className="text-[clamp(1.875rem,3vw,2.375rem)] leading-none lg:col-span-3"
            >
              {m.home_week_title({}, o)}
            </h2>
            <dl className="divide-y divide-line border-y border-line lg:col-span-9">
              <div className={WEEK_ROW}>
                <dt className="font-display text-2xl leading-tight">{m.home_day_sun({}, o)}</dt>
                <dd>
                  <a
                    href="#services"
                    className="inline-flex items-center gap-1.5 whitespace-nowrap"
                  >
                    {m.home_services_title({}, o)}
                    <ArrowIcon className="size-4 -rotate-90" />
                  </a>
                </dd>
                <dd className="text-ink-muted">
                  {new Intl.ListFormat(locale, { type: "conjunction" }).format(
                    services.map(([, name]) => name),
                  )}
                </dd>
              </div>
              {week.map(([day, time, what]) => (
                <div key={day} className={WEEK_ROW}>
                  <dt className="font-display text-2xl leading-tight">{day}</dt>
                  <dd className="whitespace-nowrap text-brand tabular-nums">{time}</dd>
                  <dd className="text-ink-muted">{what}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>

        {/* About */}
        <section
          id="about"
          aria-labelledby="about-heading"
          className="mx-auto max-w-content scroll-mt-4 px-4 pt-20 sm:px-6 md:pt-32 lg:px-10"
        >
          <div className="grid gap-10 lg:grid-cols-12 lg:gap-8">
            <div className="lg:col-span-7">
              <h2
                id="about-heading"
                className="max-w-[15ch] text-[clamp(2.5rem,5.6vw,4.5rem)] leading-[0.98] tracking-[-0.03em]"
              >
                {m.home_about_title({}, o)}
              </h2>
              <p className="mt-8 max-w-[52ch] text-xl text-ink">{m.home_about_p1({}, o)}</p>
              <div className="mt-6 grid max-w-[62ch] gap-4 text-ink-muted lg:max-w-none lg:grid-cols-2 lg:gap-8">
                <p>{m.home_about_p2({}, o)}</p>
                <p>{m.home_about_p3({}, o)}</p>
              </div>
            </div>
            <aside className="on-dark relative flex flex-col overflow-hidden rounded-[1.75rem] bg-night p-7 pb-16 text-paper sm:p-10 sm:pb-20 lg:col-span-5 lg:self-end">
              <BellIcon className="h-16 w-auto text-gold" />
              <h3 className="mt-8 text-[clamp(1.875rem,3.4vw,2.625rem)] leading-[1.05] text-paper">
                {m.home_bell_title({}, o)}
              </h3>
              <p className="mt-4 text-sky">{m.home_bell_body({}, o)}</p>
              <Wave className="pointer-events-none absolute inset-x-0 bottom-0 h-10 w-full text-night-soft" />
            </aside>
          </div>
        </section>

        {/* Ministries and HBCs */}
        <section
          id="ministries"
          aria-labelledby="ministries-heading"
          className="mx-auto max-w-content scroll-mt-4 px-4 pt-20 sm:px-6 md:pt-32 lg:px-10"
        >
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between md:gap-10">
            <h2
              id="ministries-heading"
              className="text-[clamp(2.5rem,5.6vw,4.5rem)] leading-[0.98] tracking-[-0.03em]"
            >
              {m.home_ministries_title({}, o)}
            </h2>
            <p className="max-w-[34ch] text-lg text-ink-muted md:pb-2">
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
                  className={`flex flex-col justify-between gap-8 md:min-h-[19rem] md:gap-10 rounded-[1.75rem] p-7 sm:p-9 ${tone.tile}`}
                >
                  <div>
                    <h3
                      className={`text-[clamp(2.5rem,5vw,4rem)] leading-[0.95] tracking-[-0.03em] ${tone.heading}`}
                    >
                      {name}
                    </h3>
                    <p className={`mt-5 max-w-[40ch] text-lg ${tone.body}`}>{body}</p>
                  </div>
                  <p className={`flex items-center gap-3 text-sm ${tone.verse}`}>
                    <span aria-hidden="true" className="h-px w-8 bg-current" />
                    {verse}
                  </p>
                </li>
              );
            })}
          </ul>

          {/* Home Based Churches, from the register's own list */}
          <div className="mt-3 grid gap-8 rounded-[1.75rem] bg-cloud p-7 sm:mt-4 sm:p-10 lg:grid-cols-12 lg:gap-8">
            <div className="lg:col-span-4">
              <h3 className="text-[clamp(1.875rem,3vw,2.375rem)] leading-[1.05]">
                {m.home_hbc_title({}, o)}
              </h3>
              <p className="mt-4 max-w-[48ch] text-ink-muted">{m.home_hbc_intro({}, o)}</p>
            </div>
            {hbcs.length > 0 && (
              <ul className="grid content-start gap-x-8 sm:grid-cols-[repeat(auto-fill,minmax(12rem,1fr))] lg:col-span-8">
                {hbcs.map((hbc) => (
                  <li
                    key={hbc.id}
                    className="flex min-h-12 items-center gap-3 border-b border-line whitespace-nowrap text-ink"
                  >
                    <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-brand" />
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
          className="mx-auto max-w-content px-4 pt-20 sm:px-6 md:pt-32 lg:px-10"
        >
          <div className="on-dark relative grid gap-12 overflow-hidden rounded-[2rem] bg-brand p-7 pb-16 text-paper sm:p-12 sm:pb-20 lg:grid-cols-12 lg:items-center lg:gap-8 lg:p-16">
            <div className="lg:col-span-5">
              <h2
                id="register-heading"
                className="max-w-[14ch] text-[clamp(2.5rem,5vw,4.25rem)] leading-[0.98] tracking-[-0.03em] text-paper"
              >
                {m.home_register_title({}, o)}
              </h2>
              <p className="mt-5 max-w-[42ch] text-lg text-mist">{m.reg_intro({}, o)}</p>
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
                  className="grid grid-cols-[3.5rem_1fr] gap-4 border-t border-paper/25 py-6 last:border-b"
                >
                  <span
                    aria-hidden="true"
                    className="font-display text-5xl leading-none text-paper tabular-nums"
                  >
                    {i + 1}
                  </span>
                  <span>
                    <span className="block text-xl text-paper">{title}</span>
                    <span className="mt-1 block text-mist">{body}</span>
                  </span>
                </li>
              ))}
            </ol>
            <Wave className="pointer-events-none absolute inset-x-0 bottom-0 h-10 w-full text-paper/10" />
          </div>
        </section>

        {/* Visit */}
        <section
          id="visit"
          aria-labelledby="visit-heading"
          className="mx-auto max-w-content scroll-mt-4 px-4 pt-20 sm:px-6 md:pt-32 lg:px-10"
        >
          <div className="grid gap-10 lg:grid-cols-12 lg:gap-8">
            <div className="lg:col-span-6">
              <h2
                id="visit-heading"
                className="text-[clamp(2.5rem,5.6vw,4.5rem)] leading-[0.98] tracking-[-0.03em]"
              >
                {m.home_visit_title({}, o)}
              </h2>
              <p className="mt-6 max-w-[24ch] font-display text-[clamp(1.875rem,3.4vw,2.75rem)] leading-[1.1] text-ink">
                {m.home_visit_address({}, o)}
              </p>
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
                <h3 className="text-2xl">{m.home_visit_office({}, o)}</h3>
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
                <h3 className="text-2xl">{m.home_visit_follow({}, o)}</h3>
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
const WEEK_ROW = "grid gap-1 py-4 md:grid-cols-[9rem_13rem_1fr] md:items-baseline md:gap-6";

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
 * piece. At normal sizes the whole range fits on one line (the tile scales its type, tested at
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
