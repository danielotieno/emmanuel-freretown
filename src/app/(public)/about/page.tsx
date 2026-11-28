import type { Metadata } from "next";
import Link from "next/link";
import { getLocale } from "@/app/_lib/i18n";
import { ArrowIcon, BellIcon } from "@/components/icons";
import { Photo } from "@/components/photo";
import { SiteHeader } from "@/components/site-header";
import { m } from "@/paraglide/messages";
import arches from "../images/arches-720.webp";
import church1440 from "../images/church-1440.webp";
import church640 from "../images/church-640.webp";
import church960 from "../images/church-960.webp";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return {
    title: `${m.nav_about({}, { locale })} · ${m.site_name({}, { locale })}`,
    description: m.about_meta_description({}, { locale }),
  };
}

/**
 * About us: the history of Emmanuel Church at Kengeleni, the bell, the building, the parish
 * today, and what it holds to. Content from the church's earlier site, without clergy or the
 * names of living people. Static text: no database, no client JavaScript of its own.
 */
export default async function AboutPage() {
  const locale = await getLocale();
  const o = { locale };
  const timeline = [
    [
      m.about_timeline_1_when({}, o),
      m.about_timeline_1_title({}, o),
      m.about_timeline_1_body({}, o),
    ],
    [
      m.about_timeline_2_when({}, o),
      m.about_timeline_2_title({}, o),
      m.about_timeline_2_body({}, o),
    ],
    [
      m.about_timeline_3_when({}, o),
      m.about_timeline_3_title({}, o),
      m.about_timeline_3_body({}, o),
    ],
    [
      m.about_timeline_4_when({}, o),
      m.about_timeline_4_title({}, o),
      m.about_timeline_4_body({}, o),
    ],
  ] as const;
  const values = [
    [m.about_value_love_title({}, o), m.about_value_love_body({}, o)],
    [m.about_value_community_title({}, o), m.about_value_community_body({}, o)],
    [m.about_value_scripture_title({}, o), m.about_value_scripture_body({}, o)],
    [m.about_value_worship_title({}, o), m.about_value_worship_body({}, o)],
    [m.about_value_service_title({}, o), m.about_value_service_body({}, o)],
    [m.about_value_excellence_title({}, o), m.about_value_excellence_body({}, o)],
  ] as const;
  const beliefs = [
    [m.about_believe_trinity_title({}, o), m.about_believe_trinity_body({}, o)],
    [m.about_believe_scripture_title({}, o), m.about_believe_scripture_body({}, o)],
    [m.about_believe_salvation_title({}, o), m.about_believe_salvation_body({}, o)],
    [m.about_believe_church_title({}, o), m.about_believe_church_body({}, o)],
  ] as const;

  return (
    <>
      <SiteHeader locale={locale} onAbout />
      <main id="main">
        {/* The title and one paragraph, then the church itself. */}
        <section aria-labelledby="about-heading" className={`${SHELL} pt-10 sm:pt-14 lg:pt-20`}>
          <div className="grid gap-7 lg:grid-cols-12 lg:items-end lg:gap-8">
            <h1 id="about-heading" className="max-w-[14ch] text-display lg:col-span-8">
              {m.about_title({}, o)}
            </h1>
            <p className="max-w-[44ch] text-lead text-ink-muted lg:col-span-4 lg:pb-3">
              {m.about_lead({}, o)}
            </p>
          </div>
          <figure className="tile-rise mt-10 overflow-hidden rounded-[1.25rem] bg-cloud sm:mt-14 sm:rounded-[1.75rem]">
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

        {/* How the church came to be */}
        <section aria-labelledby="story-heading" className={`${SHELL} ${SECTION}`}>
          <div className="grid gap-8 lg:grid-cols-12 lg:gap-8">
            <h2 id="story-heading" className="max-w-[14ch] text-title lg:col-span-5">
              {m.about_story_title({}, o)}
            </h2>
            <div className="max-w-[62ch] space-y-5 lg:col-span-6 lg:col-start-7">
              <p className="text-lead">{m.about_story_p1({}, o)}</p>
              <p className="text-ink-muted">{m.about_story_p2({}, o)}</p>
              <p className="text-ink-muted">{m.about_story_p3({}, o)}</p>
            </div>
          </div>
        </section>

        {/* The years: here the sequence is the information. */}
        <section aria-labelledby="journey-heading" className={`${SHELL} ${SECTION}`}>
          <h2 id="journey-heading" className="text-title">
            {m.about_timeline_title({}, o)}
          </h2>
          <ol className="mt-10 grid gap-x-8 md:mt-14 md:grid-cols-2 lg:grid-cols-4">
            {timeline.map(([when, title, body]) => (
              <li key={title} className="border-t border-ink pt-6 pb-10">
                <p className="text-title text-brand">{when}</p>
                <h3 className="mt-6 text-subtitle">{title}</h3>
                <p className="mt-3 max-w-[40ch] text-card text-ink-muted">{body}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* The bell that named the place, on its own band */}
        <section aria-labelledby="bell-heading" className={`${SHELL} pt-14 md:pt-24`}>
          <div className="on-dark grid gap-10 rounded-[2rem] bg-night p-7 text-paper sm:p-12 lg:grid-cols-12 lg:gap-8 lg:p-16">
            <div className="lg:col-span-6">
              <BellIcon className="h-14 w-auto text-gold" />
              <h2 id="bell-heading" className="mt-8 text-title text-paper">
                {m.about_bell_title({}, o)}
              </h2>
              <p className="mt-6 max-w-[52ch] text-card text-sky">{m.about_bell_p1({}, o)}</p>
              <dl className="mt-8 border-t border-night-soft">
                <div className="border-b border-night-soft py-5">
                  <dt className="text-subtitle text-paper">{m.about_bell_warning_title({}, o)}</dt>
                  <dd className="mt-2 max-w-[48ch] text-card text-sky">
                    {m.about_bell_warning_body({}, o)}
                  </dd>
                </div>
                <div className="border-b border-night-soft py-5">
                  <dt className="text-subtitle text-paper">{m.about_bell_call_title({}, o)}</dt>
                  <dd className="mt-2 max-w-[48ch] text-card text-sky">
                    {m.about_bell_call_body({}, o)}
                  </dd>
                </div>
              </dl>
              <p className="mt-6 max-w-[52ch] text-card text-sky">{m.about_bell_p2({}, o)}</p>
            </div>
            <figure className="overflow-hidden rounded-[1.25rem] lg:col-span-5 lg:col-start-8">
              <Photo
                image={arches}
                alt={m.home_story_photo_alt({}, o)}
                className="aspect-[4/3] size-full object-cover object-[62%_50%] lg:aspect-auto"
              />
            </figure>
          </div>
        </section>

        {/* The building, and what it was for */}
        <section aria-labelledby="building-heading" className={`${SHELL} ${SECTION}`}>
          <div className="grid gap-8 lg:grid-cols-12 lg:gap-8">
            <h2 id="building-heading" className="max-w-[14ch] text-title lg:col-span-5">
              {m.about_building_title({}, o)}
            </h2>
            <div className="max-w-[62ch] space-y-5 lg:col-span-6 lg:col-start-7">
              <p className="text-lead">{m.about_building_p1({}, o)}</p>
              <p className="text-ink-muted">{m.about_building_p2({}, o)}</p>
            </div>
          </div>
        </section>

        {/* Today, and where the parish is going */}
        <section aria-labelledby="today-heading" className={`${SHELL} ${SECTION}`}>
          <div className="grid gap-8 lg:grid-cols-12 lg:gap-8">
            <h2 id="today-heading" className="max-w-[14ch] text-title lg:col-span-5">
              {m.about_today_title({}, o)}
            </h2>
            <p className="max-w-[62ch] text-lead lg:col-span-6 lg:col-start-7">
              {m.about_today_body({}, o)}
            </p>
          </div>
          <div className="mt-10 grid gap-3 sm:gap-4 md:mt-14 md:grid-cols-2">
            <div className="rounded-[1.75rem] bg-cloud p-7 sm:p-10">
              <h3 className="text-subtitle">{m.about_mission_title({}, o)}</h3>
              <p className="mt-4 max-w-[52ch] text-card text-ink-muted">
                {m.about_mission_body({}, o)}
              </p>
            </div>
            <div className="rounded-[1.75rem] bg-mist p-7 sm:p-10">
              <h3 className="text-subtitle">{m.about_vision_title({}, o)}</h3>
              <p className="mt-4 max-w-[52ch] text-card text-ink-muted">
                {m.about_vision_body({}, o)}
              </p>
            </div>
          </div>
        </section>

        {/* What we value */}
        <section aria-labelledby="values-heading" className={`${SHELL} ${SECTION}`}>
          <h2 id="values-heading" className="text-title">
            {m.about_values_title({}, o)}
          </h2>
          <dl className="mt-10 grid gap-x-8 md:mt-14 md:grid-cols-2 lg:grid-cols-3">
            {values.map(([title, body]) => (
              <div key={title} className="border-t border-line pt-6 pb-10">
                <dt className="text-subtitle">{title}</dt>
                <dd className="mt-3 max-w-[38ch] text-card text-ink-muted">{body}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* What we believe */}
        <section aria-labelledby="believe-heading" className={`${SHELL} pt-14 md:pt-24`}>
          <div className="grid gap-8 lg:grid-cols-12 lg:gap-8">
            <h2 id="believe-heading" className="max-w-[14ch] text-title lg:col-span-5">
              {m.about_believe_title({}, o)}
            </h2>
            <dl className="border-t border-ink lg:col-span-6 lg:col-start-7">
              {beliefs.map(([title, body]) => (
                <div
                  key={title}
                  className="grid gap-x-6 gap-y-2 border-b border-line py-6 sm:grid-cols-[10rem_1fr] sm:items-baseline"
                >
                  <dt className="text-subtitle">{title}</dt>
                  <dd className="text-ink-muted">{body}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* The way on: Sunday */}
        <section aria-labelledby="next-heading" className={`${SHELL} ${SECTION}`}>
          <div className="on-dark rounded-[2rem] bg-brand px-6 py-16 text-center text-paper sm:px-12 md:py-24">
            <h2 id="next-heading" className="mx-auto max-w-[18ch] text-title text-paper">
              {m.about_next_title({}, o)}
            </h2>
            <p className="mx-auto mt-5 max-w-[40ch] text-lead text-mist">
              {m.about_next_body({}, o)}
            </p>
            <Link href="/#services" prefetch={false} className="btn-on-dark mt-9">
              {m.home_services_title({}, o)}
              <ArrowIcon />
            </Link>
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
