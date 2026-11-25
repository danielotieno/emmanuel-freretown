import { getDb } from "@/app/_lib/db";
import { getLocale } from "@/app/_lib/i18n";
import { getLogger } from "@/app/_lib/log";
import { SiteHeader } from "@/components/site-header";
import { Wave } from "@/components/wave";
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
  // The page never fails or waits long because the HBC list can't load: after HBC_TIMEOUT_MS
  // it renders the section without names.
  const hbcs = await withTimeout(listActiveHbcs(await getDb()), HBC_TIMEOUT_MS).catch(
    async (error: unknown) => {
      (await getLogger()).error("home.hbcs_failed", error);
      return [];
    },
  );

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
        {/* Welcome: on wide screens the photo is the stage and the welcome sits on it; on phones
            the welcome comes first and the photo follows, so the words are never over a crop. */}
        <section className="mx-auto max-w-content px-4 pt-6 sm:px-6 md:pt-8">
          <div className="relative flex flex-col md:overflow-hidden md:rounded-[2rem] md:bg-brand-deep">
            <div className="pt-4 pb-8 md:absolute md:inset-x-0 md:bottom-0 md:z-10 md:p-12 lg:p-16">
              <h1 className="max-w-[13ch] text-[clamp(3rem,9vw,5.75rem)] leading-[0.98] tracking-[-0.03em] md:text-paper">
                {m.landing_welcome({}, o)}
              </h1>
              <p className="mt-5 max-w-[46ch] text-lg text-ink-muted md:text-xl md:text-paper/90">
                {m.home_lead({}, o)}
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                <a
                  href="#services"
                  className="btn-primary md:bg-paper md:text-brand-deep md:hover:bg-lagoon"
                >
                  {m.home_cta_sunday({}, o)}
                </a>
                {/* A plain link, not <Link>: Turnstile's CSP is set per page load (src/lib/csp.ts). */}
                <a
                  href="/registration"
                  className="btn-secondary md:border-paper/60 md:bg-transparent md:text-paper md:hover:border-paper"
                >
                  {m.reg_title({}, o)}
                </a>
              </div>
            </div>
            <figure className="relative overflow-hidden rounded-3xl bg-lagoon md:rounded-none">
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
                  className="aspect-[4/3] w-full object-cover sm:aspect-[16/10] md:aspect-auto md:h-[min(86svh,47rem)] md:min-h-[38rem]"
                />
              </picture>
              {/* Shade under the welcome so paper text stays readable on the white walls. */}
              <div
                aria-hidden="true"
                className="absolute inset-0 hidden bg-linear-to-t from-brand-deep from-10% via-brand-deep/80 via-45% to-brand-deep/0 to-80% md:block"
              />
              <div
                aria-hidden="true"
                className="absolute inset-0 hidden bg-linear-to-r from-brand-deep/60 to-brand-deep/0 to-65% md:block"
              />
              <figcaption className="absolute bottom-4 left-4 rounded-full bg-paper/95 px-4 py-2 text-sm text-ink md:top-6 md:right-6 md:bottom-auto md:left-auto">
                {m.home_photo_badge({}, o)}
              </figcaption>
            </figure>
          </div>
        </section>

        {/* Theme of the year: the year's one big sentence */}
        <section
          aria-labelledby="theme-heading"
          className="relative mt-20 overflow-hidden bg-brand-deep text-paper md:mt-28"
        >
          <div className="mx-auto max-w-content px-4 py-20 text-center sm:px-6 md:py-32">
            <h2
              id="theme-heading"
              className="mx-auto max-w-[19ch] text-[clamp(2.25rem,5.6vw,4.5rem)] leading-[1.04] tracking-[-0.025em] text-paper"
            >
              <span aria-hidden="true" className="text-gold">
                “
              </span>
              {m.home_theme_title({}, o)}
              <span aria-hidden="true" className="text-gold">
                ”
              </span>
            </h2>
            <p className="mt-8 text-lagoon">
              {m.home_theme_verse({}, o)}
              <span aria-hidden="true" className="mx-3 text-gold">
                ·
              </span>
              {m.home_theme_label({}, o)}
            </p>
          </div>
          <Wave className="pointer-events-none absolute inset-x-0 bottom-0 h-10 w-full text-paper/[0.06] md:h-16" />
        </section>

        {/* Services and the week */}
        <section
          id="services"
          aria-labelledby="services-heading"
          className="mx-auto max-w-content scroll-mt-4 px-4 pt-20 sm:px-6 md:pt-32"
        >
          <div className="grid gap-8 md:grid-cols-[1fr_1.9fr] md:gap-16">
            <SectionHeading id="services-heading" title={m.home_services_title({}, o)}>
              {m.home_services_intro({}, o)}
            </SectionHeading>
            <ul className="divide-y divide-line border-y border-line">
              {services.map(([time, name, language]) => (
                <li
                  key={name}
                  className="grid grid-cols-[1fr_auto] items-baseline gap-x-6 gap-y-2 py-6 sm:grid-cols-[minmax(0,16rem)_1fr_auto]"
                >
                  <p className="col-span-2 font-display text-[clamp(1.875rem,3.4vw,2.625rem)] leading-[1.05] tracking-[-0.02em] text-balance text-ink tabular-nums sm:col-span-1">
                    {time}
                  </p>
                  <p className="text-lg text-ink">{name}</p>
                  <p className="rounded-full border border-line px-3 py-0.5 text-sm text-ink-muted">
                    {language}
                  </p>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-14 rounded-3xl bg-sand p-6 sm:p-10 md:mt-20">
            <h3 className="text-3xl">{m.home_week_title({}, o)}</h3>
            <dl className="mt-6 divide-y divide-line border-t border-line">
              {week.map(([day, time, what]) => (
                <div key={day} className="grid gap-1 py-4 sm:grid-cols-[9rem_13rem_1fr] sm:gap-4">
                  <dt className="text-ink">{day}</dt>
                  <dd className="text-ink-muted tabular-nums">{time}</dd>
                  <dd className="text-ink">{what}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* About */}
        <section
          id="about"
          aria-labelledby="about-heading"
          className="mx-auto max-w-content scroll-mt-4 px-4 pt-20 sm:px-6 md:pt-32"
        >
          <div className="grid gap-10 md:grid-cols-[1.35fr_1fr] md:gap-16">
            <div>
              <h2
                id="about-heading"
                className="max-w-[16ch] text-[clamp(2.25rem,5.4vw,3.75rem)] leading-[1.02] tracking-[-0.025em]"
              >
                {m.home_about_title({}, o)}
              </h2>
              <p className="mt-8 max-w-[52ch] text-xl text-ink">{m.home_about_p1({}, o)}</p>
              <div className="mt-5 max-w-[62ch] space-y-4 text-ink-muted">
                <p>{m.home_about_p2({}, o)}</p>
                <p>{m.home_about_p3({}, o)}</p>
              </div>
            </div>
            <aside className="relative self-end overflow-hidden rounded-3xl bg-lagoon p-7 pb-14 sm:p-10 sm:pb-16">
              <h3 className="text-[clamp(1.875rem,3.6vw,2.5rem)] leading-[1.05]">
                {m.home_bell_title({}, o)}
              </h3>
              <p className="mt-4 text-ink-muted">{m.home_bell_body({}, o)}</p>
              <Wave className="pointer-events-none absolute inset-x-0 bottom-0 h-8 w-full text-brand/15" />
            </aside>
          </div>
        </section>

        {/* Ministries and HBCs */}
        <section
          id="ministries"
          aria-labelledby="ministries-heading"
          className="mx-auto max-w-content scroll-mt-4 px-4 pt-20 sm:px-6 md:pt-32"
        >
          <SectionHeading id="ministries-heading" title={m.home_ministries_title({}, o)}>
            {m.home_ministries_intro({}, o)}
          </SectionHeading>
          <ul className="mt-10 grid gap-x-12 sm:grid-cols-2">
            {ministries.map(([name, body, verse]) => (
              <li key={name} className="flex flex-col border-t border-line pt-6 pb-10">
                <h3 className="text-[clamp(1.875rem,3.4vw,2.5rem)] leading-[1.05]">{name}</h3>
                <p className="mt-3 max-w-[44ch] flex-1 text-ink-muted">{body}</p>
                <p className="mt-4 text-sm text-brand">{verse}</p>
              </li>
            ))}
          </ul>

          {/* Home Based Churches, from the register's own list */}
          <div className="mt-6 grid gap-6 rounded-3xl bg-sand p-6 sm:p-10 md:grid-cols-[1fr_1.2fr] md:gap-12">
            <div>
              <h3 className="text-3xl">{m.home_hbc_title({}, o)}</h3>
              <p className="mt-3 max-w-[52ch] text-ink-muted">{m.home_hbc_intro({}, o)}</p>
            </div>
            {hbcs.length > 0 && (
              <ul className="flex flex-wrap content-start gap-2">
                {hbcs.map((hbc) => (
                  <li
                    key={hbc.id}
                    className="rounded-full border border-line bg-paper px-4 py-1.5 text-ink"
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
          className="mx-auto max-w-content px-4 pt-20 sm:px-6 md:pt-32"
        >
          <div className="relative grid gap-10 overflow-hidden rounded-[2rem] bg-lagoon p-7 pb-14 sm:p-12 sm:pb-16 md:grid-cols-2 md:items-center md:gap-16">
            <div>
              <h2
                id="register-heading"
                className="max-w-[16ch] text-[clamp(2.25rem,4.6vw,3.5rem)] leading-[1.02] tracking-[-0.025em]"
              >
                {m.home_register_title({}, o)}
              </h2>
              <p className="mt-5 max-w-[44ch] text-ink-muted">{m.reg_intro({}, o)}</p>
              <a href="/registration" className="btn-primary mt-8">
                {m.reg_title({}, o)}
              </a>
            </div>
            <ol className="divide-y divide-brand/15 border-y border-brand/15">
              {steps.map(([title, body], i) => (
                <li key={title} className="flex gap-5 py-5">
                  <span
                    aria-hidden="true"
                    className="font-display text-3xl leading-none text-brand tabular-nums"
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span>
                    <span className="block text-lg text-ink">{title}</span>
                    <span className="mt-1 block text-ink-muted">{body}</span>
                  </span>
                </li>
              ))}
            </ol>
            <Wave className="pointer-events-none absolute inset-x-0 bottom-0 h-8 w-full text-brand/15" />
          </div>
        </section>

        {/* Visit */}
        <section
          id="visit"
          aria-labelledby="visit-heading"
          className="mx-auto max-w-content scroll-mt-4 px-4 pt-20 sm:px-6 md:pt-32"
        >
          <div className="grid gap-10 md:grid-cols-2 md:gap-16">
            <div>
              <SectionHeading id="visit-heading" title={m.home_visit_title({}, o)} />
              <h3 className="mt-8 text-xl text-ink-muted">{m.home_visit_where({}, o)}</h3>
              <p className="mt-2 max-w-[28ch] font-display text-[clamp(1.75rem,3vw,2.25rem)] leading-[1.15] text-ink">
                {m.home_visit_address({}, o)}
              </p>
              <a
                href="https://www.google.com/maps/search/?api=1&query=ACK+Emmanuel+Kengeleni+Church"

                className="btn-secondary mt-8"
              >
                {m.home_visit_map({}, o)}
              </a>
            </div>
            <div className="divide-y divide-line self-end border-y border-line">
              <div className="py-6">
                <h3 className="text-2xl">{m.home_visit_office({}, o)}</h3>
                <ul className="mt-3 space-y-2 text-ink-muted">
                  <li>
                    <a href="tel:+254790255515" className="tabular-nums">
                      +254 790 255515
                    </a>
                  </li>
                  <li>
                    <a href="mailto:ackemmanuelkengeleni@gmail.com" className="break-words">
                      ackemmanuelkengeleni@gmail.com
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

function SectionHeading(props: { id: string; title: string; children?: string }) {
  return (
    <div className="max-w-2xl">
      <h2
        id={props.id}
        className="text-[clamp(2.25rem,5.4vw,3.75rem)] leading-[1.02] tracking-[-0.025em]"
      >
        {props.title}
      </h2>
      {props.children && <p className="mt-3 text-lg text-ink-muted">{props.children}</p>}
    </div>
  );
}
