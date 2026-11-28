---
name: ACK Emmanuel Freretown - Kengeleni
description: A parish site set like a fine printed programme. Serif titles on white, Signal Blue for action, one Black.
colors:
  paper: "#FFFFFF"
  cloud: "#F6F6F6"
  mist: "#EDF2FF"
  brand: "#0B5CFF"
  brand-deep: "#0841B8"
  night: "#111111"
  night-soft: "#2C2C2C"
  sky: "#B9B9B9"
  gold: "#E0A63A"
  ink: "#111111"
  ink-muted: "#5E5E5E"
  line: "#E8E8E8"
  line-strong: "#858585"
  error: "#B42318"
  success: "#1E7A46"
typography:
  display:
    fontFamily: "Instrument Serif, Georgia, Times New Roman, serif"
    fontSize: "clamp(2.875rem, 1.7rem + 5.2vw, 5.75rem)"
    fontWeight: 400
    lineHeight: 1.02
    letterSpacing: "-0.024em"
  title:
    fontFamily: "Instrument Serif, Georgia, Times New Roman, serif"
    fontSize: "clamp(2.25rem, 1.7rem + 2.4vw, 3.75rem)"
    fontWeight: 400
    lineHeight: 1.06
    letterSpacing: "-0.018em"
  subtitle:
    fontFamily: "Instrument Serif, Georgia, Times New Roman, serif"
    fontSize: "clamp(1.5rem, 1.4rem + 0.45vw, 1.8125rem)"
    fontWeight: 400
    lineHeight: 1.18
    letterSpacing: "-0.008em"
  lead:
    fontFamily: "Instrument Sans, system-ui, sans-serif"
    fontSize: "clamp(1.125rem, 1.08rem + 0.2vw, 1.25rem)"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "-0.012em"
  body:
    fontFamily: "Instrument Sans, system-ui, sans-serif"
    fontSize: "1.0625rem (1.125rem from sm)"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "-0.008em"
  card:
    fontFamily: "Instrument Sans, system-ui, sans-serif"
    fontSize: "body - 1px"
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: "-0.008em"
  button:
    fontFamily: "Instrument Sans, system-ui, sans-serif"
    fontSize: "body - 1px (card text - 1px inside cards)"
    fontWeight: 500
    lineHeight: 1.25
    letterSpacing: "-0.006em"
  small:
    fontFamily: "Instrument Sans, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: "-0.002em"
rounded:
  field: "12px"
  list: "16px"
  inset: "20px"
  tile: "28px"
  band: "32px"
  pill: "9999px"
spacing:
  gutter-sm: "16px"
  gutter-md: "24px"
  gutter-lg: "40px"
  tile-gap: "12px"
  tile-gap-sm: "16px"
  section: "96px"
  section-md: "144px"
  band-lead: "56px"
  band-lead-md: "96px"
