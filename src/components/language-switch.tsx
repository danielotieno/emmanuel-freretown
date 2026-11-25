import { setLanguage } from "@/app/_actions/set-language";
import { locales, type Locale } from "@/i18n/locale";
import { m } from "@/paraglide/messages";

// Each language is named in its own language, whatever the page language is.
const NAMES = { en: m.language_en, sw: m.language_sw } satisfies Record<Locale, unknown>;
// The short visible label: a quiet pill, not two big buttons.
const SHORT = { en: "EN", sw: "SW" } satisfies Record<Locale, string>;

/**
 * Language switch shown on every public page (NFR-5): a small two-part pill. A server component
 * posting a plain form, so it works without JavaScript. Each button's accessible name is the
 * language's full name ("English", "Kiswahili"); the visible label is its short code.
 */
export function LanguageSwitch({ locale }: { locale: Locale }) {
  return (
    <form action={setLanguage}>
      <span id="language-switch-label" className="sr-only">
        {m.language_switch_label({}, { locale })}
      </span>
      <div
        role="group"
        aria-labelledby="language-switch-label"
        className="flex rounded-full border border-line-strong p-0.5 text-sm"
      >
        {locales.map((option) => {
          const current = option === locale;
          return (
            <button
              key={option}
              type="submit"
              name="locale"
              value={option}
              lang={option}
              aria-pressed={current}
              title={NAMES[option]({}, { locale: option })}
              className={
                current
                  ? "min-h-8 min-w-10 rounded-full bg-ink px-2.5 text-paper"
                  : "min-h-8 min-w-10 rounded-full px-2.5 text-ink-muted hover:text-ink"
              }
            >
              <span aria-hidden="true">{SHORT[option]}</span>
              <span className="sr-only">{NAMES[option]({}, { locale: option })}</span>
            </button>
          );
        })}
      </div>
    </form>
  );
}
