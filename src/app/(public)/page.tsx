import { getLocale } from "@/app/_lib/i18n";
import { SiteHeader } from "@/components/site-header";
import { Wave } from "@/components/wave";
import { m } from "@/paraglide/messages";

/**
 * Landing page. For now: who we are, and the way into registration. Service times, programmes
 * and HBC zones come with the church's content (#28).
 */
export default async function LandingPage() {
  const locale = await getLocale();
  const o = { locale };
  const steps = [
    [m.landing_step1_title({}, o), m.landing_step1_body({}, o)],
    [m.landing_step2_title({}, o), m.landing_step2_body({}, o)],
    [m.landing_step3_title({}, o), m.landing_step3_body({}, o)],
  ] as const;
  return (
    <>
      <SiteHeader locale={locale} />
      <main id="main" className="mx-auto max-w-content px-4 pt-8 sm:px-6 md:pt-16">
        <div className="grid gap-10 md:grid-cols-[1.15fr_1fr] md:items-center md:gap-16">
          <div>
            <p className="text-sm text-brand">{m.landing_eyebrow({}, o)}</p>
            <h1 className="mt-4 text-[clamp(2.5rem,7vw,4.25rem)]">{m.landing_welcome({}, o)}</h1>
            <p className="mt-5 max-w-[46ch] text-lg text-ink-muted">{m.landing_lead({}, o)}</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              {/* A plain link, not <Link>: Turnstile's CSP is set per page load (src/lib/csp.ts). */}
              <a href="/registration" className="btn-primary">
                {m.reg_title({}, o)}
              </a>
              <a href="/privacy" className="btn-text">
                {m.landing_privacy_cta({}, o)}
                <span aria-hidden="true">→</span>
              </a>
            </div>
          </div>

          <section
            aria-labelledby="steps-heading"
            className="relative overflow-hidden rounded-3xl bg-lagoon p-6 sm:p-8"
          >
            <h2 id="steps-heading" className="text-3xl">
              {m.landing_steps_title({}, o)}
            </h2>
            <ol className="mt-6 space-y-5">
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
          </section>
        </div>

        <p className="mt-12 rounded-2xl bg-sand px-5 py-4 text-ink-muted md:mt-20">
          {m.landing_preparing({}, o)}
        </p>
      </main>
    </>
  );
}