components:
  button-primary:
    backgroundColor: "{colors.brand}"
    textColor: "{colors.paper}"
    typography: "{typography.button}"
    rounded: "{rounded.pill}"
    padding: "0 28px"
    height: "48px"
  button-primary-hover:
    backgroundColor: "{colors.brand-deep}"
    textColor: "{colors.paper}"
  button-dark:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    typography: "{typography.button}"
    rounded: "{rounded.pill}"
    padding: "0 28px"
    height: "48px"
  button-dark-hover:
    backgroundColor: "{colors.night-soft}"
    textColor: "{colors.paper}"
  button-secondary:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    rounded: "{rounded.pill}"
    padding: "0 28px"
    height: "48px"
  button-on-dark:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.night}"
    typography: "{typography.button}"
    rounded: "{rounded.pill}"
    padding: "0 28px"
    height: "48px"
  button-on-dark-hover:
    backgroundColor: "{colors.mist}"
    textColor: "{colors.night}"
  button-text:
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    padding: "0 8px"
    height: "48px"
  header-register:
    backgroundColor: "{colors.brand}"
    textColor: "{colors.paper}"
    typography: "{typography.button}"
    rounded: "{rounded.pill}"
    padding: "0 20px"
    height: "44px"
  field:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.field}"
    padding: "12px 16px"
    height: "56px"
  select:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.field}"
    padding: "12px 48px 12px 16px"
    height: "56px"
    width: "100%"
  select-row:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.card}"
    padding: "8px 14px"
    height: "48px"
  select-row-checked:
    backgroundColor: "{colors.mist}"
    textColor: "{colors.ink}"
  option:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.card}"
    rounded: "{rounded.field}"
    padding: "16px"
    height: "56px"
  option-checked:
    backgroundColor: "{colors.mist}"
    textColor: "{colors.ink}"
  tile-night:
    backgroundColor: "{colors.night}"
    textColor: "{colors.paper}"
    rounded: "{rounded.tile}"
    padding: "28px"
  tile-cloud:
    backgroundColor: "{colors.cloud}"
    textColor: "{colors.ink}"
    rounded: "{rounded.tile}"
    padding: "28px"
  tile-mist:
    backgroundColor: "{colors.mist}"
    textColor: "{colors.ink}"
    rounded: "{rounded.tile}"
    padding: "28px"
  verse-tile-night:
    backgroundColor: "{colors.night}"
    textColor: "{colors.paper}"
    typography: "{typography.subtitle}"
    rounded: "{rounded.inset}"
    padding: "24px"
  verse-tile-brand:
    backgroundColor: "{colors.brand}"
    textColor: "{colors.paper}"
    typography: "{typography.subtitle}"
    rounded: "{rounded.inset}"
    padding: "24px"
  verse-tile-mist:
    backgroundColor: "{colors.mist}"
    textColor: "{colors.ink}"
    typography: "{typography.subtitle}"
    rounded: "{rounded.inset}"
    padding: "24px"
  verse-tile-cloud:
    backgroundColor: "{colors.cloud}"
    textColor: "{colors.ink}"
    typography: "{typography.subtitle}"
    rounded: "{rounded.inset}"
    padding: "24px"
  band-night:
    backgroundColor: "{colors.night}"
    textColor: "{colors.paper}"
    rounded: "{rounded.band}"
    padding: "28px"
  band-brand:
    backgroundColor: "{colors.brand}"
    textColor: "{colors.paper}"
    rounded: "{rounded.band}"
    padding: "28px"
  panel-cloud:
    backgroundColor: "{colors.cloud}"
    textColor: "{colors.ink}"
    rounded: "{rounded.band}"
    padding: "28px"
  hbc-pill:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.subtitle}"
    rounded: "{rounded.pill}"
    padding: "0 20px"
    height: "48px"
  photo-frame:
    backgroundColor: "{colors.cloud}"
    rounded: "{rounded.tile}"
  notice:
    backgroundColor: "{colors.mist}"
    textColor: "{colors.ink}"
    rounded: "{rounded.field}"
    padding: "16px"
---

# Design System

Visual rules for ackemmanuelfreretown.org. Read with `PRODUCT.md`. Reference files are in `docs/design/references/`. The frontmatter above carries the same tokens in machine-readable form; `.impeccable/design.json` carries the extras (tonal ramps, shadows, motion, breakpoints, component snippets). The tables below and the frontmatter must always agree.

The public site was redesigned on 28 Nov 2026, after members found the first one "not sleek, not premium". The aim now: a parish site set like a fine printed programme. Big serif titles on pure white, one bright blue, one black.

## 1. Identity

