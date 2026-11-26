---
name: ACK Emmanuel Freretown - Kengeleni
description: The parish noticeboard online. White and Cloud pages, Signal Blue for action, Midnight fields.
colors:
  paper: "#FFFFFF"
  cloud: "#F5F7FB"
  mist: "#EDF2FF"
  brand: "#0B5CFF"
  brand-deep: "#0841B8"
  night: "#0A1433"
  night-soft: "#14224F"
  sky: "#A9C1FF"
  gold: "#E0A63A"
  ink: "#0E1525"
  ink-muted: "#535B6B"
  line: "#E4E7EE"
  line-strong: "#80889A"
  error: "#B42318"
  success: "#1E7A46"
typography:
  display:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "clamp(2.5rem, 1.75rem + 3.2vw, 4.5rem)"
    fontWeight: 500
    lineHeight: 1.04
    letterSpacing: "-0.04em"
  title:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "clamp(2rem, 1.6rem + 1.6vw, 3rem)"
    fontWeight: 500
    lineHeight: 1.1
    letterSpacing: "-0.032em"
  subtitle:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "clamp(1.25rem, 1.15rem + 0.4vw, 1.5rem)"
    fontWeight: 500
    lineHeight: 1.25
    letterSpacing: "-0.022em"
  lead:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "clamp(1.125rem, 1.08rem + 0.2vw, 1.25rem)"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "-0.014em"
  body:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "1.0625rem (1.125rem from sm)"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "-0.011em"
  card:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "body - 1px"
    fontWeight: 400
    lineHeight: 1.55
  button:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "body - 1px (card text - 1px inside cards)"
    fontWeight: 500
    lineHeight: 1.25
  small:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.45
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
  section: "80px"
  section-md: "128px"
components:
  button-primary:
    backgroundColor: "{colors.brand}"
    textColor: "{colors.paper}"
    rounded: "{rounded.pill}"
    padding: "0 28px"
    height: "48px"
  button-primary-hover:
    backgroundColor: "{colors.brand-deep}"
    textColor: "{colors.paper}"
  button-secondary:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "0 28px"
    height: "48px"
  button-on-dark:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.night}"
    rounded: "{rounded.pill}"
    padding: "0 28px"
    height: "48px"
  button-on-dark-hover:
    backgroundColor: "{colors.mist}"
    textColor: "{colors.night}"
  button-text:
    textColor: "{colors.ink}"
    padding: "0 8px"
    height: "48px"
  header-register:
    backgroundColor: "{colors.brand}"
    textColor: "{colors.paper}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0 20px"
    height: "44px"
  field:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.field}"
    padding: "12px 16px"
    height: "56px"
  option:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
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
    padding: "24px"
  tile-brand:
    backgroundColor: "{colors.brand}"
    textColor: "{colors.paper}"
    rounded: "{rounded.tile}"
    padding: "24px"
  tile-cloud:
    backgroundColor: "{colors.cloud}"
    textColor: "{colors.ink}"
    rounded: "{rounded.tile}"
    padding: "24px"
  notice:
    backgroundColor: "{colors.mist}"
    textColor: "{colors.ink}"
    rounded: "{rounded.field}"
    padding: "16px"
---

# Design System

Visual rules for ackemmanuelfreretown.org. Read with `PRODUCT.md`. Reference files are in `docs/design/references/`. The frontmatter above carries the same tokens in machine-readable form; `.impeccable/design.json` carries the extras (tonal ramps, motion, breakpoints, component snippets). The tables below and the frontmatter must always agree.

## 1. Identity

