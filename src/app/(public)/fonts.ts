import localFont from "next/font/local";

/*
 * The site's two faces, one family (DESIGN.md §3): Instrument Serif for every title and
 * Instrument Sans for every other word, on the public site and the staff portal. Self-hosted: no request leaves our domain. SIL Open Font
 * License 1.1 (src/app/fonts/README.md). Each file is subset to the characters English and
 * Kiswahili need (about 27 KB together), to keep first load under 200 KB (NFR-2). next/font
 * preloads them and adds a size-matched fallback, so text doesn't jump when they arrive.
 */

/** Text: one variable file covering 400 (body) to 500 (buttons and labels). */
export const instrumentSans = localFont({
  src: [{ path: "../fonts/instrument-sans.woff2", weight: "400 500", style: "normal" }],
  display: "swap",
  variable: "--font-instrument-sans",
  fallback: ["system-ui", "-apple-system", "Segoe UI", "Arial", "sans-serif"],
});

/** Titles: the family's serif, which ships in one weight, 400. */
export const instrumentSerif = localFont({
  src: [{ path: "../fonts/instrument-serif-400.woff2", weight: "400", style: "normal" }],
  display: "swap",
  variable: "--font-instrument-serif",
  adjustFontFallback: "Times New Roman",
  fallback: ["Georgia", "Times New Roman", "serif"],
});
