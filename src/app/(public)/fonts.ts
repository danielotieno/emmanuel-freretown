import localFont from "next/font/local";

/*
 * The site's one face (DESIGN.md §3): Inter, for titles and body alike, as on tihada.com (#96).
 * Self-hosted: no request leaves our domain. SIL Open Font License 1.1 (src/app/fonts/README.md).
 * Two static weights, 400 for body text and 500 for titles and buttons, each subset to the
 * characters English and Kiswahili need and to kerning and tabular figures (about 9.5 KB each),
 * to keep first load under 200 KB (NFR-2). next/font preloads them and adds a size-matched
 * fallback, so text doesn't jump when they arrive.
 */
export const inter = localFont({
  src: [
    { path: "../fonts/inter-400.woff2", weight: "400", style: "normal" },
    { path: "../fonts/inter-500.woff2", weight: "500", style: "normal" },
  ],
  display: "swap",
  variable: "--font-inter",
  fallback: ["system-ui", "-apple-system", "Segoe UI", "Arial", "sans-serif"],
});