- **Crest.** The Diocese of Mombasa coat of arms: bishop's mitre with gold lappets above a shield with the red cross of St George on silver, over a blue sea bearing a gold anchor and crozier. The scan in `docs/design/references/diocese-crest-scan.jpg` is a placeholder only: its colours are faded and the edges are soft. Obtain the official vector (SVG or high-resolution PNG) from the Diocese office and confirm the parish may use it. Do not trace, redraw or recolour the crest. The one exception is the placeholder below, whose faded colour was lifted slightly until the official file replaces it (#87).
- **Parish lockup.** Crest at small size beside "ACK Emmanuel" in Inter 500, with "Freretown - Kengeleni" beneath in small muted text (`src/components/site-header.tsx`). The footer repeats it larger on Midnight, with the full parish name (`src/components/site-footer.tsx`). Until the official file arrives, the site uses `src/components/crest.webp`, cut from the scan with its colour lifted slightly (#80). If the parish has its own emblem, it takes this place and the crest moves to the footer.
- **Motifs drawn from the crest**, used sparingly as lightweight SVG: the bell that gave Kengeleni its name, drawn as one gold line on Midnight; the anchor as a small mark for "hope" and for the Freretown coast. Never use the cross or mitre as decoration.

## 2. Colour

White and Cloud pages, one bright blue for every action, and Midnight for dark fields. Chosen by the user on 26 Nov 2026 (#96), who found the earlier coastal palette (Ocean Blue, Sand, Lagoon; #80) too quiet: Signal Blue is Zoom's blue. Kurax stays the clean-UI reference (§7), with Signal Blue in place of its purple. The first palette of all (Persian Blue, Vista Blue, Cornsilk; `docs/design/references/palette.jpeg`) no longer appears in the interface.

| Token | Hex | Name | Role |
|---|---|---|---|
| `--color-paper` | `#FFFFFF` | Paper | Page background; the question card; text and fills on Midnight and Signal Blue |
| `--color-cloud` | `#F5F7FB` | Cloud | Cool neutral tiles (the week, HBCs), the registration page ground, nav hover |
| `--color-mist` | `#EDF2FF` | Mist | Blue-tinted tiles, notices, selected options, the current step, focus halo on fields; secondary text on Signal Blue |
| `--color-brand` | `#0B5CFF` | Signal Blue | Primary buttons, links, active and done states, one Mothers' Union tile and the registration band |
| `--color-brand-deep` | `#0841B8` | Deep Signal | Hover and pressed primary; a primary button while its post is on the way |
| `--color-night` | `#0A1433` | Midnight | Dark tiles, the help panel, and the footer on every public page |
| `--color-night-soft` | `#14224F` | Midnight soft | Hairlines on Midnight |
| `--color-sky` | `#A9C1FF` | Sky | Secondary text and links on Midnight. **Never on light grounds** |
| `--color-gold` | `#E0A63A` | Crest gold | The bell and small crest details on Midnight. **Never text on light grounds; never off Midnight** |
| `--color-ink` | `#0E1525` | Ink | Body text and headings; the current language in the switch |
| `--color-ink-muted` | `#535B6B` | Muted ink | Secondary text, hints, captions |
| `--color-line` | `#E4E7EE` | Hairline | Dividers and list rules (decorative) |
| `--color-line-strong` | `#80889A` | Control line | Input, option, language-switch and outline-button borders |
| `--color-error` | `#B42318` | | Validation errors |
| `--color-success` | `#1E7A46` | | Confirmations |

Measured contrast (WCAG 2.2):

| Pair | Ratio | Use |
|---|---|---|
| Ink on Paper / Cloud / Mist | 18.2 / 17.0 / 16.3 | Body text ✓ |
| Muted ink on Paper / Cloud / Mist | 6.8 / 6.4 / 6.1 | Secondary text ✓ |
| Signal Blue on Paper / Cloud / Mist | 5.3 / 4.9 / 4.7 | Links, times, accents ✓ |
| Paper on Signal Blue | 5.3 | Button labels, blue tiles ✓ |
| Paper on Deep Signal | 8.5 | Hover and busy labels ✓ |
| Paper on Midnight / Midnight soft | 18.1 / 15.3 | Text on dark tiles and the footer ✓ |
| Sky on Midnight / Midnight soft | 10.1 / 8.6 | Secondary text and links on dark ✓ |
| Gold on Midnight | 8.3 | Crest details on dark ✓ |
| Mist on Signal Blue | 4.7 | Secondary text on blue ✓ |
| Error on Paper / Mist | 6.6 / 5.9 | ✓ |
| Success on Paper | 5.3 | ✓ |
| Control line on Paper / Cloud / Mist | 3.6 / 3.3 / 3.2 | Control boundaries (WCAG 1.4.11) ✓ |
| Hairline on Paper | 1.2 | ✗ Decoration only, never the only boundary of a control |
| Signal Blue on Midnight | 3.4 | ✗ Never text on Midnight: use Sky or Paper |

Rules:
- **The Committed Field Rule.** Colour arrives as whole fields at page scale (the Midnight hero, the theme band, the ministries tiles, the Signal Blue registration band, the Midnight footer), not as scattered accents on white. Between them, sections breathe on white with hairlines.
- **The One Blue Pill Rule.** One solid Signal Blue pill per screen: on public pages it is the header's Register; on `/registration` it is the form's `btn-primary`, and the header's Register turns into an outlined pill marked as the current page. Secondary actions are outlined pills or text links with an arrow. On Midnight, Signal Blue or the photo, actions are paper pills (`btn-on-dark`), never blue on blue or blue on Midnight.
- **The Midnight Text Rule.** On Midnight, text is Paper or Sky and details are Gold. Signal Blue is never text there (3.4:1). Sky and Gold never appear on light grounds.
- **The Always-Dark Footer Rule.** The footer is Midnight on every public page, registration included.
- Status is never shown by colour alone: always an icon and words.
- Light theme only in Release 1 (outdoor readability). Tokens are CSS variables in `src/app/globals.css` (`@theme`, with Tailwind's default palette removed), so a dark theme can be added later.
- Automated contrast checks (axe in Playwright) run on every public page.

## 3. Typography

- **One family: Inter**, for titles and body alike, the face tihada.com uses (chosen by the user, #96). Weights 400 for body text and 500 for titles and buttons, nothing else. Straight only: no italics, and faked bold or italic is turned off (`font-synthesis: none`).
- Self-hosted with `next/font/local` (`src/app/(public)/fonts.ts`): two static files, each a Google Fonts subset to the characters English and Kiswahili use, about 19 KB together (kerning and tabular figures kept, other OpenType features dropped), preloaded with `font-display: swap` and a size-matched fallback. Licence in `src/app/fonts/README.md`.
- **The scale** (tokens in `globals.css`, used as `text-display`, `text-title` and so on). Seven steps and nothing in between; Tailwind's default sizes remain only for the staff portal.

| Token | Size | Weight | Line height | Tracking | Use |
|---|---|---|---|---|---|
| `display` | 40–72px | 500 | 1.04 | −0.04em | The hero's h1 only |
| `title` | 32–48px | 500 | 1.1 | −0.032em | Section titles (h2) and page titles (h1 on inner pages) |
| `subtitle` | 20–24px | 500 | 1.25 | −0.022em | Card and tile titles, sub-sections, registration questions, service times |
| `lead` | 18–20px | 400 | 1.5 | −0.014em | The paragraph under a title |
| `body` | 17px, 18px from `sm` | 400 | 1.6 | −0.011em | Running text (never below 16px) |
| `card` | body − 1px | 400 | 1.55 | −0.011em | Text inside cards, tiles and panels |
| `button` | body − 1px | 500 | 1.25 | −0.006em | Button labels; inside a card (`.in-card`) card text − 1px |
| `small` | 14px | 400 | 1.45 | −0.004em | Verse references, the language switch, footer links |

- Service times use the `subtitle` step but shrink with their list's width (container units) so the longest Kiswahili time stays on one line; that is the only size that flexes outside the scale. The six-digit code field is letter-spaced (0.3em) for legibility: the one deliberate exception to tighter tracking.
- Line length 60–70 characters on wide screens. Titles balance their lines (`text-wrap: balance`); paragraphs avoid a lone last word (`text-wrap: pretty`). Test every title in both languages at 360px.
- Tabular figures for references, FWO numbers, times and dates.

## 4. Layout and responsiveness

Mobile first: design at **360 × 800** before anything else.

| Breakpoint | Width | Changes |
|---|---|---|
| Base | 0–599px | Single column; tiles stack; full-width buttons; side gutter 16px |
| `sm` | 600px | Larger phones and small tablets; side gutter 24px, tile gap 16px, more generous padding |
| `md` | 900px | Tiles pair in two columns; the navigation row under the lockup moves inline beside it, with the header's Register pill |
| `lg` | 1200px | The 12-column grid; side gutter 40px; content max width 85rem (1360px), centred |

- **The hero** is one Midnight tile across the full grid: the photo, the welcome, one line under it and one action ("Join us this Sunday"). Nothing else shares it (#96). On phones the welcome comes first on Midnight and the photo follows inset in the same tile, never under text.
- **Sections** are 96px apart (144px from `md`): Sunday services and the week, the theme of the year on its own Midnight band, about, ministries and HBCs, the registration band, visit. Titles take 4 columns and lists 8 (services), or 7/5 and 5/7 splits elsewhere. Tiles are 28px-radius, 12px apart (16px from `sm`).
- **The Unbreakable Time Rule.** Service and weekly times never wrap (`whitespace-nowrap`). The Sunday list is one grid (rows are subgrids), so every service name lines up beside the widest time; the list is a container and sizes its times with container units (`cqi`) so the longest Kiswahili time fits on one line at 360px, and with enlarged text a range can only fold at its dash. The week is hairline rows (day, time, what happens), never a seven-column strip. Test both languages at 360px.
- **Forms stay single column at every size.** The question sits in a white card (28px radius from `sm`) on a Cloud page that runs down to the footer. From `lg` the card takes 7 columns and a sticky side column takes 4: the step rail (every step by name, done, current or still to come) and the Midnight help panel. Below `lg` the step rail gives way to a segmented progress bar under "Step N of M". Staff pages and narrow forms keep the 34rem form width; legal pages the 42rem prose width.
- Touch targets at least 44 × 44px, and primary controls (buttons, inputs, options) at least 48px tall. A small control may look smaller if its tap area still reaches 44px: the language switch is a 32px pill whose buttons each take 44 × 44px. Leave 8px between separate targets.
- Shapes: pill buttons (`rounded-full`); 12px on inputs, options and notices; 16px on review lists and the reference panel; 20px on the inset photo on phones; 28px on tiles and the question card; 32px on the registration band.
- Respect `prefers-reduced-motion`; motion is subtle and never blocks input (§8).
- Safe-area padding for phones with notches (`viewport-fit=cover`).
- Test viewports in Playwright: 360×800 (low-end Android), 375×667 (small iPhone), 768×1024 (tablet), 1280×800 (laptop).

## 5. Imagery

- Real photographs of this congregation, the church building and Mombasa, used with consent. No stock photos of strangers.
- The homepage may carry one hero photograph, of the church building with no people in it, on top of the 200 KB budget (D46). WebP, one file per screen class chosen by CSS width: at most 35 KB on phones (up to 600px), 60 KB on tablets (up to 1100px) and 110 KB on laptops and larger. Serve it with `<picture>` and `media` sources, not `srcset` width descriptors, so a high-density phone still gets the phone file. It is the only large image on the site.
- Where text sits on the photo, a Midnight gradient shades the lower part so paper text keeps its contrast on the white walls.
- Registration and voting pages carry no large images.
- Images are pre-optimised and served as static files (no `next/image` on Cloudflare).

## 6. Page character

| Page | Character |
|---|---|
| Landing `/` | Warm and expressive. Crest and parish name; a hero with the welcome and one action (Register lives in the header); Sunday services and the week straight after; then the theme of the year, about, ministries and HBCs, registration, visit us |
| Registration `/registration` | Quiet and reassuring. One question per step on mobile, a visible progress indicator, plain words, a "Why we ask" note beside phone and consent |
| Status `/registration/status` | Minimal: phone, FWO, code, answer |
| Vote `/vote` | Calm and unmistakable. Schedule when closed; when open, one position per screen, a review screen, then a clear "Your vote has been recorded" |
| Admin | Dense but legible; built for officers on phones at a desk. Not a generic SaaS dashboard |

## 7. Inspiration and what we take from it

- **tihada.com.** Kenyan identity through a local skyline silhouette; "how it works" as short numbered steps; plain promises such as "no account needed"; FAQ in everyday language; Inter throughout. *Take:* its typeface, Inter, for everything (#96); "Register in 3 steps"; plain reassurances.
- **ardia.dev.** Warm paper-toned background; one painterly illustration that gives the site a personality; an honest FAQ ("Fair questions") and plainly written privacy notes. *Take:* the honesty of its notes and a "Fair questions" section on registration: why we need your phone number, where your details are stored, who can see them. Not its illustration: the homepage photo is our one large image (D46, §5).
- **kurax.vercel.app** (the main reference, #80, kept in #96). Clean white space, confident headings over a plain sans, pill buttons, hairline borders, bold coloured tiles. *Take:* that restraint and rhythm, with Signal Blue in place of its purple. Plain numerals (1, 2, 3) only where the sequence matters, such as the registration steps; never zero-padded counters as decoration. Not its fintech imagery, mock-ups or copy.
- **siteinspire.com.** A gallery to browse. When a site is used as a reference, add it here with one line on what specifically to take from it.

Take ideas, not assets: no copying another site's illustrations, layouts or copy.

## 8. Components

The shared controls are classes in `src/app/globals.css` (`@layer components`). Use them; don't restyle a control locally. The rules they follow are in §2 (one blue pill per screen, Midnight text) and §4 (shapes and target sizes); this section records what each looks like and its states.

| Class | What it is | States |
|---|---|---|
| `btn-primary` | Solid Signal Blue pill, 48px tall, with a paper label: the action the step exists for | Hover and pressed: Deep Signal. Busy: Deep Signal at full strength with a spinner. Disabled: 60% opacity, not-allowed cursor. Focus: the 3px brand outline |
| `btn-secondary` | Paper pill with a Control line border and an ink label | Hover: ink border. Disabled and focus as primary |
| `btn-on-dark` | Paper pill with a Midnight label, for Midnight, Signal Blue and the photo | Hover: Mist fill. Focus: the outline turns paper |
| `btn-text` | Label only, 48px tall, for "Back" and low-stakes actions | Hover: Signal Blue |
| `field` | Text input: 56px tall, 12px radius, Control line border, ink text, muted placeholder | Hover: ink border. Focus: brand border, a 4px Mist halo and the outline. `aria-invalid="true"`: error border, with the message below in error red |
| `option` | Radio or checkbox card: the whole card is the target | Hover: ink border. Checked: brand border on Mist |
| `spinner` | A ring in the current colour with one clear quarter, about 1.1em | Spins; holds still at 60% under reduced motion |

- **The Answered Press Rule.** Every button settles by 2% while pressed (150ms). A submit button shows a spinner and `aria-busy` while its own server action posts; the other buttons are disabled and the question dims to 55% so nothing is sent twice. Links into `/registration` use `PendingLink` (`src/components/pending-link.tsx`), still a plain `<a>` for Turnstile's CSP, which shows a spinner until the next page arrives and clears it on Back. The language switch shows a spinner in place of the chosen code, keeping the pill's width. Without JavaScript all of these are ordinary links and buttons.
- **Header Register pill** (`src/components/site-header.tsx`): from `md`, the site's one solid Signal Blue pill, 44px tall (a navigation control, so the 44px target rule applies rather than the 48px primary-control height), beside the navigation. On `/registration` (`onRegistration`) it is outlined in Signal Blue with `aria-current="page"`. On phones it is a blue underlined link at the end of the navigation row.
- **Header navigation:** plain links with no JavaScript, in muted ink, turning ink with a Cloud pill behind on hover from `md`. On phones they sit in a row under the lockup that wraps rather than scrolls. Links to `/registration` are plain `<a>`, never `<Link>` (Turnstile's CSP, see CLAUDE.md).
- **Language switch** (`src/components/language-switch.tsx`): a small two-part pill with a Control line border that looks 32px tall, while each button's tap area reaches 44 × 44px (§4). The current language is an ink fill with paper text. The visible codes "EN"/"SW" stay in each button's accessible name with the full name ("SW Kiswahili"), so voice control can say what it sees.
- **Tiles:** 28px radius, padding 24px (32px from `sm`), no border. Midnight tiles carry paper headings and Sky text, with Midnight soft hairlines; Signal Blue tiles carry paper headings and Mist text; Mist and Cloud tiles carry ink and muted ink, with Signal Blue for a verse or detail. Lists inside a tile use hairlines, not nested cards. Tile titles use the `subtitle` step and tile text the `card` step, always smaller than the section title above them.
- **Sunday services list:** hairline rows on white: the time in Inter 500 (never breaking inside a time), then the service name in muted ink. No language chips: each name already says its language.
- **Question card:** the one raised surface: Paper on Cloud with a hairline border and a soft, Midnight-tinted two-layer shadow. Everything else is flat; depth comes from field colour, not shadow.
- **Step rail and progress:** the rail is a Paper panel listing every step; done steps show a check on a Signal Blue disc, the current step a Signal Blue ring on a Mist row, later steps a Control line ring. Phones and tablets get a segmented bar (Signal Blue done, Hairline to come) under "Step N of M" in Signal Blue.
- **Help panel:** Midnight, beside the card from `lg`, with the church office's number as a paper link underlined in Sky.
- **Notices:** Mist panels with ink text and a Signal Blue info icon. A field's error is a message in error red under the field with an alert icon; an error for the whole form is a lightly red-tinted panel with a red border and `role="alert"`. "Why we ask" notes are disclosures on Cloud with a hairline border and a blue plus that turns to a cross. The words always say what went wrong, never colour alone.
- **Icons:** drawn by hand as inline SVG on a 24px grid with a 1.75 stroke, round caps and joins, in the current colour, `aria-hidden` beside words that carry the meaning. No icon library, no icon font, no emoji or unicode glyphs as icons.
- **Motion:** the homepage's one authored moment is the hero settling: the tile rises 14px into place (700ms, `cubic-bezier(0.16, 1, 0.3, 1)`) while the photo eases from a 6% zoom (1400ms). Transform only, so nothing ever starts hidden; all of it, spinners included, stops under reduced motion. Elsewhere motion is state feedback only (150–300ms colour and press transitions).

## 9. Design tools

Impeccable (`.claude/skills/impeccable/`, #85) is the design skill for this site. It can send work to its own online service, so:

- **Point it only at public pages showing synthetic data:** the homepage, registration, status and vote with test data. Never at the staff portal (`admin.`), the officer desk, or any page or screenshot that could show a member's name, phone number or FWO number (CLAUDE.md rule 2).
- **Saved reports and telemetry stay off.** `.impeccable/config.json` (committed) sets `reports.enabled: false`, so critiques and audits are never uploaded with their screenshots, and `telemetry: false`. Don't change them: the service has no data processing agreement with the church.
- Image generation (`generate-image --ref`) takes a screenshot as a reference: the same rule applies to what that screenshot shows.

## 10. Design rules

The user's rules for every screen (#96). Check each change against them, in review as well as in the build. The second column says how this codebase keeps each one.

| # | Rule | How we keep it |
|---|---|---|
| 1 | Use a small, consistent type scale. | Seven tokens in `globals.css` (§3); no arbitrary `text-[…]` sizes on public pages, except the service times' container sizing (§3) |
| 2 | Make card titles smaller than section titles. | Section titles `text-title`; card and tile titles `text-subtitle` |
| 3 | Use 400 for body text and 400 or 500 for titles. | Only Inter 400 and 500 ship; titles and buttons are 500 |
| 4 | Straight titles. No italics. | No italic files; `font-synthesis: none`; `font-style: normal` on h1–h3 |
| 5 | Card text, 1px smaller than similar text outside cards. | `text-card` = body − 1px inside cards, tiles and panels |
| 6 | Button text, 1px smaller than the surrounding text. | `text-button` = body − 1px; inside `.in-card` it is card text − 1px |
| 7 | The larger the font, the tighter the letter spacing. | Tracking runs from −0.004em (`small`) to −0.04em (`display`) |
| 8 | Tight line height on large titles. | 1.04 on `display`, 1.1 on `title`, 1.25 on `subtitle` |
| 9 | Leave breathing room between sections. | 96px between sections, 144px from `md` (§4) |
| 10 | Balance titles that span multiple lines. No orphan words on the last line. | `text-wrap: balance` on h1–h3; `text-wrap: pretty` on paragraphs |
| 11 | Remove decorative labels, badges, and redundant buttons. | No eyebrows or kickers, no photo badge, no language chips, no second Register in the hero (the header has it) |
| 12 | One sans serif for body text and a single family for all titles. | Inter for both |
| 13 | Real, high-quality photos are better. | Real photographs of this church and congregation only, with consent (§5); no stock, no illustration standing in |

