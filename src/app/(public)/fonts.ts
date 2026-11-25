import localFont from "next/font/local";

/*
 * The site's two faces (DESIGN.md §3), self-hosted: no request leaves our domain. Both are under
 * the SIL Open Font License 1.1 (src/app/fonts/README.md). Each file is a Google Fonts subset to
 * the characters English and Kiswahili need, to keep first load under 200 KB (NFR-2). next/font
 * preloads them and adds a size-matched fallback, so text doesn't jump when they arrive.
 */

/** Headings: Instrument Serif, regular only. */
export const instrumentSerif = localFont({
  src: "../fonts/instrument-serif.woff2",
  weight: "400",
  style: "normal",
  display: "swap",
  variable: "--font-instrument-serif",
  fallback: ["Georgia", "Times New Roman", "serif"],
});

/**
 * Body and controls: Instrument Sans, regular only. The variable 400–600 file is nearly twice
 * the size and took the pages over 200 KB; hierarchy comes from size and colour instead.
 */
export const instrumentSans = localFont({
  src: "../fonts/instrument-sans.woff2",
  weight: "400",
  style: "normal",
  display: "swap",
  variable: "--font-instrument-sans",
  fallback: ["system-ui", "Arial", "sans-serif"],
});
