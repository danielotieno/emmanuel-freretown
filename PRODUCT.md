# Product Context

## What this is

The website and member platform of ACK Emmanuel Freretown - Kengeleni, an Anglican parish in Mombasa, Kenya. It has three public faces and one staff face:

- **Landing page** (`/`): who the church is, service times, programmes, departments and HBCs, how to join. The church's history has its own page (`/about`).
- **Registration** (`/registration`): adult members join the official register, or check their status.
- **Voting** (`/vote`): members vote in HBC, department and parish elections during short voting windows.
- **Admin** (`admin.` subdomain): the Secretary, Wardens and officers review registrations and run elections.

## Who uses it

- **Members of all ages from 18 up**, including many older members who are not confident online, use low-end Android phones, have limited data bundles and patchy connections, and may share a phone with family.
- **Kiswahili and English speakers.** Many members are more comfortable in Kiswahili. English is required in Release 1 and shown by default; Kiswahili is optional (D44) and one tap away: offer it where a translation exists, and design every screen so a Kiswahili phrase fits.
- **Church officers** (Secretary, Wardens, committee volunteers) using the admin side on phones at a registration desk in a church hall, sometimes with dozens of people waiting.

## What success feels like

- A grandmother completes registration on her own phone in under three minutes without asking for help.
- Members trust the site with their details because it looks and feels like their church, not like a generic app or a scam.
- On election day, voting is calm, obvious and quick, and nobody wonders whether their vote counted.
- An officer at a busy desk never loses a half-filled form.

## Tone and identity

- Warm, dignified, welcoming. A parish family, not a corporation.
- Anglican and East African in character: the church's own name, colours and photographs rather than stock imagery. Rooted in Mombasa.
- Plain words. Short sentences. One action per screen on public flows.
- The landing page may be expressive and joyful. Registration and voting must be quiet, clear and reassuring.

## Constraints

- Mobile first; design at 360px wide before anything else.
- Public pages under 200 KB on first load; usable on 3G. The homepage may add one hero photo of the church building on top, within D46's caps, and further lazy-loaded photos below the first screen (D46 as amended). Few web fonts, small images, no heavy animation on registration or voting.
- Minimum 16px body text, large tap targets, WCAG 2.2 AA contrast.
- Errors explained in words next to the field, in the member's language.
- Light theme for outdoor readability. Release 1 is light only (DESIGN.md §2); dark mode may come later.

## Avoid

- Generic SaaS dashboard looks, gradient-heavy "AI" aesthetics, and default component-library styling. Clean is the aim (DESIGN.md §7: kurax.vercel.app), but it must still feel like this church — the crest, its Signal Blue, black and white palette (DESIGN.md §2), real photographs — not like a tech product.
- Stock photos of strangers.
- Cleverness that slows people down on registration or voting screens.
- Anything that looks like it is asking for money or passwords.
