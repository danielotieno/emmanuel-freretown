import { setLanguage } from "@/app/_actions/set-language";
import { locales, type Locale } from "@/i18n/locale";
import { m } from "@/paraglide/messages";

// Each language is named in its own language, whatever the page language is.
const NAMES = { en: m.language_en, sw: m.language_sw } satisfies Record<Locale, unknown>;
// The short visible label: a quiet pill, not two big buttons.
const SHORT = { en: m.language_en_short, sw: m.language_sw_short } satisfies Record<
  Locale,
  unknown
>;

/**
 * Language switch shown on every public page (NFR-5): a small two-part pill. A server component
 * posting a plain form, so it works without JavaScript. The visible label is the short code and
 * stays in the accessible name ("SW Kiswahili"), so voice control can say what it sees (WCAG
 * 2.5.3). The pill looks 32px tall, but each button's tap area reaches 44 × 44px (#80).
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
              className={`relative min-h-8 min-w-11 rounded-full px-2.5 before:absolute before:-inset-y-1.5 before:inset-x-0 before:content-[''] ${
                current ? "bg-ink text-paper" : "text-ink-muted hover:text-ink"
              }`}
            >
              {SHORT[option]({}, { locale: option })}
              <span className="sr-only"> {NAMES[option]({}, { locale: option })}</span>
            </button>
          );
        })}
      </div>
    </form>
  );
}
