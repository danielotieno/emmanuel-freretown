import { headers } from "next/headers";
import Link from "next/link";
import { getDb } from "@/app/_lib/db";
import { cachedJson, defaultEdgeCache } from "@/app/_lib/edge-cache";
import { getLocale } from "@/app/_lib/i18n";
import { getLogger } from "@/app/_lib/log";
import { ArrowIcon, BellIcon, FacebookIcon, YouTubeIcon } from "@/components/icons";
import { PendingLink } from "@/components/pending-link";
import { Photo } from "@/components/photo";
import { SiteHeader } from "@/components/site-header";
import { CHURCH_OFFICE } from "@/lib/church-office";
import { listActiveHbcs } from "@/modules/organisation";
import { m } from "@/paraglide/messages";
import arches from "./images/arches-720.webp";
import church1440 from "./images/church-1440.webp";
import church640 from "./images/church-640.webp";
import church960 from "./images/church-960.webp";
import front from "./images/front-640.webp";

/**
 * The homepage (#28): the welcome, then one section each for our story, Sunday services, daily
 * activities, the theme of the year, the ministries, the Home Based Cells, registration and how
 * to reach us. Content from the church's earlier site, without clergy, sermons or named people.
 * The theme of the year is in the messages (`home_theme_*`): update it each year. The fuller
 * history is on /about.
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
    {
      name: "KAMA",
      full: m.home_ministry_kama_full({}, o),
      body: m.home_ministry_kama({}, o),
      who: m.home_ministry_kama_who({}, o),
      verse: m.home_verse_kama_text({}, o),
      reference: m.home_verse_kama({}, o),
    },
    {
      name: m.home_ministry_mu_name({}, o),
      full: null,
      body: m.home_ministry_mu({}, o),
      who: m.home_ministry_mu_who({}, o),
      verse: m.home_verse_mu_text({}, o),
      reference: m.home_verse_mu({}, o),
    },
    {
      name: "KAYO",
      full: m.home_ministry_kayo_full({}, o),
      body: m.home_ministry_kayo({}, o),
      who: m.home_ministry_kayo_who({}, o),
      verse: m.home_verse_kayo_text({}, o),
      reference: m.home_verse_kayo({}, o),
    },
    {
      name: m.home_ministry_children_name({}, o),
      full: null,
      body: m.home_ministry_children({}, o),
      who: m.home_ministry_children_who({}, o),
      verse: m.home_verse_children_text({}, o),
      reference: m.home_verse_children({}, o),
    },
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
        {/* Welcome: the sentence, one paragraph, one action, then the church itself. The words
            stand on white; the photo is never under text. */}
        <section aria-labelledby="welcome-heading" className={`${SHELL} pt-10 sm:pt-14 lg:pt-20`}>
          <div className="grid gap-7 lg:grid-cols-12 lg:items-end lg:gap-8">
            <h1 id="welcome-heading" className="max-w-[12ch] text-display lg:col-span-7">
              {m.landing_welcome({}, o)}
            </h1>
            <div className="lg:col-span-4 lg:col-start-9 lg:pb-3">
              <p className="max-w-[44ch] text-lead text-ink-muted">{m.home_lead({}, o)}</p>
              <div className="mt-7 flex flex-col gap-x-5 gap-y-1 whitespace-nowrap sm:flex-row sm:flex-wrap sm:items-center">
                <a href="#services" className="btn-dark">
                  {m.home_cta_sunday({}, o)}
                  <ArrowIcon />
                </a>
                <Link href="/about" prefetch={false} className="btn-text">
                  {m.home_cta_story({}, o)}
                </Link>
              </div>
            </div>
          </div>
          <figure className="tile-rise mt-10 overflow-hidden rounded-[1.25rem] bg-cloud sm:mt-14 sm:rounded-[1.75rem]">
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
                className="photo-settle aspect-[4/3] w-full object-cover object-[50%_42%] sm:aspect-[16/9] lg:aspect-[2/1]"
              />
            </picture>
          </figure>
        </section>

        {/* Our story: one sentence at title size, then the bell that named the place. */}
        <section aria-labelledby="story-heading" className={`${SHELL} ${SECTION}`}>
          <h2 id="story-heading" className="sr-only">
            {m.home_story_title({}, o)}
          </h2>
          <p className="mx-auto max-w-[26ch] text-center text-title text-balance">
            {m.home_story_lead({}, o)}{" "}
            <span className="text-line-strong">{m.home_story_rest({}, o)}</span>
          </p>
          <div className="mt-14 grid gap-3 sm:gap-4 md:mt-20 lg:grid-cols-12">
            <figure className="overflow-hidden rounded-[1.75rem] bg-cloud lg:col-span-7">
              <Photo
                image={arches}
                alt={m.home_story_photo_alt({}, o)}
                className="aspect-[4/3] size-full object-cover lg:aspect-auto"
              />
            </figure>
            <div className="on-dark flex flex-col rounded-[1.75rem] bg-night p-7 text-paper sm:p-10 lg:col-span-5 lg:min-h-[30rem]">
              <BellIcon className="h-14 w-auto self-start text-gold" />
              <h3 className="mt-10 text-subtitle text-paper lg:mt-auto">
                {m.home_bell_title({}, o)}
              </h3>
              <p className="mt-3 max-w-[44ch] text-card text-sky">{m.home_bell_body({}, o)}</p>
              <Link href="/about" prefetch={false} className="btn-on-dark mt-8 self-start">
                {m.home_cta_story({}, o)}
                <ArrowIcon />
              </Link>
            </div>
          </div>
        </section>

        {/* Sunday services: a timetable. Each time's column is a container, so the time is sized
            from the column's width and never breaks inside a time, in either language. */}
        <section
          id="services"
          aria-labelledby="services-heading"
          className={`${SHELL} ${SECTION} scroll-mt-4`}
        >
          <div className={HEADER}>
            <h2 id="services-heading" className="text-title lg:col-span-7">
              {m.home_services_title({}, o)}
            </h2>
            <p className="max-w-[40ch] text-lead text-ink-muted lg:col-span-4 lg:col-start-9">
              {m.home_services_intro({}, o)}
            </p>
          </div>
          <ul className="mt-10 border-t border-ink md:mt-14">
            {services.map(([time, name]) => (
              <li
                key={name}
                className="grid gap-x-8 gap-y-1 border-b border-line py-6 md:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] md:items-baseline md:py-8"
              >
                <div className="@container">
                  <p className="font-display text-[clamp(1.375rem,7.4cqi,3.25rem)] leading-[1.05] tracking-[-0.018em]">
                    <TimeRange time={time} />
                  </p>
                </div>
                <p className="text-lead text-ink-muted">{name}</p>
              </li>
            ))}
          </ul>
          <div className="mt-8 grid gap-x-8 gap-y-3 text-card text-ink-muted md:grid-cols-2">
            <p>
              {m.home_services_find({}, o)}{" "}
              <a href="#visit" className={INLINE_LINK}>
                {m.home_services_find_link({}, o)}
              </a>
            </p>
            <p>
              {m.home_services_live({}, o)}{" "}
              <a href={YOUTUBE_URL} className={INLINE_LINK}>
                {m.home_services_live_link({}, o)}
              </a>
            </p>
          </div>
        </section>

        {/* Daily activities: Monday to Saturday, a block per day. */}
        <section
          id="week"
          aria-labelledby="week-heading"
          className={`${SHELL} ${SECTION} scroll-mt-4`}
        >
          <div className={HEADER}>
            <h2 id="week-heading" className="text-title lg:col-span-7">
              {m.home_week_title({}, o)}
            </h2>
            <p className="max-w-[40ch] text-lead text-ink-muted lg:col-span-4 lg:col-start-9">
              {m.home_week_intro({}, o)}
            </p>
          </div>
          <dl className="mt-10 grid gap-x-8 md:mt-14 md:grid-cols-2 lg:grid-cols-3">
            {week.map(([day, time, what]) => (
              <div key={day} className="border-t border-line pt-6 pb-10">
                <dt className="text-subtitle">{day}</dt>
                <dd className="mt-1 text-card whitespace-nowrap text-brand tabular-nums">{time}</dd>
                <dd className="mt-4 max-w-[38ch] text-card text-ink-muted">{what}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* Theme of the year: the year's one sentence, the verse it rests on, on its own band. */}
        <section aria-labelledby="theme-heading" className={`${SHELL} pt-14 md:pt-24`}>
          <div className="on-dark rounded-[2rem] bg-night px-6 py-20 text-center sm:px-12 md:py-32">
            <h2 id="theme-heading" className="mx-auto max-w-[22ch] text-title text-paper">
              {m.home_theme_title({}, o)}
            </h2>
            <figure className="mx-auto mt-10 max-w-[46ch] md:mt-12">
              <blockquote className="text-lead text-sky">
                <p>“{m.home_theme_verse_text({}, o)}”</p>
              </blockquote>
              <figcaption className="mt-5 text-small text-sky">
                <span className="text-paper">{m.home_theme_verse({}, o)}</span>
                <span aria-hidden="true" className="mx-3 text-gold">
                  ·
                </span>
                {m.home_theme_label({}, o)}
              </figcaption>
            </figure>
          </div>
        </section>

        {/* Ministries: a row each: who they are, what they do and when, and the verse they hold
            to, written out. */}
        <section
          id="ministries"
          aria-labelledby="ministries-heading"
          className={`${SHELL} ${SECTION} scroll-mt-4`}
        >
          <div className={HEADER}>
            <h2 id="ministries-heading" className="text-title lg:col-span-7">
              {m.home_ministries_title({}, o)}
            </h2>
            <p className="max-w-[40ch] text-lead text-ink-muted lg:col-span-4 lg:col-start-9">
              {m.home_ministries_intro({}, o)}
            </p>
          </div>
          <ul className="mt-10 border-t border-ink md:mt-14">
            {ministries.map((ministry, i) => {
              const tone = VERSE_TONES[i % VERSE_TONES.length]!;
              return (
                <li
                  key={ministry.name}
                  className="grid gap-6 border-b border-line py-8 md:py-10 lg:grid-cols-12 lg:gap-8"
                >
                  <div className="lg:col-span-3">
                    <h3 className="text-subtitle">{ministry.name}</h3>
                    {ministry.full && (
                      <p className="mt-1 text-card text-ink-muted">{ministry.full}</p>
                    )}
                  </div>
                  <div className="max-w-[52ch] lg:col-span-4">
                    <p>{ministry.body}</p>
                    <p className="mt-3 text-card text-ink-muted">{ministry.who}</p>
                  </div>
                  <figure
                    className={`flex flex-col justify-between gap-8 rounded-[1.25rem] p-6 sm:p-7 lg:col-span-5 ${tone.tile}`}
                  >
                    <blockquote className={`text-subtitle ${tone.verse}`}>
                      <p>“{ministry.verse}”</p>
                    </blockquote>
                    <figcaption className={`text-small ${tone.reference}`}>
                      {ministry.reference}
                    </figcaption>
                  </figure>
                </li>
              );
            })}
          </ul>
        </section>

        {/* Home Based Cells, from the register's own list. */}
        <section
          id="hbcs"
          aria-labelledby="hbcs-heading"
          className={`${SHELL} ${SECTION} scroll-mt-4`}
        >
          <div className="grid gap-10 rounded-[2rem] bg-cloud p-7 sm:p-12 lg:grid-cols-12 lg:gap-8 lg:p-16">
            <div className="lg:col-span-5">
              <h2 id="hbcs-heading" className="text-title">
                {m.home_hbc_title({}, o)}
              </h2>
              <p className="mt-5 max-w-[46ch] text-card text-ink-muted">
                {m.home_hbc_intro({}, o)}
              </p>
              <p className="mt-6 max-w-[46ch] border-t border-line pt-5 text-card">
                {m.home_hbc_help({}, o)}
              </p>
            </div>
            {hbcs.length > 0 && (
              <ul className="flex flex-wrap content-start gap-2 sm:gap-2.5 lg:col-span-6 lg:col-start-7">
                {hbcs.map((hbc) => (
                  <li
                    key={hbc.id}
                    className="inline-flex min-h-12 items-center rounded-full bg-paper px-5 text-subtitle whitespace-nowrap sm:min-h-14 sm:px-6"
                  >
                    {hbc.name}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* Registration */}
        <section aria-labelledby="register-heading" className={`${SHELL} pt-3 sm:pt-4`}>
          <div className="on-dark grid gap-12 rounded-[2rem] bg-brand p-7 text-paper sm:p-12 lg:grid-cols-12 lg:items-center lg:gap-8 lg:p-16">
            <div className="lg:col-span-5">
              <h2 id="register-heading" className="max-w-[16ch] text-title text-paper">
                {m.home_register_title({}, o)}
              </h2>
              <p className="mt-5 max-w-[42ch] text-card text-mist">{m.home_register_body({}, o)}</p>
              {/* A plain link, not <Link>: Turnstile's CSP is set per page load (src/lib/csp.ts). */}
              <PendingLink href="/registration" className="btn-on-dark mt-9 w-full sm:w-auto">
                {m.reg_title({}, o)}
                <ArrowIcon />
              </PendingLink>
              {/* Members already on the church's list check first instead of registering again
                  (D47, D50). A plain link: Turnstile's CSP is set per page load. */}
              <p className="mt-5 max-w-[42ch] text-card text-mist">
                {m.reg_check_first({}, o)}{" "}
                <a
                  href="/registration/status"
                  className="text-paper underline decoration-paper/50 underline-offset-4 hover:decoration-paper"
                >
                  {m.reg_check_first_link({}, o)}
                </a>
              </p>
            </div>
            <ol className="lg:col-span-6 lg:col-start-7">
              {steps.map(([title, body], i) => (
                <li
                  key={title}
                  className="grid grid-cols-[2.5rem_1fr] gap-4 border-t border-paper/25 py-6 last:border-b"
                >
                  <span aria-hidden="true" className="text-subtitle text-paper">
                    {i + 1}
                  </span>
                  <span>
                    <span className="block text-subtitle text-paper">{title}</span>
                    <span className="mt-1.5 block text-card text-mist">{body}</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Visit and contact: where the church is, then every way to reach the office. */}
        <section
          id="visit"
          aria-labelledby="visit-heading"
          className={`${SHELL} ${SECTION} scroll-mt-4`}
        >
          <div className={HEADER}>
            <h2 id="visit-heading" className="text-title lg:col-span-7">
              {m.home_visit_title({}, o)}
            </h2>
            <p className="max-w-[40ch] text-lead text-ink-muted lg:col-span-4 lg:col-start-9">
              {m.home_visit_intro({}, o)}
            </p>
          </div>
          <div className="mt-10 grid gap-10 md:mt-14 lg:grid-cols-12 lg:gap-8">
            <figure className="overflow-hidden rounded-[1.75rem] bg-cloud lg:col-span-5">
              <Photo
                image={front}
                alt={m.home_visit_photo_alt({}, o)}
                className="aspect-[4/3] size-full object-cover object-[50%_35%] sm:aspect-[16/9] lg:aspect-auto"
              />
            </figure>
            <div className="flex flex-col lg:col-span-6 lg:col-start-7">
              <p className="max-w-[20ch] text-subtitle">{m.home_visit_address({}, o)}</p>
              <a href={MAP_URL} className="btn-secondary mt-7 self-start">
                {m.home_visit_map({}, o)}
                <ArrowIcon />
              </a>
              <h3 className="mt-14 text-subtitle lg:mt-auto lg:pt-14">
                {m.home_visit_contact({}, o)}
              </h3>
              <dl className="mt-5 border-t border-ink">
                <div className={CONTACT_ROW}>
                  <dt className="text-card text-ink-muted">{m.home_visit_phone({}, o)}</dt>
                  <dd>
                    <a href={CHURCH_OFFICE.phoneHref} className={`${CONTACT_LINK} tabular-nums`}>
                      {CHURCH_OFFICE.phone}
                    </a>
                  </dd>
                </div>
                <div className={CONTACT_ROW}>
                  <dt className="text-card text-ink-muted">{m.home_visit_email({}, o)}</dt>
                  <dd>
                    <a
                      href={`mailto:${CHURCH_OFFICE.email}`}
                      className={`${CONTACT_LINK} wrap-anywhere`}
                    >
                      {CHURCH_OFFICE.email}
                    </a>
                  </dd>
                </div>
                <div className={CONTACT_ROW}>
                  <dt className="text-card text-ink-muted">{m.home_visit_post({}, o)}</dt>
                  <dd className="tabular-nums">{m.home_visit_postal({}, o)}</dd>
                </div>
              </dl>
              {/* Follow us: two large links, each a whole tile to tap. */}
              <h3 className="mt-10 text-subtitle">{m.home_visit_follow({}, o)}</h3>
              <ul className="mt-5 grid gap-3 sm:grid-cols-2">
                <li>
                  <a href={FACEBOOK_URL} className={SOCIAL_LINK}>
                    <span className={SOCIAL_MARK}>
                      <FacebookIcon />
                    </span>
                    <span className="min-w-0 flex-1 leading-tight">
                      {m.home_visit_facebook({}, o)}
                    </span>
                    <ArrowIcon />
                  </a>
                </li>
                <li>
                  <a href={YOUTUBE_URL} className={SOCIAL_LINK}>
                    <span className={SOCIAL_MARK}>
                      <YouTubeIcon />
                    </span>
                    <span className="min-w-0 flex-1 leading-tight">
                      {m.home_visit_youtube({}, o)}
                    </span>
                    <ArrowIcon />
                  </a>
                </li>
              </ul>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}

/** The page's column: 16px gutters on phones, 24px from sm, 40px from lg (DESIGN.md §4). */
const SHELL = "mx-auto w-full max-w-content px-4 sm:px-6 lg:px-10";

/** The space above a section: 96px, 144px from md (DESIGN.md §10 rule 9). */
const SECTION = "pt-24 md:pt-36";

/** A section's opening: its title in 7 columns, a line about it in the last 4. */
const HEADER = "grid gap-4 lg:grid-cols-12 lg:items-end lg:gap-8";

/** A link inside muted text: ink, underlined, blue on hover. */
const INLINE_LINK =
  "text-ink underline decoration-line-strong underline-offset-4 transition-colors hover:text-brand hover:decoration-brand";

/** A row of the contact list: what it is, then the way to reach us. */
const CONTACT_ROW =
  "grid gap-x-6 gap-y-1 border-b border-line py-4 sm:grid-cols-[7rem_1fr] sm:items-baseline";

/** A contact row's link: at least 44px tall for a thumb, ink until hovered. */
const CONTACT_LINK =
  "inline-flex min-h-11 items-center text-ink no-underline transition-colors hover:text-brand";

/** A "follow us" link: a Cloud tile that turns Black under the pointer, 64px tall or more. */
const SOCIAL_LINK =
  "group flex min-h-16 items-center gap-3.5 rounded-[1.25rem] bg-cloud py-3 pr-5 pl-3 text-button text-ink no-underline transition-colors duration-150 hover:bg-night hover:text-paper active:scale-[0.98]";

/** The network's mark on a paper disc at the start of the tile. */
const SOCIAL_MARK = "grid size-11 shrink-0 place-items-center rounded-full bg-paper text-ink";

const MAP_URL = "https://www.google.com/maps/search/?api=1&query=ACK+Emmanuel+Kengeleni+Church";
const FACEBOOK_URL = "https://www.facebook.com/profile.php?id=100069793723070";
const YOUTUBE_URL = "https://www.youtube.com/@ACKCONTROLROOM/streams";

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

/**
 * The ministries' verse tiles, in order: KAMA on Black, Mothers' Union on Signal Blue, KAYO on
 * Mist, Children's Ministry on Cloud. Every text colour here meets AA on its tile (DESIGN.md §2).
 */
const VERSE_TONES = [
  { tile: "on-dark bg-night", verse: "text-paper", reference: "text-sky" },
  { tile: "on-dark bg-brand", verse: "text-paper", reference: "text-mist" },
  { tile: "bg-mist", verse: "text-ink", reference: "text-brand" },
  { tile: "bg-cloud", verse: "text-ink", reference: "text-brand" },
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
