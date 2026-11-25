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
  // The page never fails because the HBC list can't load: it shows the section without names.
  const hbcs = await listActiveHbcs(await getDb()).catch(async (error: unknown) => {
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
        {/* Welcome */}
        <section className="mx-auto max-w-content px-4 pt-8 sm:px-6 md:pt-14">
          <div className="max-w-3xl">
            <p className="text-sm text-brand">{m.home_eyebrow({}, o)}</p>
            <h1 className="mt-4 text-[clamp(2.5rem,7vw,4.5rem)]">{m.landing_welcome({}, o)}</h1>
            <p className="mt-5 max-w-[52ch] text-lg text-ink-muted">{m.home_lead({}, o)}</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <a href="#services" className="btn-primary">
                {m.home_cta_sunday({}, o)}
              </a>
              {/* A plain link, not <Link>: Turnstile's CSP is set per page load (src/lib/csp.ts). */}
              <a href="/registration" className="btn-secondary">
                {m.reg_title({}, o)}
              </a>
            </div>
          </div>
          <figure className="relative mt-10 overflow-hidden rounded-3xl bg-lagoon md:mt-14">
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
                className="aspect-[4/3] w-full object-cover sm:aspect-[16/9]"
              />
            </picture>
            <figcaption className="absolute bottom-4 left-4 rounded-full bg-paper/95 px-4 py-2 text-sm text-ink">
              {m.home_photo_badge({}, o)}
            </figcaption>
          </figure>
        </section>

        {/* Theme of the year */}
        <section
          aria-labelledby="theme-heading"
          className="mt-16 bg-brand-deep text-paper md:mt-24"
        >
          <div className="mx-auto max-w-content px-4 py-14 text-center sm:px-6 md:py-20">
            <p className="text-sm text-gold">{m.home_theme_label({}, o)}</p>
            <h2
              id="theme-heading"
              className="mx-auto mt-4 max-w-[24ch] text-[clamp(1.875rem,4.5vw,3.25rem)] text-paper"
            >
              {m.home_theme_title({}, o)}
            </h2>
            <p className="mt-5 text-lagoon">{m.home_theme_verse({}, o)}</p>
          </div>
        </section>

        {/* Services and the week */}
        <section
          id="services"
          aria-labelledby="services-heading"
          className="mx-auto max-w-content scroll-mt-4 px-4 pt-16 sm:px-6 md:pt-24"
        >
          <SectionHeading id="services-heading" title={m.home_services_title({}, o)}>
            {m.home_services_intro({}, o)}
          </SectionHeading>
          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {services.map(([time, name, language]) => (
              <li key={name} className="rounded-2xl border border-line p-6">
                <p className="font-display text-3xl text-ink tabular-nums">{time}</p>
                <p className="mt-3 text-ink">{name}</p>
                <p className="mt-3 inline-flex rounded-full bg-lagoon px-3 py-1 text-sm text-ink">
                  {language}
                </p>
              </li>
            ))}
          </ul>

          <h3 className="mt-14 text-2xl">{m.home_week_title({}, o)}</h3>
          <dl className="mt-5 divide-y divide-line rounded-2xl bg-sand">
            {week.map(([day, time, what]) => (
              <div
                key={day}
                className="grid gap-1 px-5 py-4 sm:grid-cols-[9rem_12rem_1fr] sm:gap-4"
              >
                <dt className="text-ink">{day}</dt>
                <dd className="text-ink-muted tabular-nums">{time}</dd>
                <dd className="text-ink">{what}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* About */}
        <section
          id="about"
          aria-labelledby="about-heading"
          className="mx-auto max-w-content scroll-mt-4 px-4 pt-16 sm:px-6 md:pt-24"
        >
          <div className="grid gap-10 md:grid-cols-[1.4fr_1fr] md:gap-16">
            <div>
              <h2 id="about-heading" className="text-[clamp(2rem,5vw,3rem)]">
                {m.home_about_title({}, o)}
              </h2>
              <div className="mt-6 max-w-[62ch] space-y-4 text-ink-muted">
                <p>{m.home_about_p1({}, o)}</p>
                <p>{m.home_about_p2({}, o)}</p>
                <p>{m.home_about_p3({}, o)}</p>
              </div>
            </div>
            <aside className="relative self-start overflow-hidden rounded-3xl bg-lagoon p-6 pb-10 sm:p-8 sm:pb-12">
              <h3 className="text-2xl">{m.home_bell_title({}, o)}</h3>
              <p className="mt-3 text-ink-muted">{m.home_bell_body({}, o)}</p>
              <Wave className="pointer-events-none absolute inset-x-0 bottom-0 h-6 w-full text-brand/15" />
            </aside>
          </div>
        </section>

        {/* Ministries and HBCs */}
        <section
          id="ministries"
          aria-labelledby="ministries-heading"
          className="mx-auto max-w-content scroll-mt-4 px-4 pt-16 sm:px-6 md:pt-24"
        >
          <SectionHeading id="ministries-heading" title={m.home_ministries_title({}, o)}>
            {m.home_ministries_intro({}, o)}
          </SectionHeading>
          <ul className="mt-8 grid gap-4 sm:grid-cols-2">
            {ministries.map(([name, body, verse]) => (
              <li key={name} className="flex flex-col rounded-2xl border border-line p-6">
                <h3 className="text-2xl">{name}</h3>
                <p className="mt-3 flex-1 text-ink-muted">{body}</p>
                <p className="mt-4 text-sm text-brand">{verse}</p>
              </li>
            ))}
          </ul>

          {/* Home Based Churches, from the register's own list */}
          <div className="mt-10 rounded-3xl bg-sand p-6 sm:p-8">
            <h3 className="text-2xl">{m.home_hbc_title({}, o)}</h3>
            <p className="mt-3 max-w-[62ch] text-ink-muted">{m.home_hbc_intro({}, o)}</p>
            {hbcs.length > 0 && (
              <ul className="mt-5 flex flex-wrap gap-2">
                {hbcs.map((hbc) => (
                  <li key={hbc.id} className="rounded-full bg-paper px-4 py-1.5 text-ink">
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
          className="mx-auto max-w-content px-4 pt-16 sm:px-6 md:pt-24"
        >
          <div className="relative grid gap-8 overflow-hidden rounded-3xl bg-lagoon p-6 pb-12 sm:p-10 sm:pb-14 md:grid-cols-2 md:items-center">
            <div>
              <h2 id="register-heading" className="text-[clamp(1.875rem,4vw,2.75rem)]">
                {m.home_register_title({}, o)}
              </h2>
              <p className="mt-4 text-ink-muted">{m.reg_intro({}, o)}</p>
              <a href="/registration" className="btn-primary mt-6">
                {m.reg_title({}, o)}
              </a>
            </div>
            <ol className="space-y-5">
              {steps.map(([title, body], i) => (
                <li key={title} className="flex gap-4">
                  <span
                    aria-hidden="true"
                    className="font-display text-2xl leading-none text-brand tabular-nums"
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
          className="mx-auto max-w-content scroll-mt-4 px-4 pt-16 sm:px-6 md:pt-24"
        >
          <SectionHeading id="visit-heading" title={m.home_visit_title({}, o)} />
          <div className="mt-8 grid gap-4 md:grid-cols-[1fr_1.35fr_1fr]">
            <div className="rounded-2xl border border-line p-6">
              <h3 className="text-xl">{m.home_visit_where({}, o)}</h3>
              <p className="mt-3 text-ink-muted">{m.home_visit_address({}, o)}</p>
              <p className="mt-4">
                <a
                  href="https://www.google.com/maps/search/?api=1&query=ACK+Emmanuel+Kengeleni+Church"
                  rel="noopener"
                >
                  {m.home_visit_map({}, o)}
                </a>
              </p>
            </div>
            <div className="rounded-2xl border border-line p-6">
              <h3 className="text-xl">{m.home_visit_office({}, o)}</h3>
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
                <li>P.O. Box 85010-80100, Mombasa</li>
              </ul>
            </div>
            <div className="rounded-2xl border border-line p-6">
              <h3 className="text-xl">{m.home_visit_follow({}, o)}</h3>
              <ul className="mt-3 space-y-2">
                <li>
                  <a href="https://www.facebook.com/profile.php?id=100069793723070" rel="noopener">
                    {m.home_visit_facebook({}, o)}
                  </a>
                </li>
                <li>
                  <a href="https://www.youtube.com/@ACKCONTROLROOM/streams" rel="noopener">
                    {m.home_visit_youtube({}, o)}
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

function SectionHeading(props: { id: string; title: string; children?: string }) {
  return (
    <div className="max-w-2xl">
      <h2 id={props.id} className="text-[clamp(2rem,5vw,3rem)]">
        {props.title}
      </h2>
      {props.children && <p className="mt-3 text-lg text-ink-muted">{props.children}</p>}
    </div>
  );
}
