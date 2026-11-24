# Design System

Visual rules for ackemmanuelfreretown.org. Read with `PRODUCT.md`. Reference files are in `docs/design/references/`.

## 1. Identity

- **Crest.** The Diocese of Mombasa coat of arms: bishop's mitre with gold lappets above a shield with the red cross of St George on silver, over a blue sea bearing a gold anchor and crozier. The scan in `references/diocese-crest-scan.jpg` is a placeholder only: its colours are faded and the edges are soft. Obtain the official vector (SVG or high-resolution PNG) from the Diocese office and confirm the parish may use it. Do not trace, redraw or recolour the crest.
- **Parish lockup.** Crest at small size beside "ACK Emmanuel Kengeleni-Freretown" set in the display face. If the parish has its own emblem, it takes this place and the crest moves to the footer.
- **Motifs drawn from the crest**, used sparingly as lightweight SVG: a single wave line (the sea) as a section divider; the anchor as a small mark for "hope" and for the Freretown coast. Never use the cross or mitre as decoration.

## 2. Colour

Brand palette (supplied):

| Token | Hex | Name | Role |
|---|---|---|---|
| `--color-paper` | `#FFFEF9` | Baby Powder | Default page background |
| `--color-cream` | `#FFF7D6` | Cornsilk | Warm section background, cards, highlighted notices |
| `--color-sky` | `#7A9CEF` | Vista Blue | Decorative fills, illustrations, large headline blocks, focus halo. **Never text on light backgrounds** |
| `--color-brand` | `#1330BE` | Persian Blue | Primary buttons, links, headings, active states |

Supporting colours (added to fill gaps in the palette; adjust only with contrast re-checked):

| Token | Hex | Role |
|---|---|---|
| `--color-ink` | `#101A3F` | Body text (a deep navy drawn from Persian Blue) |
| `--color-ink-muted` | `#4A5578` | Secondary text, hints, captions |
| `--color-gold` | `#E0A63A` | Accent from the crest's mitre and anchor: small highlights, icons on dark backgrounds, illustration. **Never text on light backgrounds** |
| `--color-error` | `#B42318` | Validation errors |
| `--color-success` | `#1E7A46` | Confirmations |

Measured contrast (WCAG 2.2):

| Pair | Ratio | Use |
|---|---|---|
| Ink on Paper | 16.75 | Body text ✓ |
| Ink on Cornsilk | 15.73 | Body text ✓ |
| Persian on Paper | 9.48 | Headings, links, buttons ✓ |
| Paper on Persian | 9.48 | Button labels ✓ |
| Persian on Cornsilk | 8.90 | ✓ |
| Ink-muted on Paper | 7.27 | Secondary text ✓ |
| Ink on Vista | 6.31 | Text on sky blocks ✓ |
| Ink on Gold | 7.80 | Badges ✓ |
| Error on Paper | 6.51 | ✓ |
| Success on Paper | 5.30 | ✓ |
| Persian on Vista | 3.57 | Large text (24px+, or 19px bold) and icons only |
| Vista on Paper | 2.66 | ✗ Decoration only |
| Gold on Paper | 2.15 | ✗ Decoration only |

Rules:
- One primary action per screen, in Persian Blue. Secondary actions are outlined or text links.
- Status is never shown by colour alone: always an icon and words.
- Light theme only in Release 1 (outdoor readability). Tokens are defined as CSS variables so a dark theme can be added later.
- Automated contrast checks (axe in Playwright) run on every public page.

## 3. Typography

- **Display face:** one warm serif with personality for headings and the landing page (direction: something like Fraunces). Self-hosted, Latin subset, WOFF2, at most one file around 40 KB, `font-display: swap`.
- **Body:** the system font stack. No download, fast on every phone, good Kiswahili rendering.
- Body text 17–18px on mobile (never below 16px), line height 1.5–1.6, line length 60–70 characters on wide screens.
- Fluid headings with `clamp()`; no heading so large that a Kiswahili phrase breaks awkwardly on a 360px screen. Test every heading in both languages.
- Tabular figures for references, FWO numbers, times and dates.

## 4. Layout and responsiveness

Mobile first: design at **360 × 800** before anything else.

| Breakpoint | Width | Changes |
|---|---|---|
| Base | 0–599px | Single column; full-width buttons; sticky primary action on long forms |
| `sm` | 600px | Larger phones and small tablets; more generous spacing |
| `md` | 900px | Landing page may use two columns; navigation expands from a menu to inline links |
| `lg` | 1200px | Content max width about 1120px, centred |

- **Forms stay single column at every size**, max width about 32rem, even on desktop.
- Use container queries for cards (departments, HBCs, programmes) so they adapt to their column, not just the viewport.
- Touch targets at least 48 × 48px with 8px between them.
- Respect `prefers-reduced-motion`; motion is subtle and never blocks input.
- Safe-area padding for phones with notches (`viewport-fit=cover`).
- Test viewports in Playwright: 360×800 (low-end Android), 375×667 (small iPhone), 768×1024 (tablet), 1280×800 (laptop).

## 5. Imagery

- Real photographs of this congregation, the church building and Mombasa, used with consent. No stock photos of strangers.
- One illustration may give the landing page its character: for example a painted Mombasa coastline or the church at Freretown, in the palette. Compressed WebP, under about 80 KB at mobile size, landing page only.
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
- **ardia.dev.** Warm paper-toned background; one painterly illustration that gives the site a personality; an honest FAQ ("Fair questions") and plainly written privacy notes. *Take:* the paper warmth (Baby Powder and Cornsilk), one hand-made illustration, and a "Fair questions" section on registration: why we need your phone number, where your details are stored, who can see them.
- **siteinspire.com.** A gallery to browse. When a site is used as a reference, add it here with one line on what specifically to take from it.

Take ideas, not assets: no copying another site's illustrations, layouts or copy.
