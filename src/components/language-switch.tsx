import { setLanguage } from "@/app/_actions/set-language";
import { locales, type Locale } from "@/i18n/locale";
import { m } from "@/paraglide/messages";

// Each language is named in its own language, whatever the page language is.
const LABELS = { en: m.language_en, sw: m.language_sw } satisfies Record<Locale, unknown>;

/** Language switch shown on every public page (NFR-5). A server component: no client JS. */
export function LanguageSwitch({ locale }: { locale: Locale }) {
  return (
    <form action={setLanguage} className="flex items-center gap-2">
      <span id="language-switch-label" className="sr-only">
        {m.language_switch_label({}, { locale })}
      </span>
      <div role="group" aria-labelledby="language-switch-label" className="flex gap-2">
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
              className={
                current
                  ? "min-h-12 min-w-12 rounded-md bg-brand px-3 font-semibold text-paper"
                  : "min-h-12 min-w-12 rounded-md border border-line px-3 text-brand hover:bg-cream"
              }
            >
              {LABELS[option]({}, { locale: option })}
            </button>
          );
        })}
      </div>
    </form>
  );
}
