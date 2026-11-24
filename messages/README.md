# Messages

All member-facing text, in English (`en.json`) and Kiswahili (`sw.json`). Compiled by Paraglide into `src/paraglide/` (generated, not committed) with `pnpm gen`.

- Add every key to both files. A key missing from `sw.json` falls back to English, which is a bug on a public page.
- Kiswahili text must be reviewed by a fluent member of the congregation before go-live (NFR-5). The current Kiswahili strings are drafts and have **not** been reviewed.
- Call messages with an explicit locale on the server: `m.landing_welcome({}, { locale })`. Get `locale` from `getLocale()` in `src/app/_lib/i18n.ts`.
