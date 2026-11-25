# Messages

All member-facing text, in English (`en.json`) and Kiswahili (`sw.json`). Compiled by Paraglide into `src/paraglide/` (generated, not committed) with `pnpm gen`.

- Every key goes in `en.json`. Kiswahili is optional (D44): add the key to `sw.json` when you have a translation; without one, Paraglide shows the English text.
- The current Kiswahili strings are drafts and have **not** been reviewed by a fluent speaker. A review (#29) is welcome but no longer blocks go-live.
- Call messages with an explicit locale on the server: `m.landing_welcome({}, { locale })`. Get `locale` from `getLocale()` in `src/app/_lib/i18n.ts`.
