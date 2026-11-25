# Design System

Visual rules for ackemmanuelfreretown.org. Read with `PRODUCT.md`. Reference files are in `docs/design/references/`.

## 1. Identity

- **Crest.** The Diocese of Mombasa coat of arms: bishop's mitre with gold lappets above a shield with the red cross of St George on silver, over a blue sea bearing a gold anchor and crozier. The scan in `docs/design/references/diocese-crest-scan.jpg` is a placeholder only: its colours are faded and the edges are soft. Obtain the official vector (SVG or high-resolution PNG) from the Diocese office and confirm the parish may use it. Do not trace, redraw or recolour the crest. The one exception is the placeholder below, whose faded colour was lifted slightly until the official file replaces it (#87).
- **Parish lockup.** Crest at small size beside "ACK Emmanuel" in the display face, with "Freretown - Kengeleni" beneath in small muted text (`src/components/site-header.tsx`). Until the official file arrives, the site uses `src/components/crest.webp`, cut from the scan with its colour lifted slightly (#80). If the parish has its own emblem, it takes this place and the crest moves to the footer.
- **Motifs drawn from the crest**, used sparingly as lightweight SVG: a single wave line (the sea) as a section divider; the anchor as a small mark for "hope" and for the Freretown coast. Never use the cross or mitre as decoration.

## 2. Colour

Clean white pages, Ocean Blue for action, and two calm panel tints: the coast at Mombasa. Agreed with the technical lead on 25 Nov 2026 (#80). It replaces the first palette (Persian Blue, Vista Blue, Cornsilk; `docs/design/references/palette.jpeg`), which no longer appears in the interface.

| Token | Hex | Name | Role |
|---|---|---|---|
| `--color-paper` | `#FFFFFF` | Paper | Page background |
| `--color-sand` | `#F7F5F0` | Sand | Warm neutral panels, the footer, progress track |
| `--color-lagoon` | `#E8F4F8` | Lagoon | Ocean-tinted panels, notices, selected options |
| `--color-brand` | `#0A5F86` | Ocean Blue | The crest's sea, deepened. Primary buttons, links, active states, accents in headings |
| `--color-brand-deep` | `#083F5A` | Deep Ocean | Hover on primary buttons; dark bands with paper text |
| `--color-gold` | `#E0A63A` | Crest gold | Small highlights and icons on dark backgrounds. **Never text on light backgrounds** |
| `--color-ink` | `#0F1A24` | Ink | Body text and headings |
| `--color-ink-muted` | `#55606B` | Muted ink | Secondary text, hints, captions |
| `--color-line` | `#E3E0D9` | Hairline | Card borders and dividers (decorative) |
| `--color-line-strong` | `#8A939C` | Control line | Input, checkbox-card and outline-button borders |
| `--color-error` | `#B42318` | | Validation errors |
| `--color-success` | `#1E7A46` | | Confirmations |

Measured contrast (WCAG 2.2):

| Pair | Ratio | Use |
|---|---|---|
| Ink on Paper / Sand / Lagoon | 17.6 / 16.2 / 15.7 | Body text ✓ |
| Muted ink on Paper / Sand / Lagoon | 6.4 / 5.9 / 5.7 | Secondary text ✓ |
| Ocean Blue on Paper / Sand / Lagoon | 7.0 / 6.4 / 6.3 | Links, accents ✓ |
| Paper on Ocean Blue | 7.0 | Button labels ✓ |
| Paper on Deep Ocean | 11.2 | Text on dark bands ✓ |
| Gold on Deep Ocean | 5.2 | Highlights on dark bands ✓ |
| Error on Paper / Lagoon | 6.6 / 5.9 | ✓ |
| Success on Paper | 5.4 | ✓ |
| Control line on Paper | 3.1 | Input boundaries (WCAG 1.4.11) ✓ |
| Hairline on Paper | 1.3 | ✗ Decoration only, never the only boundary of a control |

Rules:
- One primary action per screen: a solid Ocean Blue pill. Secondary actions are outlined pills or text links with an arrow.
- Status is never shown by colour alone: always an icon and words.
- Light theme only in Release 1 (outdoor readability). Tokens are CSS variables in `src/app/globals.css`, so a dark theme can be added later.
- Automated contrast checks (axe in Playwright) run on every public page.

## 3. Typography

- **Headings:** Instrument Serif, regular (400), slightly tight tracking (−0.02em). Editorial and calm; large sizes carry the personality, never bold weights.
- **Body and controls:** Instrument Sans, regular (400) only. The variable 400–600 file is nearly twice the size and took the pages over the 200 KB budget, so hierarchy comes from size, colour and the serif, never bold. Faked bold is turned off (`font-synthesis-weight: none`).
- Both are self-hosted with `next/font/local` (`src/app/(public)/fonts.ts`), subset to the characters English and Kiswahili use, about 27 KB together, preloaded with `font-display: swap` and a size-matched fallback. Licences in `src/app/fonts/README.md`.
- Body text 17px on mobile and 18px from `sm` (never below 16px), line height 1.6, line length 60–70 characters on wide screens.
- Fluid headings with `clamp()`; no heading so large that a Kiswahili phrase breaks awkwardly on a 360px screen. Test every heading in both languages.
- Tabular figures for references, FWO numbers, times and dates.

## 4. Layout and responsiveness

Mobile first: design at **360 × 800** before anything else.

| Breakpoint | Width | Changes |
|---|---|---|
| Base | 0–599px | Single column; full-width buttons; sticky primary action on long forms |
| `sm` | 600px | Larger phones and small tablets; more generous spacing |
| `md` | 900px | Landing page may use two columns; the navigation row under the lockup moves inline beside it |
| `lg` | 1200px | Content max width about 1120px, centred |

- **Forms stay single column at every size**, max width about 34rem, even on desktop.
- Use container queries for cards (departments, HBCs, programmes) so they adapt to their column, not just the viewport.
- Touch targets at least 44 × 44px, and primary controls (buttons, inputs, options) at least 48px tall. A small control may look smaller if its tap area still reaches 44px: the language switch is a 32px pill whose buttons each take 44 × 44px. Leave 8px between separate targets.
- Shapes: pill buttons (`rounded-full`), 12px radius on inputs and options, 16–24px on panels. Shared classes `btn-primary`, `btn-secondary`, `btn-text`, `field` and `option` live in `globals.css`.
- Respect `prefers-reduced-motion`; motion is subtle and never blocks input.
- Safe-area padding for phones with notches (`viewport-fit=cover`).
- Test viewports in Playwright: 360×800 (low-end Android), 375×667 (small iPhone), 768×1024 (tablet), 1280×800 (laptop).

## 5. Imagery

- Real photographs of this congregation, the church building and Mombasa, used with consent. No stock photos of strangers.
- The homepage may carry one hero photograph, of the church building with no people in it, on top of the 200 KB budget (D46). WebP, one file per screen class chosen by CSS width: at most 35 KB on phones (up to 600px), 60 KB on tablets (up to 1100px) and 110 KB on laptops and larger. Serve it with `<picture>` and `media` sources, not `srcset` width descriptors, so a high-density phone still gets the phone file. It is the only large image on the site.
- Registration and voting pages carry no large images.
- Images are pre-optimised and served as static files (no `next/image` on Cloudflare).

## 6. Page character

| Page | Character |
|---|---|
| Landing `/` | Warm and expressive. Crest and parish name, service times immediately visible, two clear entry points (Register, Vote when open), then about, services, programmes and departments, HBC zones, visit us, contact |
| Registration `/registration` | Quiet and reassuring. One question per step on mobile, a visible progress indicator, plain words, a "Why we ask" note beside phone and consent |
| Status `/registration/status` | Minimal: phone, FWO, code, answer |
| Vote `/vote` | Calm and unmistakable. Schedule when closed; when open, one position per screen, a review screen, then a clear "Your vote has been recorded" |
| Admin | Dense but legible; built for officers on phones at a desk. Not a generic SaaS dashboard |

## 7. Inspiration and what we take from it

- **tihada.com.** Kenyan identity through a local skyline silhouette; "how it works" as short numbered steps; plain promises such as "no account needed"; FAQ in everyday language. *Take:* a Mombasa coastline or Freretown silhouette, "Register in 3 steps", plain reassurances.
- **ardia.dev.** Warm paper-toned background; one painterly illustration that gives the site a personality; an honest FAQ ("Fair questions") and plainly written privacy notes. *Take:* the warmth of its sand-toned panels and a "Fair questions" section on registration: why we need your phone number, where your details are stored, who can see them. Not its illustration: the homepage photo is our one large image (D46, §5).
- **kurax.vercel.app** (the main reference, #80). Clean white space, editorial serif headings over a plain sans, pill buttons, hairline borders, calm tinted panels, numbered steps (01, 02, 03). *Take:* that restraint and rhythm, with Ocean Blue in place of its purple. Not its fintech imagery, mock-ups or copy.
- **siteinspire.com.** A gallery to browse. When a site is used as a reference, add it here with one line on what specifically to take from it.

Take ideas, not assets: no copying another site's illustrations, layouts or copy.

## 8. Components

The shared controls are classes in `src/app/globals.css` (`@layer components`). Use them; don't restyle a control locally. The rules they follow are in §2 (one primary action per screen) and §4 (shapes and target sizes); this section records what each looks like and its states.

| Class | What it is | States |
|---|---|---|
| `btn-primary` | Solid Ocean Blue pill with a paper label: the action the page exists for | Hover: Brand Deep. Disabled: 60% opacity, not-allowed cursor. Focus: the 3px brand outline |
| `btn-secondary` | Paper pill with a `line-strong` border and an ink label | Hover: ink border. Disabled and focus as primary |
| `btn-text` | Label only, 48px tall, for "Back" and low-stakes actions | Hover: Ocean Blue |
| `field` | Text input: 52px tall, `line-strong` border, ink text, muted placeholder | Hover: ink border. Focus: brand border plus the outline. `aria-invalid="true"`: error border, with the message below in error red |
| `option` | Radio or checkbox card: the whole card is the target | Hover: ink border. Checked: brand border on lagoon |

- **Buttons on Brand Deep or over the photo** swap to a paper fill with a Brand Deep label (primary) and a paper outline (secondary), as on the homepage welcome. Contrast stays at least 4.5:1.
- **Language switch** (`src/components/language-switch.tsx`): a small two-part pill that looks 32px tall, while each button's tap area reaches 44 × 44px (§4). The current language is an ink fill with paper text. The visible codes "EN"/"SW" stay in each button's accessible name with the full name ("SW Kiswahili"), so voice control can say what it sees.
- **Notices:** lagoon panels with ink text. A field's error is a message in error red under the field; an error for the whole form is a lightly red-tinted panel with a red border and `role="alert"`. The words always say what went wrong, never colour alone.
- **Panels:** sand or lagoon, no shadow, rounded as in §4 (notices inside a form 12px). Lists inside a section use hairlines (`line`), not nested cards.
- **Header navigation** (`src/components/site-header.tsx`): plain links with no JavaScript. On phones they sit in a row under the lockup rather than behind a menu button. Links to `/registration` are plain `<a>`, never `<Link>` (Turnstile's CSP, see CLAUDE.md).

## 9. Design tools

Impeccable (`.claude/skills/impeccable/`, #85) is the design skill for this site. It can send work to its own online service, so:

- **Point it only at public pages showing synthetic data:** the homepage, registration, status and vote with test data. Never at the staff portal (`admin.`), the officer desk, or any page or screenshot that could show a member's name, phone number or FWO number (CLAUDE.md rule 2).
- **Saved reports and telemetry stay off.** `.impeccable/config.json` (committed) sets `reports.enabled: false`, so critiques and audits are never uploaded with their screenshots, and `telemetry: false`. Don't change them: the service has no data processing agreement with the church.
- Image generation (`generate-image --ref`) takes a screenshot as a reference: the same rule applies to what that screenshot shows.