- **Crest.** The Diocese of Mombasa coat of arms: bishop's mitre with gold lappets above a shield with the red cross of St George on silver, over a blue sea bearing a gold anchor and crozier. The scan in `docs/design/references/diocese-crest-scan.jpg` is a placeholder only: its colours are faded and the edges are soft. Obtain the official vector (SVG or high-resolution PNG) from the Diocese office and confirm the parish may use it. Do not trace, redraw or recolour the crest. The one exception is the placeholder below, whose faded colour was lifted slightly until the official file replaces it (#87).
- **Parish lockup.** Crest at small size beside "ACK Emmanuel" in Instrument Serif (22px), with "Freretown - Kengeleni" beneath in small muted text (`src/components/site-header.tsx`). The footer repeats it larger on Black, with the full parish name in the serif (`src/components/site-footer.tsx`). Until the official file arrives, the site uses `src/components/crest.webp`, cut from the scan with its colour lifted slightly (#80). If the parish has its own emblem, it takes this place and the crest moves to the footer.
- **Motifs drawn from the crest**, used sparingly as lightweight SVG: the bell that gave Kengeleni its name, drawn as one gold line on Black (`BellIcon`, on the homepage's bell tile and the About page's bell band); the anchor as a small mark for "hope" and for the Freretown coast. Never use the cross or mitre as decoration.

## 2. Colour

White pages, one bright blue for every action, and one near-black for ink and dark fields. Signal Blue was chosen by the user on 26 Nov 2026 (#96): it is Zoom's blue. On 28 Nov 2026 the navy and the blue-tinted greys gave way to Kurax's near-black and neutral greys (§7), and every page background became white: registration and the status check no longer sit on a Cloud ground. The earlier palettes (Persian Blue, Vista Blue, Cornsilk in `docs/design/references/palette.jpeg`; Ocean Blue, Sand, Lagoon, #80; Midnight navy, #96) no longer appear in the interface.

The token names `night`, `night-soft` and `sky` are kept from the navy palette so the code did not have to change; their values are now neutral.

| Token | Hex | Name | Role |
|---|---|---|---|
| `--color-paper` | `#FFFFFF` | Paper | Every page background; HBC pills; text and fills on Black and Signal Blue |
| `--color-cloud` | `#F6F6F6` | Cloud | Neutral panels and tiles (the HBC panel, the mission tile, a verse tile), the ground behind a photo while it loads, "Why we ask" notes, nav and dropdown-row hover |
| `--color-mist` | `#EDF2FF` | Mist | Blue-tinted tiles, notices, selected options and the chosen dropdown row, the current step, focus halo on fields; secondary text on Signal Blue |
| `--color-brand` | `#0B5CFF` | Signal Blue | Primary buttons, links, active and done states, weekday times, timeline years, one verse tile, the registration band |
| `--color-brand-deep` | `#0841B8` | Deep Signal | Hover and pressed primary; a primary button while its post is on the way |
| `--color-night` | `#111111` | Black | The theme band, the bell tile and band, one verse tile, the form panel on registration and the status check, and the footer on every public page |
| `--color-night-soft` | `#2C2C2C` | Black soft | Hairlines on Black; the footer wordmark; hover on the ink pill |
| `--color-sky` | `#B9B9B9` | Pale grey | Secondary text and links on Black. **Never on light grounds** |
| `--color-gold` | `#E0A63A` | Crest gold | The bell and small crest details on Black. **Never text on light grounds; never off Black** |
| `--color-ink` | `#111111` | Ink | Body text and headings; the ink pill; the rule that opens a list; the current language in the switch |
| `--color-ink-muted` | `#5E5E5E` | Muted ink | Secondary text, hints, captions |
| `--color-line` | `#E8E8E8` | Hairline | Dividers and list rules (decorative) |
| `--color-line-strong` | `#858585` | Control line | Input, option, language-switch and outline-button borders; the underline of a link inside muted text |
| `--color-error` | `#B42318` | | Validation errors |
| `--color-success` | `#1E7A46` | | Confirmations |

Measured contrast (WCAG 2.2), recomputed for the values above on 28 Nov 2026:

| Pair | Ratio | Use |
|---|---|---|
| Ink on Paper / Cloud / Mist | 18.9 / 17.5 / 16.9 | Body text ✓ |
| Muted ink on Paper / Cloud / Mist | 6.5 / 6.0 / 5.8 | Secondary text ✓ |
| Signal Blue on Paper / Cloud / Mist | 5.3 / 4.9 / 4.7 | Links, times, accents ✓ |
| Paper on Signal Blue | 5.3 | Button labels, blue tiles ✓ |
| Paper on Deep Signal | 8.5 | Hover and busy labels ✓ |
| Paper on Black / Black soft | 18.9 / 14.0 | Text on dark tiles and the footer; the ink pill and its hover ✓ |
| Pale grey on Black / Black soft | 9.6 / 7.1 | Secondary text and links on dark ✓ |
| Gold on Black | 8.7 | Crest details on dark ✓ |
| Mist on Signal Blue | 4.7 | Secondary text on blue ✓ |
| Error on Paper / Mist | 6.6 / 5.9 | ✓ |
| Success on Paper | 5.3 | ✓ |
| Control line on Paper / Cloud / Mist | 3.7 / 3.4 / 3.3 | Control boundaries (WCAG 1.4.11) ✓ |
| Control line as text on Paper | 3.7 | Large text only (3:1). Used once: the muted half of the homepage story statement, at title size. ✗ Never at body size |
| Hairline on Paper / Cloud | 1.2 / 1.1 | ✗ Decoration only, never the only boundary of a control |
| Black soft on Black | 1.4 | ✗ Decoration only: hairlines and the footer wordmark, which is hidden from screen readers |
| Signal Blue on Black | 3.6 | ✗ Never text on Black: use Pale grey or Paper |

Rules:
- **The White Page Rule.** Every page background is Paper. A section is set apart by space, a hairline or a whole coloured field, never by tinting the page behind it.
- **The Committed Field Rule.** Colour arrives as whole fields at page scale (the Black theme band and bell tile, the verse tiles, the Cloud HBC panel, the Signal Blue registration band, the Black footer), not as scattered accents on white. Between them, sections breathe on white with hairlines.
- **The One Blue Pill Rule.** One solid Signal Blue pill per screen: on public pages it is the header's Register; on `/registration` and the status check it is the form's `btn-primary`, and the header's Register turns into an outlined pill (marked as the current page on `/registration`). A public page's own main action on white is the ink pill (`btn-dark`), as in the hero's "Join us this Sunday": never a second blue one. Secondary actions are outlined pills or text links. On Black and Signal Blue, actions are paper pills (`btn-on-dark`), never blue on blue or blue on Black.
- **The Black Text Rule.** On Black, text is Paper or Pale grey and details are Gold. Signal Blue is never text there (3.6:1). Pale grey and Gold never appear on light grounds.
- **The Always-Dark Footer Rule.** The footer is Black on every public page, registration included.
- Status is never shown by colour alone: always an icon and words.
- Light theme only in Release 1 (outdoor readability). Tokens are CSS variables in `src/app/globals.css` (`@theme`, with Tailwind's default palette removed), so a dark theme can be added later.
- Automated contrast checks (axe in Playwright) run on every public page.

## 3. Typography

- **One family, two cuts: Instrument Serif for every title, Instrument Sans for every other word.** Chosen by the user on 28 Nov 2026 from a shortlist of "Instrument Serif + X" pairings; Inter, used before (#96), was judged too common. The serif ships in one weight, 400, so titles are 400. The sans is 400 for text and 500 for buttons and the chosen dropdown row, nothing else. Straight only: no italics, and faked bold or italic is turned off (`font-synthesis: none`).
- Self-hosted with `next/font/local` (`src/app/(public)/fonts.ts`): one serif file and one variable sans file (400–500), each a Google Fonts subset to the characters English and Kiswahili use, about 28 KB together, preloaded with `font-display: swap` and a size-matched fallback. Kerning is kept in both; the sans keeps tabular figures, which the serif does not have. Licence in `src/app/fonts/README.md`.
- **The staff portal loads both files too** (`src/app/admin/layout.tsx`). It is a tool used for hours at a desk, so its type is one step denser: body text is 16px, page titles are a fixed 36px in the serif, and tables, tiles and the navigation use Tailwind's 14px and 12px sizes. The serif is for the page title and the large figures on the overview only; card titles, labels and data are the sans.
- **The scale** (tokens in `globals.css`, used as `text-display`, `text-title` and so on). Seven steps and nothing in between; Tailwind's default sizes remain only for the staff portal's dense parts. `text-display`, `text-title` and `text-subtitle` carry the serif wherever they are used, not only on h1–h3.

| Token | Size | Face and weight | Line height | Tracking | Use |
|---|---|---|---|---|---|
| `display` | 46–92px | Serif 400 | 1.02 | −0.024em | The first title of the homepage and of About |
| `title` | 36–60px | Serif 400 | 1.06 | −0.018em | Section titles (h2), page titles on the form pages, the story statement, timeline years, the reference number |
| `subtitle` | 24–29px | Serif 400 | 1.18 | −0.008em | Card and tile titles, sub-sections, registration questions, written-out verses, HBC names, day names |
| `lead` | 18–20px | Sans 400 | 1.5 | −0.012em | The paragraph under a title; a service's name beside its time |
| `body` | 17px, 18px from `sm` | Sans 400 | 1.6 | −0.008em | Running text (never below 16px) |
| `card` | body − 1px | Sans 400 | 1.55 | −0.008em | Text inside cards, tiles and panels |
| `button` | body − 1px | Sans 500 | 1.25 | −0.006em | Button labels; inside a card (`.in-card`) card text − 1px |
| `small` | 14px | Sans 400 | 1.45 | −0.002em | Verse references, the language switch, footer column titles and legal links |

- Three sizes sit outside the scale, each on purpose. Sunday service times are the serif sized from their column's width (22–52px, container units), so the longest Kiswahili time stays on one line. The footer's "Emmanuel" is sized to the page's width (decoration). The header lockup's "ACK Emmanuel" is 22px. The six-digit code field is letter-spaced (0.3em) for legibility: the one deliberate exception to tighter tracking.
- Line length 60–70 characters on wide screens; titles are held to 12–18 characters a line (`max-w-[14ch]` and the like) so they break like a printed heading. Titles balance their lines (`text-wrap: balance`); paragraphs avoid a lone last word (`text-wrap: pretty`). Test every title in both languages at 360px.
- Tabular figures, in the sans, for references, FWO numbers, phone numbers, weekday times and dates.

## 4. Layout and responsiveness

Mobile first: design at **360 × 800** before anything else.

| Breakpoint | Width | Changes |
|---|---|---|
| Base | 0–599px | Single column; tiles stack; full-width buttons; side gutter 16px |
| `sm` | 600px | Larger phones and small tablets; side gutter 24px, tile gap 16px, more generous padding |
| `md` | 900px | Lists pair in two columns; the navigation row under the lockup moves inline beside it, with the header's Register pill |
| `lg` | 1200px | The 12-column grid (32px between columns); side gutter 40px; content max width 85rem (1360px), centred |

- **The welcome** stands on white: the title in 7 columns, and in the last 4 one paragraph and one action ("Join us this Sunday", the ink pill, with a text link to the story beside it). The photo follows in its own rounded frame across the full grid (4:3 on phones, 16:9 from `sm`, 2:1 from `lg`). **The photo is never under text**, at any size. About opens the same way.
- **Each section is its own section**, 96px below the one before (144px from `md`). On the homepage: welcome; our story; Sunday services; daily activities; the theme of the year; ministries; Home Based Cells; registration; visit and contact. A section opens with its title in 7 columns and a line about it in the last 4. Two exceptions to the spacing: a Black band sits 56px (96px from `md`) below the section before it, and the Signal Blue registration band sits one tile gap under the Cloud HBC panel, so the two read as a pair.
- **Lists are ruled like a programme.** A list opens with one ink rule and its rows are parted by hairlines (services, ministries, the contact list, beliefs); blocks in a grid each carry a hairline on top (days, values) or an ink rule (the timeline). No cards inside cards.
- **The Unbreakable Time Rule.** Service and weekday times never wrap (`whitespace-nowrap`). In the Sunday timetable each time's column is a container and the time is sized from its width (`cqi`), so the longest Kiswahili time fits on one line at 360px; with enlarged text a range can only fold at its dash. From `md` the time takes 7 parts and the service's name 5. Daily activities are a block per day (day, time, what happens): one column, two from `md`, three by two from `lg`, never a seven-column strip. Test both languages at 360px.
- **Forms stay single column at every size.** On `/registration` and the status check a Black panel (28px radius, 32px from `lg`) carries the page title and what the form is for; the question stands beside it on the white page with no box around it. From `lg` the panel takes 5 columns, is sticky and as tall as the screen, and the question takes 6. On phones the panel opens the page and, once the member is past the first step, shrinks to its title alone, so the question is never pushed off the first screen. Narrow forms keep the 34rem form width; legal pages the 42rem prose width.
- **The staff portal has its own frame** (`StaffShell`, `src/app/admin/_components/staff-shell.tsx`). From `md` a Cloud panel (24px radius, 280px wide, sticky) down the left holds the parish name, the navigation in three groups (Registrations, Membership, Administration) and the account menu; the page stands on white beside it, left-aligned. Below `md` the same links sit in one row under the parish name that scrolls sideways: nothing hides behind a menu button. The current section is a Black pill; Signal Blue stays for the page's main action. The overview (`/`) is a 12-column grid of flat 24px-radius tiles: one Black tile for what needs doing first (registrations waiting for review, or the officer's own desk), Cloud tiles for figures and charts, a white hairline tile for a table. Charts are drawn on the server in plain boxes, every figure written beside its mark, with a table for screen readers; self-registration is Black and the desk Signal Blue, always named in words.
- **shadcn/ui is the staff portal's component kit** (`src/components/ui`, `components.json`): Card, Badge, Table and DropdownMenu so far, each rewritten in this file's tokens, shapes and type. Add others with `pnpm dlx shadcn@latest add <name>` and re-theme them the same way; never bring in shadcn's own colour variables. The portal has its own stylesheet (`src/app/admin/staff.css`); the public one (`src/app/(public)/site.css`) leaves the portal's classes out. Public pages don't import from `src/components/ui`: anything with client JavaScript there would break the 200 KB budget (§6), so they keep the hand-made controls.
- Touch targets at least 44 × 44px, and primary controls (buttons, inputs, options, dropdown rows) at least 48px tall. A small control may look smaller if its tap area still reaches 44px: the language switch is a 32px pill whose buttons each take 44 × 44px. Leave 8px between separate targets.
- Shapes: pill buttons and HBC names (`rounded-full`); 12px on inputs, options and notices; 16px on review lists, the reference panel and the open dropdown; 20px on verse tiles, a photo inside a band, and the hero photo on phones; 28px on tiles, photo frames, the question card, the step rail and the help panel; 32px on bands and the HBC panel.
- Tiles are 12px apart (16px from `sm`), padded 28px (40px from `sm`). Bands are padded 28px, 48px from `sm`, 64px from `lg`.
- Respect `prefers-reduced-motion`; motion is subtle and never blocks input (§8).
- Safe-area padding for phones with notches (`viewport-fit=cover`).
- Test viewports in Playwright: 360×800 (low-end Android), 375×667 (small iPhone), 768×1024 (tablet), 1280×800 (laptop).

## 5. Imagery

- Real photographs of this congregation, the church building and Mombasa, used with consent. No stock photos of strangers.
- **The hero photo** (D46): one photograph of the church building with no people in it, on top of the 200 KB budget. WebP, one file per screen class chosen by CSS width: at most 35 KB on phones (up to 600px), 60 KB on tablets (up to 1100px) and 110 KB on laptops and larger. Serve it with `<picture>` and `media` sources, not `srcset` width descriptors, so a high-density phone still gets the phone file. It is the only photo that loads eagerly. About opens with the same photo, served the same way.
- **Further photos below the first screen** (D46 as amended, 28 Nov 2026), on the homepage and About: each loads lazily, is at most 50 KB, and is never part of the first-load budget. Use `src/components/photo.tsx`. At present they are crops of the one church photo (`arches-720.webp`, `front-640.webp`), to be replaced by the parish's own photographs: replace the files in `src/app/(public)/images/`, keeping each name and its rough shape.
- **The Framed Photo Rule.** A photo sits in its own rounded frame (28px; 20px for the hero on phones and inside a band) on a Cloud ground that shows while it loads. No text, gradient or badge is ever laid over it.
- Registration, the status check and voting carry no photographs.
- Images are pre-optimised and served as static files with plain `<img>` (no `next/image` on Cloudflare).

## 6. Page character

| Page | Character |
|---|---|
| Landing `/` | A printed programme: generous white, big serif titles. The welcome with one action (Register lives in the header), then the photo; our story as one statement at title size, with a photo beside the Black bell tile; the Sunday timetable; daily activities; the theme of the year on a Black band with its verse written out; a row per ministry with its verse on a toned tile; the HBCs on a Cloud panel; the Signal Blue registration band with three numbered steps; visit and contact |
| About `/about` | The same voice, slower. Title and photo; the story; four dated steps; the bell on a Black band; the building; the parish today with mission and vision tiles; values; beliefs; a Signal Blue band back to Sunday services |
| Registration `/registration` | Quiet and reassuring. One question per step on mobile, a visible progress indicator, plain words, a "Why we ask" note beside phone and consent |
| Status `/registration/status` | Minimal: phone, FWO, code, answer |
| Vote `/vote` | Calm and unmistakable. Schedule when closed; when open, one position per screen, a review screen, then a clear "Your vote has been recorded" |
| Admin | Dense but legible; built for officers on phones at a desk. Not a generic SaaS dashboard. System sans throughout |

## 7. Inspiration and what we take from it

- **tihada.com.** Kenyan identity through a local skyline silhouette; "how it works" as short numbered steps; plain promises such as "no account needed"; FAQ in everyday language. *Take:* "Register in 3 steps"; plain reassurances. Its typeface, Inter, was taken in #96 and is no longer used (§3).
- **ardia.dev.** Warm paper-toned background; one painterly illustration that gives the site a personality; an honest FAQ ("Fair questions") and plainly written privacy notes. *Take:* the honesty of its notes and a "Fair questions" section on registration: why we need your phone number, where your details are stored, who can see them. Not its illustration: photographs are our only imagery (D46, §5).
- **kurax.vercel.app** (the main reference, #80, kept in #96 and again on 28 Nov 2026). Clean white space, large serif titles over a plain sans, a near-black for ink and dark fields, pill buttons, hairline borders, bold coloured tiles. *Take:* that restraint and rhythm, and now also its serif-title-over-sans pairing and its near-black, with Signal Blue in place of its purple. Plain numerals (1, 2, 3) only where the sequence matters, such as the registration steps; never zero-padded counters as decoration. Not its fintech imagery, mock-ups or copy.
- **siteinspire.com.** A gallery to browse. When a site is used as a reference, add it here with one line on what specifically to take from it.

Take ideas, not assets: no copying another site's illustrations, layouts or copy.

## 8. Components

The shared controls are classes in `src/app/globals.css` (`@layer components`). Use them; don't restyle a control locally. The rules they follow are in §2 (one blue pill per screen, Black text) and §4 (shapes and target sizes); this section records what each looks like and its states.

| Class | What it is | States |
|---|---|---|
| `btn-primary` | Solid Signal Blue pill, 48px tall, with a paper label: the action the step exists for | Hover and pressed: Deep Signal. Busy: Deep Signal at full strength with a spinner. Disabled: 60% opacity, not-allowed cursor. Focus: the 3px brand outline |
| `btn-dark` | Solid ink pill with a paper label: a public page's main action on white, where the header already holds the one blue pill | Hover and pressed: Black soft. Busy and focus as primary |
| `btn-secondary` | Paper pill with a Control line border and an ink label | Hover: ink border. Disabled and focus as primary |
| `btn-on-dark` | Paper pill with a Black label, for Black and Signal Blue fields | Hover: Mist fill. Focus: the outline turns paper |
| `btn-text` | Label only, 48px tall, for "Back" and low-stakes actions | Hover: Signal Blue |
| `field` | Text input: 56px tall, 12px radius, Control line border, ink text, muted placeholder | Hover: ink border. Focus: brand border, a 4px Mist halo and the outline. `aria-invalid="true"`: error border, with the message below in error red |
| `select` | The dropdown: the field's shape, as wide as its column, with the page's own arrow at its right edge; a long choice is cut with an ellipsis | As `field`. The open list: see below |
| `option` | Radio or checkbox card: the whole card is the target | Hover: ink border. Checked: brand border on Mist |
| `spinner` | A ring in the current colour with one clear quarter, about 1.1em | Spins; holds still at 60% under reduced motion |

- **The Answered Press Rule.** Every button settles by 2% while pressed (150ms). A submit button shows a spinner and `aria-busy` while its own server action posts; the other buttons are disabled and the question dims to 55% so nothing is sent twice. Links into `/registration` use `PendingLink` (`src/components/pending-link.tsx`), still a plain `<a>` for Turnstile's CSP, which shows a spinner until the next page arrives and clears it on Back. The language switch shows a spinner in place of the chosen code, keeping the pill's width. Without JavaScript all of these are ordinary links and buttons.
- **The dropdown's list.** Where the browser can style the list itself (`appearance: base-select`), it opens as a Paper panel as wide as the field: 16px radius, a hairline border, a soft shadow, at most 24rem or 60% of the screen tall. Rows are 48px with card-size text; hover and keyboard focus turn a row Cloud; the chosen row is Mist, in 500, with a Signal Blue tick at its end. Elsewhere the phone's or computer's own list opens, which members already know. No JavaScript either way. The officer desk uses the same class.
- **Header Register pill** (`src/components/site-header.tsx`): from `md`, the site's one solid Signal Blue pill, 44px tall (a navigation control, so the 44px target rule applies rather than the 48px primary-control height), beside the navigation. On `/registration` and the status check it is outlined in Signal Blue (with `aria-current="page"` on `/registration`). On phones it is a blue underlined link at the end of the navigation row.
- **Header navigation:** plain links with no JavaScript, in muted ink at weight 400, turning ink with a Cloud pill behind on hover from `md`; the current page (About) is ink. About is its own page; the other links go to the homepage's sections. On phones they sit in a row under the lockup that wraps rather than scrolls. Links to `/registration` are plain `<a>`, never `<Link>` (Turnstile's CSP, see CLAUDE.md).
- **Language switch** (`src/components/language-switch.tsx`): a small two-part pill with a Control line border that looks 32px tall, while each button's tap area reaches 44 × 44px (§4). The current language is an ink fill with paper text. The visible codes "EN"/"SW" stay in each button's accessible name with the full name ("SW Kiswahili"), so voice control can say what it sees.
- **Tiles and bands:** no border. Tiles are 28px radius; bands and the HBC panel 32px (padding in §4). Black fields carry paper headings and Pale grey text, with Black soft hairlines and the gold bell; Signal Blue fields carry paper headings and Mist text, with rules in paper at 25%; Mist and Cloud fields carry ink and muted ink. Lists inside a field use hairlines, not nested cards. Tile titles use the `subtitle` step and tile text the `card` step, always smaller than the section title above them.
- **Sunday timetable:** an ink rule, then hairline rows on white: the time in the serif (never breaking inside a time), then the service's name in muted ink at `lead` size. No language chips: each name already says its language.
- **Ministry rows:** a row each under an ink rule: the name (`subtitle`, with its full name beneath in muted card text), what it is and who meets when, and the verse written out in the serif on a 20px-radius tile with its reference in small text below. The tiles run Black, Signal Blue, Mist, Cloud in order; the reference is Pale grey, Mist, Signal Blue and Signal Blue.
- **HBC pills:** each Home Based Cell's name in the serif (`subtitle`) on a Paper pill, 48px tall (56px from `sm`), on the Cloud panel. They are names, not links or buttons.
- **Numbered steps and dated steps:** the three registration steps carry a plain numeral in the serif beside each title, on the Signal Blue band. The About timeline's four steps each open with an ink rule and the year at `title` size in Signal Blue. Numbers appear only where the sequence is the information (§7).
- **Photo frames:** §5. `src/components/photo.tsx` for every photo below the first screen.
- **The question:** on self-registration there is one question to a screen, set at the `title` step in the serif, under "Step N of M" in Signal Blue and a bar of eight thin segments (Signal Blue done, Hairline to come), at every size. The status check, with two questions on its first step, keeps them at the `subtitle` step. No card: the open dropdown is the only raised surface. Everything else is flat; depth comes from field colour, not shadow.
- **The member's card:** on the Black panel from `lg`, every step by name on Black soft hairlines: done steps show a check on a Signal Blue disc with the member's own answer beside it in Pale grey (cut with an ellipsis), the current step a paper disc, later steps a Black soft ring and Pale grey text. The card fills in as the member goes, so the review holds no surprises. The status check's panel carries the gold bell instead.
- **Help:** a Cloud panel (20px radius) under the question at every size, with the church office's number as an ink link underlined in Control line. On the homepage, "Follow us" is two Cloud tiles (20px radius, 64px tall or more), each a whole link: the network's mark on a paper disc, its name, an arrow; the tile turns Black under the pointer.
- **Notices:** Mist panels with ink text and a Signal Blue info icon. A field's error is a message in error red under the field with an alert icon; an error for the whole form is a lightly red-tinted panel with a red border and `role="alert"`. "Why we ask" notes are disclosures on Cloud with a hairline border and a blue plus that turns to a cross. The words always say what went wrong, never colour alone.
- **Links inside muted text** are ink, underlined in Control line, turning Signal Blue on hover. Contact links are ink with no underline, 44px tall, blue on hover.
- **Footer** (`src/components/site-footer.tsx`): Black. The lockup with the full parish name and a line about the parish; three link columns (the site, members, the church office) with small Pale grey titles and paper links that turn Pale grey on hover; then the word "Emmanuel" in the serif, as wide as the page, in Black soft: decoration, hidden from screen readers; then a Black soft rule, the copyright line and the legal links in small Pale grey.
- **Icons:** drawn by hand as inline SVG on a 24px grid with a 1.75 stroke, round caps and joins, in the current colour, `aria-hidden` beside words that carry the meaning. The bell (§1) is drawn the same way, larger. No icon library, no icon font, no emoji or unicode glyphs as icons.
- **Motion:** the one authored moment is the first photo settling, on the homepage and About: its frame rises 14px into place (`tile-rise`, 700ms, `cubic-bezier(0.16, 1, 0.3, 1)`) while the photo eases from a 6% zoom (`photo-settle`, 1400ms). Transform only, so nothing ever starts hidden; all of it, spinners included, stops under reduced motion. Elsewhere motion is state feedback only (150–300ms colour and press transitions).

## 9. Design tools

Impeccable (`.claude/skills/impeccable/`, #85) is the design skill for this site. It can send work to its own online service, so:

- **Point it only at public pages showing synthetic data:** the homepage, About, registration, status and vote with test data. Never at the staff portal (`admin.`), the officer desk, or any page or screenshot that could show a member's name, phone number or FWO number (CLAUDE.md rule 2).
- **Saved reports and telemetry stay off.** `.impeccable/config.json` (committed) sets `reports.enabled: false`, so critiques and audits are never uploaded with their screenshots, and `telemetry: false`. Don't change them: the service has no data processing agreement with the church.
- Image generation (`generate-image --ref`) takes a screenshot as a reference: the same rule applies to what that screenshot shows.

## 10. Design rules

The user's rules for every screen (#96). Check each change against them, in review as well as in the build. The second column says how this codebase keeps each one.

| # | Rule | How we keep it |
|---|---|---|
| 1 | Use a small, consistent type scale. | Seven tokens in `globals.css` (§3); no arbitrary `text-[…]` sizes on public pages, except the three named in §3: the service times' container sizing, the footer wordmark and the header lockup |
| 2 | Make card titles smaller than section titles. | Section titles `text-title`; card and tile titles `text-subtitle` |
| 3 | Use 400 for body text and 400 or 500 for titles. | Titles are Instrument Serif 400, its only weight. Text is Instrument Sans 400, with 500 for buttons. The staff portal uses the same two faces |
| 4 | Straight titles. No italics. | No italic files; `font-synthesis: none`; `font-style: normal` on h1–h3 |
| 5 | Card text, 1px smaller than similar text outside cards. | `text-card` = body − 1px inside cards, tiles and panels |
| 6 | Button text, 1px smaller than the surrounding text. | `text-button` = body − 1px; inside `.in-card` it is card text − 1px |
| 7 | The larger the font, the tighter the letter spacing. | Within each cut: the serif runs from −0.008em (`subtitle`) to −0.024em (`display`); the sans from −0.002em (`small`) to −0.012em (`lead`) |
| 8 | Tight line height on large titles. | 1.02 on `display`, 1.06 on `title`, 1.18 on `subtitle` |
| 9 | Leave breathing room between sections. | 96px between sections, 144px from `md` (§4) |
| 10 | Balance titles that span multiple lines. No orphan words on the last line. | `text-wrap: balance` on h1–h3; `text-wrap: pretty` on paragraphs |
| 11 | Remove decorative labels, badges, and redundant buttons. | No eyebrows or kickers, no photo badge, no language chips, no second Register in the hero (the header has it) |
| 12 | One sans serif for body text and a single family for all titles. | Instrument Sans for body text, Instrument Serif for all titles: one family |
| 13 | Real, high-quality photos are better. | Real photographs of this church only, with consent (§5): for now crops of the one church photo, until the parish supplies its own. No stock, no illustration standing in |
